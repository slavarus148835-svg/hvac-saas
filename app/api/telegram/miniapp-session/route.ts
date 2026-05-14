import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  createTelegramMiniAppSession,
  findUserDocByTelegramId,
  normalizeTelegramUserIdForMiniApp,
  telegramMiniAppPublicProfileFromUserDoc,
} from "@/lib/server/telegram/telegramMiniAppSession";
import { verifyTelegramInitData } from "@/lib/server/telegram/verifyTelegramInitData";

export const runtime = "nodejs";

function hashClientIp(req: Request): string | undefined {
  const fwd = req.headers.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  const ip = first || req.headers.get("x-real-ip")?.trim();
  if (!ip) return undefined;
  return createHash("sha256").update(ip, "utf8").digest("hex");
}

export async function POST(req: Request) {
  console.log("TELEGRAM_MINIAPP_SESSION_START");
  try {
    let body: { initData?: string };
    try {
      body = (await req.json()) as { initData?: string };
    } catch {
      console.log("TELEGRAM_MINIAPP_SESSION_FAILED", { reason: "invalid_json" });
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const initData = typeof body.initData === "string" ? body.initData : "";
    const verified = verifyTelegramInitData(initData);
    if (!verified.ok) {
      console.log("TELEGRAM_MINIAPP_SESSION_FAILED", { reason: verified.error });
      return NextResponse.json({ ok: false, error: "invalid_init_data" }, { status: 401 });
    }

    const tgId = normalizeTelegramUserIdForMiniApp(verified.telegramUser.id);
    const chatKey =
      verified.chatId != null && Number.isFinite(verified.chatId)
        ? String(Math.trunc(verified.chatId)).replace(/\D/g, "")
        : null;

    const db = getAdminDb();
    if (!db) {
      console.log("TELEGRAM_MINIAPP_SESSION_FAILED", { reason: "no_firebase_admin" });
      return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
    }

    const doc = await findUserDocByTelegramId(db, tgId, chatKey);
    if (doc === "ambiguous") {
      console.log("AUTH_DUPLICATE_BLOCKED", { reason: "miniapp_session_ambiguous_telegram" });
      return NextResponse.json(
        { ok: false, authStatus: "duplicate_blocked", error: "telegram_lookup_ambiguous" },
        { status: 409 }
      );
    }
    if (!doc) {
      console.log("AUTH_TELEGRAM_NEEDS_EMAIL_LINKING", { telegramUserId: tgId });
      console.log("TELEGRAM_MINIAPP_SESSION_FAILED", {
        reason: "user_not_found",
        telegramUserId: tgId,
      });
      return NextResponse.json(
        {
          ok: false,
          need_email_linking: true,
          need_registration: true,
          authStatus: "need_email_linking",
        },
        { status: 404 }
      );
    }

    const ua = req.headers.get("user-agent");
    const ipHash = hashClientIp(req);

    const { sessionToken } = await createTelegramMiniAppSession(db, {
      uid: doc.id,
      telegramUserId: tgId,
      userAgent: ua,
      ipHash,
    });

    const profile = telegramMiniAppPublicProfileFromUserDoc(
      doc.id,
      doc.data() as Record<string, unknown>
    );

    console.log("AUTH_TRIAL_REUSE_EXISTING_USER", { uid: doc.id, source: "miniapp_session" });
    console.log("TELEGRAM_MINIAPP_SESSION_CREATED", {
      uid: doc.id,
      telegramUserId: tgId,
    });

    return NextResponse.json({
      ok: true,
      authStatus: "existing_user_by_telegram",
      sessionToken,
      profile: {
        uid: profile.uid,
        email: profile.email,
        plan: profile.plan,
        hasPaid: profile.hasPaid,
        blocked: profile.blocked,
        telegramUserId: profile.telegramUserId,
        telegramId: profile.telegramId,
        telegramUsername: profile.telegramUsername,
      },
    });
  } catch (e) {
    console.log("TELEGRAM_MINIAPP_SESSION_FAILED", {
      reason: "exception",
      message: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
