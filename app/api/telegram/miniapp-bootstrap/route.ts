import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getAdminApp, getAdminDb } from "@/lib/firebaseAdmin";
import { findUserByTelegramKeys } from "@/lib/server/authDuplicateGuards";
import {
  linkBlockedMessage,
  linkTelegramToEmailUid,
  markTelegramRegistrationSessionLinked,
  TELEGRAM_LINK_TOKEN_PREFIX,
  upsertTelegramRegistrationSession,
} from "@/lib/server/telegram/telegramLinkShared";
import { consumeTelegramLinkToken } from "@/lib/server/telegram/telegramLinkTokens";
import { evaluateMiniAppAccessGate } from "@/lib/server/telegram/evaluateMiniAppAccessGate";
import {
  createTelegramMiniAppSession,
  normalizeTelegramUserIdForMiniApp,
  telegramMiniAppPublicProfileFromUserDoc,
} from "@/lib/server/telegram/telegramMiniAppSession";
import { verifyTelegramInitData } from "@/lib/server/telegram/verifyTelegramInitData";
import { isFirestoreCapacityError } from "@/lib/server/statsUsersSnapshot";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";

export const runtime = "nodejs";
export const maxDuration = 60;

function hashClientIp(req: Request): string | undefined {
  const fwd = req.headers.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  const ip = first || req.headers.get("x-real-ip")?.trim();
  if (!ip) return undefined;
  return createHash("sha256").update(ip, "utf8").digest("hex");
}

function readStartParam(initData: string): string {
  try {
    return String(new URLSearchParams(initData).get("start_param") || "").trim();
  } catch {
    return "";
  }
}

function readAuthDateAgeSec(initData: string): number | null {
  try {
    const raw = new URLSearchParams(initData).get("auth_date");
    const authDate = Number(raw);
    if (!Number.isFinite(authDate)) return null;
    return Math.floor(Date.now() / 1000) - Math.trunc(authDate);
  } catch {
    return null;
  }
}

function publicProfilePayload(uid: string, data: Record<string, unknown>) {
  const profile = telegramMiniAppPublicProfileFromUserDoc(uid, data);
  return {
    uid: profile.uid,
    email: profile.email,
    plan: profile.plan,
    hasPaid: profile.hasPaid,
    blocked: profile.blocked,
    telegramUserId: profile.telegramUserId,
    telegramId: profile.telegramId,
    telegramUsername: profile.telegramUsername,
  };
}

