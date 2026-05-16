import type { Firestore } from "firebase-admin/firestore";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { isStatsExcludedTelegramProvisionUid } from "@/lib/server/statsExcludeTelegramProvisionUid";
import { firestoreTimeToMs } from "@/lib/server/firestoreTimeMs";
import {
  escapeTelegramHtml,
  sendTelegramNotification,
} from "@/lib/server/sendTelegramNotification";

export type AdminNewUserNotifySource = "web" | "telegram_mini_app";

export type NotifyAdminNewUserParams = {
  uid: string;
  email: string;
  source: AdminNewUserNotifySource;
  telegramUserId?: string | null;
  telegramUsername?: string | null;
  createdAt?: string | null;
};

export function resolveAdminNotificationChatId(): string {
  return String(
    process.env.TELEGRAM_CHAT_ID || process.env.ADMIN_TELEGRAM_CHAT_ID || ""
  ).trim();
}

export function adminNotificationEnvPresent(): {
  botTokenPresent: boolean;
  chatIdPresent: boolean;
} {
  return {
    botTokenPresent: Boolean(String(process.env.TELEGRAM_BOT_TOKEN || "").trim()),
    chatIdPresent: Boolean(resolveAdminNotificationChatId()),
  };
}

/** Какой env используется для chat_id (без значений). */
export function resolveAdminNotificationChatIdSource():
  | "TELEGRAM_CHAT_ID"
  | "ADMIN_TELEGRAM_CHAT_ID"
  | "none" {
  if (String(process.env.TELEGRAM_CHAT_ID || "").trim()) return "TELEGRAM_CHAT_ID";
  if (String(process.env.ADMIN_TELEGRAM_CHAT_ID || "").trim()) return "ADMIN_TELEGRAM_CHAT_ID";
  return "none";
}

/**
 * Привязка Telegram к давно созданному web-аккаунту — не новая регистрация.
 */
function isTelegramLinkToExistingAccount(user: Record<string, unknown>): boolean {
  const createdMs = firestoreTimeToMs(user.createdAt);
  const linkedMs = firestoreTimeToMs(user.telegramLinkedAt);
  if (createdMs <= 0 || linkedMs <= 0) return false;
  return linkedMs - createdMs > 5 * 60 * 1000;
}

export function buildAdminNewUserNotificationHtml(
  params: NotifyAdminNewUserParams
): string {
  const sourceLabel =
    params.source === "telegram_mini_app" ? "Telegram Mini App" : "Web";
  const email = escapeTelegramHtml(params.email || "—");
  const uid = escapeTelegramHtml(params.uid);
  const tgId = String(params.telegramUserId ?? "").replace(/\D/g, "");
  const username = String(params.telegramUsername ?? "")
    .trim()
    .replace(/^@/, "");
  let telegramLine = "—";
  if (username && tgId) {
    telegramLine = `@${escapeTelegramHtml(username)} (${escapeTelegramHtml(tgId)})`;
  } else if (username) {
    telegramLine = `@${escapeTelegramHtml(username)}`;
  } else if (tgId) {
    telegramLine = escapeTelegramHtml(tgId);
  }

  const createdMs = params.createdAt ? firestoreTimeToMs(params.createdAt) : 0;
  const date =
    createdMs > 0
      ? new Date(createdMs).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })
      : new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });

  return [
    "<b>🆕 Новый пользователь HVAC-SaaS</b>",
    "",
    `<b>Источник:</b> ${escapeTelegramHtml(sourceLabel)}`,
    `<b>Email:</b> <code>${email}</code>`,
    `<b>UID:</b> <code>${uid}</code>`,
    `<b>Telegram:</b> ${telegramLine}`,
    "",
    `<b>Дата:</b> ${escapeTelegramHtml(date)}`,
    "",
    "---------------------",
    "<i>hvac-saas</i>",
  ].join("\n");
}

