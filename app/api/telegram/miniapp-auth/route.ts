import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { findUserByTelegramKeys } from "@/lib/server/authDuplicateGuards";
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
    const chatKey =
      verified.chatId != null && Number.isFinite(verified.chatId)
        ? String(Math.trunc(verified.chatId)).replace(/\D/g, "")
        : null;

    const db = getAdminDb();
    if (!db) {
      console.log("TELEGRAM_MINIAPP_AUTH_FAILED", { reason: "no_firebase_admin" });
      return NextResponse.json({ error: "server_misconfigured" }, { status: 503 });
    }

    const lookup = await findUserByTelegramKeys(db, tgId, chatKey);
    if (lookup.kind === "ambiguous") {
      console.log("AUTH_DUPLICATE_BLOCKED", { reason: "miniapp_auth_ambiguous_telegram" });
      return NextResponse.json(
        { authStatus: "duplicate_blocked", error: "telegram_lookup_ambiguous" },
        { status: 409 }
      );
    }

    let doc: QueryDocumentSnapshot | null = null;
    if (lookup.kind === "found") {
      doc = lookup.doc;
    }

    if (!doc) {
      console.log("AUTH_TELEGRAM_NEEDS_EMAIL_LINKING", { telegramUserId: tgId });
      console.log("TELEGRAM_MINIAPP_USER_NOT_FOUND", { telegramUserId: tgId });
      console.log("TELEGRAM_MINIAPP_AUTH_OK", { outcome: "need_email_linking" });
      return NextResponse.json({
        need_email_linking: true,
        need_registration: true,
        authStatus: "need_email_linking",
      });
    }

    console.log("AUTH_DUPLICATE_FOUND_BY_TELEGRAM", { uid: doc.id, telegramUserId: tgId });
    console.log("AUTH_TRIAL_REUSE_EXISTING_USER", { uid: doc.id, source: "miniapp_auth" });
    console.log("TELEGRAM_MINIAPP_USER_FOUND", { uid: doc.id, telegramUserId: tgId });
    const profile = publicProfile(doc.id, doc.data() as Record<string, unknown>);
    console.log("TELEGRAM_MINIAPP_AUTH_OK", { outcome: "profile", uid: doc.id });
    return NextResponse.json({
      profile,
      authStatus: "existing_user_by_telegram",
    });
  } catch (e) {
    console.log("TELEGRAM_MINIAPP_AUTH_FAILED", {
      reason: "exception",
      message: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
