import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  findTelegramChatIdBackfillCandidates,
  loadUsersForBackfill,
  runTelegramChatIdBackfill,
} from "@/lib/server/backfillTelegramChatId";

export const runtime = "nodejs";

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

type Body = { dryRun?: boolean };

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Body = {};
  try {
    const raw = await req.json().catch(() => ({}));
    body = (raw && typeof raw === "object" ? raw : {}) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const dryRun = body.dryRun !== false;

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ error: "no_admin" }, { status: 503 });
  }

  const userDocs = await loadUsersForBackfill(db);
  const list = findTelegramChatIdBackfillCandidates(userDocs);
  const sample = list.slice(0, 5).map((c) => ({ uid: c.uid, telegramId: c.telegramId }));

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      candidates: list.length,
      sample,
      changed: 0,
    });
  }

  const changed = await runTelegramChatIdBackfill(db, list);
  return NextResponse.json({
    dryRun: false,
    candidates: list.length,
    sample,
    changed,
  });
}
