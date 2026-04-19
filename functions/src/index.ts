import type { UserRecord } from "firebase-admin/auth";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as functions from "firebase-functions/v1";
import * as logger from "firebase-functions/logger";

initializeApp();
const adminDb = getFirestore();

/**
 * Раньше здесь отправлялось уведомление в Telegram — перенесено на Vercel:
 * POST /api/auth/notify-registration (см. lib/server/sendTelegramNotification.ts).
 * Оставляем лёгкую синхронизацию registrationStage, если документа users/{uid} ещё нет.
 */
export const onAuthUserCreateTelegram = functions.auth.user().onCreate(async (user: UserRecord) => {
  const userRef = adminDb.collection("users").doc(user.uid);
  const current = await userRef.get();
  if (!current.exists || !current.get("registrationStage")) {
    await userRef.set(
      {
        registrationStage: "auth_created",
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }
  logger.info(
    "[onAuthUserCreateTelegram] Telegram уведомление обрабатывается на Vercel (notify-registration)"
  );
});
