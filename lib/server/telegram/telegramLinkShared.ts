import type { Firestore } from "firebase-admin/firestore";
import type { App } from "firebase-admin/app";
import {
  assertSafeTelegramLinkToUser,
  authUserExistsForUid,
} from "@/lib/server/authDuplicateGuards";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { isStatsExcludedTelegramProvisionUid } from "@/lib/server/statsExcludeTelegramProvisionUid";
import type { VerifiedTelegramUser } from "@/lib/server/telegram/verifyTelegramInitData";

export const TELEGRAM_LINK_TOKEN_PREFIX = "link_";
export const TELEGRAM_LINK_TOKEN_TTL_MS = 15 * 60 * 1000;
export const TELEGRAM_PENDING_REGISTRATION_PREFIX = "mpend_";
export const TELEGRAM_PENDING_REGISTRATION_TTL_MS = 24 * 60 * 60 * 1000;

export type TelegramRegistrationSessionStatus =
  | "pending_email_registration"
  | "linked";

export type TelegramRegistrationSessionDoc = {
  purpose: "miniapp_registration";
  status: TelegramRegistrationSessionStatus;
  telegramUserId: string;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  telegramLastName: string | null;
  telegramChatId: string | null;
  telegramAuthAt: string;
  linkedUid?: string;
  linkedEmail?: string;
  linkedAt?: string;
  createdAt: string;
  updatedAt: string;
  expiresAtMs: number;
};

function digitsOnly(s: string): string {
  return String(s ?? "").replace(/\D/g, "");
}

function nowIso(): string {
  return new Date().toISOString();
}

export function pendingRegistrationDocId(telegramUserId: string): string {
  return `${TELEGRAM_PENDING_REGISTRATION_PREFIX}${digitsOnly(telegramUserId)}`;
}

export function buildTelegramUserFieldsPatch(params: {
  telegramUser: VerifiedTelegramUser;
  chatId: number | null;
  registrationSource?: "web" | "telegram_mini_app";
}): Record<string, unknown> {
  const tgId = digitsOnly(String(params.telegramUser.id));
  const username =
    typeof params.telegramUser.username === "string"
      ? params.telegramUser.username.trim().replace(/^@/, "") || null
      : null;
  const chatKey =
    params.chatId != null && Number.isFinite(params.chatId)
      ? digitsOnly(String(Math.trunc(params.chatId)))
      : null;
  const t = nowIso();

  const patch: Record<string, unknown> = {
    telegramUserId: tgId,
    telegramId: tgId,
    telegramUsername: username,
    telegramFirstName: params.telegramUser.first_name ?? null,
    telegramLastName: params.telegramUser.last_name ?? null,
    telegramOptIn: true,
    telegramLinkedAt: t,
    telegramAuthAt: t,
    updatedAt: t,
  };
  if (chatKey) patch.telegramChatId = chatKey;
  if (params.registrationSource) {
    patch.registrationSource = params.registrationSource;
  }
  return patch;
}

