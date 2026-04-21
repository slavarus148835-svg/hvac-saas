import { getAuth } from "firebase-admin/auth";
import type { App } from "firebase-admin/app";
import type { Firestore } from "firebase-admin/firestore";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";

/**
 * Общий финальный шаг после успешного подтверждения email-кодом (как в verify-email-code).
 * Транзакция с кодом уже обновила флаги верификации — здесь только Auth + registrationStage.
 */
export async function finalizePostVerificationUserDoc(params: {
  db: Firestore;
  app: App;
  uid: string;
}): Promise<void> {
  const { db, app, uid } = params;
  try {
    await getAuth(app).updateUser(uid, { emailVerified: true });
  } catch (e) {
    console.error("[finalizePostVerificationUserDoc] updateUser emailVerified failed", e);
  }

  const nowIso = new Date().toISOString();
  await db.collection(PRICING_FS.users).doc(uid).set(
    {
      registrationStage: "verified",
      emailCodeSendError: null,
      lastRegistrationError: null,
      updatedAt: nowIso,
    },
    { merge: true }
  );
}
