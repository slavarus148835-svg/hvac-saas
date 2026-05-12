import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { verifyTelegramInitData } from "@/lib/server/telegram/verifyTelegramInitData";

export const runtime = "nodejs";

function normalizeTelegramUserId(id: number): string {
  return String(Math.trunc(id)).replace(/\D/g, "");
}

function publicProfile(uid: string, data: Record<string, unknown>) {
  return {
    uid,
    email: typeof data.email === "string" ? data.email : null,
    plan: typeof data.plan === "string" ? data.plan : null,
    hasPaid: data.hasPaid === true,
    blocked: data.blocked === true,
    telegramUserId:
      typeof data.telegramUserId === "string" ? data.telegramUserId : null,
    telegramId: typeof data.telegramId === "string" ? data.telegramId : null,
    telegramUsername:
      typeof data.telegramUsername === "string" ? data.telegramUsername : null,
  };
}

export async function POST(req: Request) {
  console.log("TELEGRAM_MINIAPP_AUTH_START");
  try {
    let body: { initData?: string };
    try {
      body = (await req.json()) as { initData?: string };
    } catch {
      console.log("TELEGRAM_MINIAPP_AUTH_FAILED", { reason: "invalid_json" });
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const initData = typeof body.initData === "string" ? body.initData : "";
    const verified = verifyTelegramInitData(initData);
    if (!verified.ok) {
      console.log("TELEGRAM_MINIAPP_AUTH_FAILED", { reason: verified.error });
      return NextResponse.json({ error: "invalid_init_data" }, { status: 401 });
    }

    const tgId = normalizeTelegramUserId(verified.telegramUser.id);
    const db = getAdminDb();
    if (!db) {
      console.log("TELEGRAM_MINIAPP_AUTH_FAILED", { reason: "no_firebase_admin" });
      return NextResponse.json({ error: "server_misconfigured" }, { status: 503 });
    }

    const q1 = await db
      .collection(PRICING_FS.users)
      .where("telegramUserId", "==", tgId)
      .limit(5)
      .get();
    const q2 = await db
      .collection(PRICING_FS.users)
      .where("telegramId", "==", tgId)
      .limit(5)
      .get();

    const seen = new Set<string>();
    let doc: QueryDocumentSnapshot | null = null;
    for (const d of q1.docs) {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        doc = d;
        break;
      }
    }
    if (!doc) {
      for (const d of q2.docs) {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          doc = d;
          break;
        }
      }
    }

    if (!doc) {
      console.log("TELEGRAM_MINIAPP_USER_NOT_FOUND", { telegramUserId: tgId });
      console.log("TELEGRAM_MINIAPP_AUTH_OK", { outcome: "need_registration" });
      return NextResponse.json({ need_registration: true });
    }

    console.log("TELEGRAM_MINIAPP_USER_FOUND", { uid: doc.id, telegramUserId: tgId });
    const profile = publicProfile(doc.id, doc.data() as Record<string, unknown>);
    console.log("TELEGRAM_MINIAPP_AUTH_OK", { outcome: "profile", uid: doc.id });
    return NextResponse.json({ profile });
  } catch (e) {
    console.log("TELEGRAM_MINIAPP_AUTH_FAILED", {
      reason: "exception",
      message: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
