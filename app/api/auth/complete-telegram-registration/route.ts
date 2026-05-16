import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getAdminApp, getAdminDb } from "@/lib/firebaseAdmin";
import { normalizeEmailForAuth } from "@/lib/server/authDuplicateGuards";
import { requireBearerUid } from "@/lib/server/requireBearerUid";
import {
  getTelegramRegistrationSession,
  linkBlockedMessage,
  linkTelegramToEmailUid,
  markTelegramRegistrationSessionLinked,
} from "@/lib/server/telegram/telegramLinkShared";
import {
  createTelegramMiniAppSession,
  normalizeTelegramUserIdForMiniApp,
} from "@/lib/server/telegram/telegramMiniAppSession";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";

export const runtime = "nodejs";

function hashClientIp(req: Request): string | undefined {
  const fwd = req.headers.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  const ip = first || req.headers.get("x-real-ip")?.trim();
  if (!ip) return undefined;
  return createHash("sha256").update(ip, "utf8").digest("hex");
}

/**
 * POST /api/auth/complete-telegram-registration
 * После email-регистрации из Mini App — привязать pending Telegram-сессию к новому uid.
 */
export async function POST(req: Request) {
  const auth = await requireBearerUid(req);
  if (!auth.ok) {
    return NextResponse.json(auth.data, { status: auth.status });
  }

  const app = getAdminApp();
  const db = getAdminDb();
  if (!app || !db) {
    return NextResponse.json({ error: "no_admin" }, { status: 503 });
  }

  let body: { pendingSessionId?: string };
  try {
    body = (await req.json()) as { pendingSessionId?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const pendingSessionId = String(body.pendingSessionId ?? "").trim();
  if (!pendingSessionId) {
    return NextResponse.json({ error: "missing_pending_session" }, { status: 400 });
  }

  const pending = await getTelegramRegistrationSession(db, pendingSessionId);
  if (!pending || pending.status !== "pending_email_registration") {
    return NextResponse.json(
      { error: "pending_session_invalid", message: "Сессия Telegram устарела. Откройте Mini App из бота снова." },
      { status: 410 }
    );
  }

  const uid = auth.data.uid;
  const email = normalizeEmailForAuth(auth.data.email);

  const telegramUser = {
    id: Number(pending.telegramUserId),
    first_name: pending.telegramFirstName ?? undefined,
    last_name: pending.telegramLastName ?? undefined,
    username: pending.telegramUsername ?? undefined,
  };

  if (!Number.isFinite(telegramUser.id) || telegramUser.id <= 0) {
    return NextResponse.json({ error: "invalid_pending_telegram" }, { status: 400 });
  }

  const chatIdRaw = pending.telegramChatId ? Number(pending.telegramChatId) : null;
  const chatId =
    chatIdRaw != null && Number.isFinite(chatIdRaw) ? Math.trunc(chatIdRaw) : null;

  const linked = await linkTelegramToEmailUid(db, app, {
    targetUid: uid,
    telegramUser,
    chatId,
    registrationSource: "telegram_mini_app",
  });

  if (!linked.ok) {
    return NextResponse.json(
      {
        error: linked.reason,
        message: linkBlockedMessage(linked.reason),
      },
      { status: 409 }
    );
  }

  await db.collection(PRICING_FS.users).doc(uid).set(
    {
      authProvider: "email",
      registrationSource: "telegram_mini_app",
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  await markTelegramRegistrationSessionLinked(db, pendingSessionId, uid, email);

  const tgId = normalizeTelegramUserIdForMiniApp(telegramUser.id);
  const ua = req.headers.get("user-agent");
  const ipHash = hashClientIp(req);

  const { sessionToken } = await createTelegramMiniAppSession(db, {
    uid,
    telegramUserId: tgId,
    userAgent: ua,
    ipHash,
  });

  console.log("TELEGRAM_LINK_SUCCESS", {
    source: "complete_telegram_registration",
    linkedUid: uid,
    telegramUserId: tgId,
  });

  return NextResponse.json({
    ok: true,
    linkedUid: uid,
    email,
    sessionToken,
  });
}