export type NotifyAdminNewUserResult =
  | { sent: true }
  | { sent: false; skipped: string }
  | { sent: false; error: string };

/**
 * Идемпотентно: один раз на uid (поле telegramNotifiedAt в users/{uid}).
 */
export async function notifyAdminNewUserIfNeeded(
  db: Firestore,
  params: NotifyAdminNewUserParams
): Promise<NotifyAdminNewUserResult> {
  const uid = String(params.uid || "").trim();
  if (!uid) {
    console.log("ADMIN_NEW_USER_NOTIFY_ERROR", { reason: "missing_uid" });
    return { sent: false, error: "missing_uid" };
  }

  if (isStatsExcludedTelegramProvisionUid(uid)) {
    console.log("ADMIN_NEW_USER_NOTIFY_SKIPPED_PROVISION_USER", { uid });
    return { sent: false, skipped: "tg_provision_uid" };
  }

  const env = adminNotificationEnvPresent();
  if (!env.botTokenPresent || !env.chatIdPresent) {
    console.log("ADMIN_NEW_USER_NOTIFY_ERROR", {
      uid,
      reason: "missing_env",
      botTokenPresent: env.botTokenPresent,
      chatIdPresent: env.chatIdPresent,
    });
    return { sent: false, error: "missing_env" };
  }

  const userRef = db.collection(PRICING_FS.users).doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) {
    console.log("ADMIN_NEW_USER_NOTIFY_ERROR", { uid, reason: "user_doc_missing" });
    return { sent: false, error: "user_doc_missing" };
  }

  const user = snap.data() ?? {};
  if (user.telegramNotifiedAt) {
    return { sent: false, skipped: "already_notified" };
  }

  if (isTelegramLinkToExistingAccount(user)) {
    console.log("ADMIN_NEW_USER_NOTIFY_SKIPPED", {
      uid,
      reason: "telegram_linked_to_existing_account",
    });
    return { sent: false, skipped: "telegram_linked_to_existing_account" };
  }

  const email =
    String(params.email || user.email || "").trim() ||
    String(user.email || "").trim();
  const tgId =
    String(params.telegramUserId ?? user.telegramUserId ?? user.telegramId ?? "").replace(
      /\D/g,
      ""
    ) || null;
  const tgUsername =
    params.telegramUsername ??
    (typeof user.telegramUsername === "string" ? user.telegramUsername : null);

  const source: AdminNewUserNotifySource =
    params.source ||
    (user.registrationSource === "telegram_mini_app" ? "telegram_mini_app" : "web");

  console.log("ADMIN_NEW_USER_NOTIFY_START", { uid, source });

  const html = buildAdminNewUserNotificationHtml({
    uid,
    email,
    source,
    telegramUserId: tgId,
    telegramUsername: tgUsername,
    createdAt:
      params.createdAt ||
      (typeof user.createdAt === "string" ? user.createdAt : null),
  });

  const result = await sendTelegramNotification(html);
  const nowIso = new Date().toISOString();

  if (result.ok) {
    console.log("ADMIN_NEW_USER_NOTIFY_SENT", { uid, source });
    await userRef.set(
      {
        registrationStage: "telegram_sent",
        telegramNotifiedAt: nowIso,
        telegramNotifyError: null,
        lastRegistrationError: null,
        updatedAt: nowIso,
      },
      { merge: true }
    );
    return { sent: true };
  }

  const err =
    result.reason === "missing_env"
      ? "missing_env"
      : result.error || result.telegramDescription || "telegram_send_failed";

  console.log("ADMIN_NEW_USER_NOTIFY_ERROR", {
    uid,
    source,
    error: err,
    httpStatus: result.httpStatus,
  });

  await userRef.set(
    {
      registrationStage: "telegram_failed",
      telegramNotifyError: err,
      telegramNotifiedAt: null,
      updatedAt: nowIso,
    },
    { merge: true }
  );

  return { sent: false, error: err };
}