function bootstrapErrorResponse(
  status: number,
  error: string,
  message: string
): NextResponse {
  return NextResponse.json({ ok: false, error, message }, { status });
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  console.log("TG_MINIAPP_BOOTSTRAP_START");

  try {
    const app = getAdminApp();
    const db = getAdminDb();
    if (!app || !db) {
      console.log("TG_MINIAPP_BOOTSTRAP_ERROR", { error: "server_misconfigured" });
      return bootstrapErrorResponse(
        503,
        "server_misconfigured",
        "Сервис временно недоступен. Попробуйте позже."
      );
    }

    let body: { initData?: string; linkToken?: string };
    try {
      body = (await req.json()) as { initData?: string; linkToken?: string };
    } catch {
      console.log("TG_MINIAPP_BOOTSTRAP_ERROR", { error: "invalid_json" });
      return bootstrapErrorResponse(400, "invalid_json", "Некорректный запрос.");
    }

    const initData = typeof body.initData === "string" ? body.initData.trim() : "";
    console.log("TG_MINIAPP_INITDATA_RECEIVED", {
      hasInitData: initData.length > 0,
      initDataLength: initData.length,
      authDateAgeSec: initData ? readAuthDateAgeSec(initData) : null,
    });

    if (!initData) {
      return bootstrapErrorResponse(
        400,
        "missing_init_data",
        "Нет данных Telegram. Откройте Mini App из бота."
      );
    }

    const verified = verifyTelegramInitData(initData);
    if (!verified.ok) {
      console.log("TG_MINIAPP_BOOTSTRAP_ERROR", {
        error: verified.error,
        stage: "initdata_invalid",
      });
      return bootstrapErrorResponse(
        401,
        verified.error,
        verified.error === "auth_date_expired"
          ? "Сессия Telegram устарела. Закройте Mini App и откройте снова из бота."
          : "Ошибка проверки Telegram-сессии."
      );
    }

    console.log("TG_MINIAPP_INITDATA_VALID", {
      telegramUserId: verified.telegramUser.id,
      chatId: verified.chatId,
    });

    const tgId = normalizeTelegramUserIdForMiniApp(verified.telegramUser.id);
    const chatKey =
      verified.chatId != null && Number.isFinite(verified.chatId)
        ? String(Math.trunc(verified.chatId)).replace(/\D/g, "")
        : null;

    const startParam = readStartParam(initData);
    let linkRaw = typeof body.linkToken === "string" ? body.linkToken.trim() : "";
    if (!linkRaw && startParam.toLowerCase().startsWith(TELEGRAM_LINK_TOKEN_PREFIX)) {
      linkRaw = startParam.slice(TELEGRAM_LINK_TOKEN_PREFIX.length);
    }

    const ua = req.headers.get("user-agent");
    const ipHash = hashClientIp(req);

    if (linkRaw) {
      console.log("TELEGRAM_LINK_START", { telegramUserId: tgId });
      const consumed = await consumeTelegramLinkToken(db, linkRaw);
      if (!consumed.ok) {
        const msg =
          consumed.reason === "used"
            ? "Ссылка для привязки уже использована. Создайте новую в личном кабинете на сайте."
            : consumed.reason === "expired"
              ? "Ссылка для привязки истекла. Создайте новую в личном кабинете."
              : "Ссылка для привязки недействительна.";
        return bootstrapErrorResponse(410, consumed.reason, msg);
      }

      const linked = await linkTelegramToEmailUid(db, app, {
        targetUid: consumed.uid,
        telegramUser: verified.telegramUser,
        chatId: verified.chatId,
        registrationSource: "web",
      });

      if (!linked.ok) {
        const blockedReason =
          linked.reason === "telegram_bound_elsewhere" ? "merge_conflict" : linked.reason;
        return bootstrapErrorResponse(
          409,
          blockedReason,
          linkBlockedMessage(blockedReason)
        );
      }

      const userSnap = await db.collection(PRICING_FS.users).doc(consumed.uid).get();
      const { sessionToken } = await createTelegramMiniAppSession(db, {
        uid: consumed.uid,
        telegramUserId: tgId,
        userAgent: ua,
        ipHash,
      });

      const sessionId = `mlink_${tgId}_${consumed.uid.slice(0, 8)}`;
      await markTelegramRegistrationSessionLinked(db, sessionId, consumed.uid, consumed.email).catch(
        () => null
      );

      console.log("TG_MINIAPP_BOOTSTRAP_SUCCESS", {
        uid: consumed.uid,
        telegramUserId: tgId,
        authStatus: "linked_existing_email",
        durationMs: Date.now() - startedAt,
      });

      return NextResponse.json({
        ok: true,
        authStatus: "linked_existing_email",
        sessionToken,
        linkedUid: consumed.uid,
        email: consumed.email,
        profile: publicProfilePayload(
          consumed.uid,
          (userSnap.data() ?? {}) as Record<string, unknown>
        ),
      });
    }

    const lookupStarted = Date.now();
    const lookup = await findUserByTelegramKeys(db, tgId, chatKey);
    console.log("TG_MINIAPP_USER_FOUND", {
      kind: lookup.kind,
      lookupMs: Date.now() - lookupStarted,
      telegramUserId: tgId,
    });

    if (lookup.kind === "ambiguous") {
      console.log("TG_MINIAPP_BOOTSTRAP_ERROR", {
        error: "telegram_lookup_ambiguous",
        ids: lookup.ids,
      });
      return bootstrapErrorResponse(
        409,
        "telegram_lookup_ambiguous",
        "Найдено несколько аккаунтов с этим Telegram. Напишите в поддержку."
      );
    }

    if (lookup.kind === "found") {
      const doc = lookup.doc;
      const userData = doc.data() as Record<string, unknown>;
      const access = evaluateMiniAppAccessGate(doc.id, userData);
      const { sessionToken } = await createTelegramMiniAppSession(db, {
        uid: doc.id,
        telegramUserId: tgId,
        userAgent: ua,
        ipHash,
      });

      console.log("TG_MINIAPP_SESSION_CREATED", { uid: doc.id, telegramUserId: tgId });
      console.log("TG_MINIAPP_BOOTSTRAP_SUCCESS", {
        uid: doc.id,
        authStatus: "existing_user_by_telegram",
        durationMs: Date.now() - startedAt,
      });

      return NextResponse.json({
        ok: true,
        authStatus: "existing_user_by_telegram",
        sessionToken,
        accessAllowed: access.allowed,
        accessGate: access.reason,
        emailVerifiedByCode: access.emailVerifiedByCode,
        profile: publicProfilePayload(doc.id, userData),
      });
    }

    const pending = await upsertTelegramRegistrationSession(db, {
      telegramUser: verified.telegramUser,
      chatId: verified.chatId,
    });

    console.log("TG_MINIAPP_BOOTSTRAP_SUCCESS", {
      authStatus: "pending_email_registration",
      pendingSessionId: pending.sessionId,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      ok: true,
      authStatus: "pending_email_registration",
      pendingSessionId: pending.sessionId,
      telegramConfirmed: true,
      telegramUserId: tgId,
    });
  } catch (e) {
    const stack = e instanceof Error ? e.stack : undefined;
    const firestoreCapacity = isFirestoreCapacityError(e);
    console.log("TG_MINIAPP_BOOTSTRAP_ERROR", {
      firestoreCapacity,
      message: e instanceof Error ? e.message : String(e),
      stack,
      durationMs: Date.now() - startedAt,
    });

    if (firestoreCapacity) {
      return bootstrapErrorResponse(
        503,
        "firestore_quota",
        "Сервис временно перегружен. Попробуйте позже."
      );
    }

    return bootstrapErrorResponse(
      500,
      "internal_error",
      "Не удалось войти через Telegram. Попробуйте снова."
    );
  }
}