export async function markTgProvisionUserLinked(
  db: Firestore,
  telegramUserId: string,
  linkedUid: string,
  linkedEmail: string
): Promise<void> {
  const tgDocId = `tg_${digitsOnly(telegramUserId)}`;
  const ref = db.collection(PRICING_FS.users).doc(tgDocId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const t = nowIso();
  await ref.set(
    {
      isProvisionUser: true,
      provisionStatus: "linked",
      linkedUid,
      linkedEmail,
      linkedAt: t,
      updatedAt: t,
    },
    { merge: true }
  );
}

export async function upsertTelegramRegistrationSession(
  db: Firestore,
  params: {
    telegramUser: VerifiedTelegramUser;
    chatId: number | null;
  }
): Promise<{ sessionId: string; doc: TelegramRegistrationSessionDoc }> {
  const tgId = digitsOnly(String(params.telegramUser.id));
  const sessionId = pendingRegistrationDocId(tgId);
  const t = nowIso();
  const expiresAtMs = Date.now() + TELEGRAM_PENDING_REGISTRATION_TTL_MS;
  const username =
    typeof params.telegramUser.username === "string"
      ? params.telegramUser.username.trim().replace(/^@/, "") || null
      : null;
  const chatKey =
    params.chatId != null && Number.isFinite(params.chatId)
      ? digitsOnly(String(Math.trunc(params.chatId)))
      : null;

  const doc: TelegramRegistrationSessionDoc = {
    purpose: "miniapp_registration",
    status: "pending_email_registration",
    telegramUserId: tgId,
    telegramUsername: username,
    telegramFirstName: params.telegramUser.first_name ?? null,
    telegramLastName: params.telegramUser.last_name ?? null,
    telegramChatId: chatKey,
    telegramAuthAt: t,
    createdAt: t,
    updatedAt: t,
    expiresAtMs,
  };

  await db.collection(PRICING_FS.telegramLoginSessions).doc(sessionId).set(doc, { merge: true });
  console.log("MINIAPP_PENDING_SESSION_CREATED", { sessionId, telegramUserId: tgId });
  return { sessionId, doc };
}

export async function getTelegramRegistrationSession(
  db: Firestore,
  sessionId: string
): Promise<TelegramRegistrationSessionDoc | null> {
  const id = String(sessionId || "").trim();
  if (!id) return null;
  const snap = await db.collection(PRICING_FS.telegramLoginSessions).doc(id).get();
  if (!snap.exists) return null;
  const data = snap.data() as TelegramRegistrationSessionDoc;
  if (data.expiresAtMs > 0 && data.expiresAtMs <= Date.now() && data.status !== "linked") {
    return null;
  }
  return data;
}

export async function markTelegramRegistrationSessionLinked(
  db: Firestore,
  sessionId: string,
  linkedUid: string,
  linkedEmail: string
): Promise<void> {
  const t = nowIso();
  await db.collection(PRICING_FS.telegramLoginSessions).doc(sessionId).set(
    {
      status: "linked",
      linkedUid,
      linkedEmail,
      linkedAt: t,
      updatedAt: t,
    },
    { merge: true }
  );
}

export type LinkTelegramToUidResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "target_not_found"
        | "telegram_bound_elsewhere"
        | "target_has_other_telegram"
        | "uid_has_no_auth";
    };

/**
 * Привязать Telegram к существующему email uid (без перезаписи email).
 */
export async function linkTelegramToEmailUid(
  db: Firestore,
  app: App,
  params: {
    targetUid: string;
    telegramUser: VerifiedTelegramUser;
    chatId: number | null;
    registrationSource?: "web" | "telegram_mini_app";
  }
): Promise<LinkTelegramToUidResult> {
  const targetUid = String(params.targetUid || "").trim();
  if (!targetUid || isStatsExcludedTelegramProvisionUid(targetUid)) {
    return { ok: false, reason: "target_not_found" };
  }

  const hasAuth = await authUserExistsForUid(app, targetUid);
  if (!hasAuth) {
    return { ok: false, reason: "uid_has_no_auth" };
  }

  const userRef = db.collection(PRICING_FS.users).doc(targetUid);
  const snap = await userRef.get();
  if (!snap.exists) {
    return { ok: false, reason: "target_not_found" };
  }

  const targetData = snap.data() as Record<string, unknown>;
  const tgId = digitsOnly(String(params.telegramUser.id));
  const chatKey =
    params.chatId != null && Number.isFinite(params.chatId)
      ? digitsOnly(String(Math.trunc(params.chatId)))
      : null;

  const safe = await assertSafeTelegramLinkToUser(db, targetUid, targetData, tgId, chatKey);
  if (!safe.ok) {
    return { ok: false, reason: safe.reason };
  }

  const patch = buildTelegramUserFieldsPatch({
    telegramUser: params.telegramUser,
    chatId: params.chatId,
    registrationSource: params.registrationSource,
  });

  const existingAuthProvider = String(targetData.authProvider || "").trim();
  if (!existingAuthProvider) {
    patch.authProvider = "email";
  }

  await userRef.set(patch, { merge: true });
  await markTgProvisionUserLinked(db, tgId, targetUid, String(targetData.email || ""));

  return { ok: true };
}

export function linkBlockedMessage(
  reason: "telegram_bound_elsewhere" | "target_has_other_telegram" | "uid_has_no_auth" | "target_not_found"
): string {
  switch (reason) {
    case "telegram_bound_elsewhere":
      return "Этот Telegram уже привязан к другому аккаунту. Войдите в тот аккаунт или обратитесь в поддержку.";
    case "target_has_other_telegram":
      return "К вашему email уже привязан другой Telegram. Обратитесь в поддержку для смены привязки.";
    case "uid_has_no_auth":
    case "target_not_found":
      return "Аккаунт не найден. Войдите по email на сайте и повторите привязку.";
    default:
      return "Не удалось привязать Telegram. Попробуйте позже.";
  }
}
