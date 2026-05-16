import { getAuth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import type { App } from "firebase-admin/app";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { runRegistrationTelegramNotifyIfNeeded } from "@/lib/server/runRegistrationTelegramNotify";

/** Исторический префикс для авто-созданных Telegram-only аккаунтов (больше не создаём). */
export function firebaseUidForTelegramNumericId(telegramId: string): string {
  const digits = String(telegramId || "").replace(/\D/g, "");
  return `tg_${digits}`;
}

export type TelegramProfileInput = {
  telegramId: string;
  telegramUsername: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
};

/**
 * Обновить существующего пользователя по Telegram id.
 * Новый users/{uid} с префиксом tg_* не создаётся — подключение только через email + Mini App link.
 */
export async function provisionOrUpdateTelegramUser(params: {
  db: Firestore;
  app: App;
  profile: TelegramProfileInput;
}): Promise<{ uid: string } | null> {
  const { db, app, profile } = params;
  const adminAuth = getAuth(params.app);
  const telegramId = String(profile.telegramId || "").replace(/\D/g, "");
  if (!telegramId) {
    throw new Error("invalid_telegram_id");
  }

  let snap = await db
    .collection(PRICING_FS.users)
    .where("telegramId", "==", telegramId)
    .limit(1)
    .get();
  if (snap.empty) {
    snap = await db
      .collection(PRICING_FS.users)
      .where("telegramUserId", "==", telegramId)
      .limit(1)
      .get();
  }

  const displayName =
    [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() ||
    (profile.telegramUsername ? `@${profile.telegramUsername}` : "") ||
    `Telegram ${telegramId}`;

  const photoURL =
    profile.photoUrl && profile.photoUrl.length <= 2000 ? profile.photoUrl : undefined;

  if (snap.empty) {
    console.log("AUTH_TELEGRAM_USER_NOT_LINKED_SKIP_CREATE", { telegramUserId: telegramId });
    return null;
  }

  const doc = snap.docs[0]!;
  const uid = doc.id;
  try {
    await adminAuth.getUser(uid);
  } catch {
    console.error("[provisionTelegramUser] Firestore user without Auth user", uid);
    throw new Error("auth_user_missing_for_telegram_profile");
  }
  const now = new Date().toISOString();
  await db.collection(PRICING_FS.users).doc(uid).set(
    {
      telegramId,
      telegramUserId: telegramId,
      telegramUsername: profile.telegramUsername ?? null,
      firstName: profile.firstName ?? null,
      lastName: profile.lastName ?? null,
      photoUrl: profile.photoUrl ?? null,
      name: displayName,
      authProvider: "telegram",
      emailVerifiedByCode: true,
      emailVerified: true,
      emailVerifiedAt: now,
      registrationStage: "verified",
      emailCodeSendError: null,
      lastRegistrationError: null,
      updatedAt: now,
    },
    { merge: true }
  );
  try {
    await adminAuth.updateUser(uid, {
      displayName: displayName || undefined,
      photoURL,
      emailVerified: true,
    });
  } catch (e) {
    console.warn("[provisionTelegramUser] updateUser (existing doc) skipped", e);
  }
  await runRegistrationTelegramNotifyIfNeeded(db, uid, null);
  return { uid };
}
