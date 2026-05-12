import { NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { sendTelegramMessage } from "@/lib/server/sendTelegramMessage";
import {
  buildBroadcastRecipients,
  type BroadcastRecipient,
} from "@/lib/server/telegramAudience";

export const runtime = "nodejs";

const BATCH_SIZE = 30;
const BATCH_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractSecret(req: Request): string {
  const header = String(req.headers.get("x-internal-debug-secret") || "").trim();
  if (header) return header;
  return String(req.headers.get("authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

function isAuthorized(req: Request): boolean {
  const provided = extractSecret(req);
  if (!provided) return false;
  const internal = String(process.env.INTERNAL_DEBUG_SECRET || "").trim();
  const admin = String(process.env.ADMIN_BROADCAST_SECRET || "").trim();
  const matchInternal = internal.length > 0 && provided === internal;
  const matchAdmin = admin.length > 0 && provided === admin;
  return matchInternal || matchAdmin;
}

function readBlockedError(
  result: Awaited<ReturnType<typeof sendTelegramMessage>>
): boolean {
  if (result.httpStatus === 403) return true;
  const err = String(result.error || "").toLowerCase();
  return (
    err.includes("blocked") ||
    err.includes("chat not found") ||
    err.includes("forbidden") ||
    err.includes("user is deactivated")
  );
}

async function markRecipientBlocked(
  db: Firestore,
  r: BroadcastRecipient
): Promise<void> {
  const updatedAt = new Date().toISOString();
  if (r.source === "user") {
    await db
      .collection(PRICING_FS.users)
      .doc(r.uid)
      .set({ telegramBlocked: true, updatedAt }, { merge: true });
    return;
  }
  await db
    .collection("telegramUsers")
    .doc(r.docId)
    .set({ telegramBlocked: true, updatedAt }, { merge: true });
}

type BroadcastBody = { text?: string };

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: BroadcastBody;
  try {
    body = (await req.json()) as BroadcastBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const text = String(body?.text || "").trim();
  if (!text) {
    return NextResponse.json({ error: "empty_text" }, { status: 400 });
  }

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ error: "no_admin" }, { status: 503 });
  }

  const [usersSnap, telegramUsersSnap] = await Promise.all([
    db.collection(PRICING_FS.users).where("telegramOptIn", "==", true).get(),
    db.collection("telegramUsers").where("telegramOptIn", "==", true).get(),
  ]);

  const targets = buildBroadcastRecipients(usersSnap.docs, telegramUsersSnap.docs);

  let sent = 0;
  let failed = 0;
  let blocked = 0;

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    for (const target of batch) {
      const result = await sendTelegramMessage(target.chatId, text);
      if (result.ok) {
        sent++;
        continue;
      }

      failed++;
      if (readBlockedError(result)) {
        blocked++;
        await markRecipientBlocked(db, target);
      }
    }
    if (i + BATCH_SIZE < targets.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return NextResponse.json({
    totalTargets: targets.length,
    sent,
    failed,
    blocked,
  });
}
