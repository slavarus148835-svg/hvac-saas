import { NextResponse } from "next/server";
import type { User } from "firebase/auth";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import {
  EMAIL_CODE_RESEND_COOLDOWN_MS,
  EMAIL_VERIFICATION_CODES_COLLECTION,
} from "@/lib/server/emailCodeConstants";
import { requireBearerUid } from "@/lib/server/requireBearerUid";
import { needsEmailCodeVerification } from "@/lib/emailVerificationGate";

export async function GET(req: Request) {
  const auth = await requireBearerUid(req);
  if (!auth.ok) {
    return NextResponse.json(auth.data, { status: auth.status });
  }

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ error: "no_admin" }, { status: 503 });
  }

  const now = Date.now();
  const { uid, emailVerified: tokenEmailVerified } = auth.data;
  const userSnap = await db.collection(PRICING_FS.users).doc(uid).get();
  const codeSnap = await db.collection(EMAIL_VERIFICATION_CODES_COLLECTION).doc(uid).get();

  const user = userSnap.exists ? userSnap.data() ?? {} : {};
  const code = codeSnap.exists ? codeSnap.data() ?? {} : {};

  const codeExpiresAtTs = code.expiresAt as Timestamp | undefined;
  const lastSentAtTs = code.lastSentAt as Timestamp | undefined;
  const codeExpiresAtMs = codeExpiresAtTs?.toMillis?.() ?? 0;
  const resendAvailableAtMs = (lastSentAtTs?.toMillis?.() ?? 0) + EMAIL_CODE_RESEND_COOLDOWN_MS;
  const hasActiveCode =
    codeSnap.exists &&
    code.consumed !== true &&
    codeExpiresAtMs > now;

  const telegramStatus =
    user.telegramNotifiedAt
      ? "sent"
      : user.telegramNotifyError
        ? "failed"
        : "unknown";

  /** Строго поле Firestore (диагностика). */
  const firestoreEmailVerifiedByCode = Boolean(user.emailVerifiedByCode);

  const tokenUser = { emailVerified: tokenEmailVerified } as User;
  const profile = userSnap.exists ? user : null;
  const emailVerificationRequired = needsEmailCodeVerification(tokenUser, profile);
  /** Доступ только при `emailVerifiedByCode` в Firestore (не по ссылке Firebase). */
  const emailVerificationSatisfied = !emailVerificationRequired;

  const lastError =
    (typeof user.lastRegistrationError === "string" && user.lastRegistrationError) ||
    (typeof user.emailCodeSendError === "string" && user.emailCodeSendError) ||
    (typeof user.telegramNotifyError === "string" && user.telegramNotifyError) ||
    null;

  const recommendedNextStep = !userSnap.exists
    ? "finish_profile_init"
    : emailVerificationSatisfied
      ? "proceed_to_dashboard"
      : hasActiveCode
        ? "enter_code"
        : "send_code";

  return NextResponse.json({
    ok: true,
    authUserExists: true,
    firestoreUserExists: userSnap.exists,
    emailVerifiedByCode: firestoreEmailVerifiedByCode,
    emailVerificationRequired,
    emailVerificationSatisfied,
    hasActiveCode,
    codeExpiresAt: codeExpiresAtMs > 0 ? new Date(codeExpiresAtMs).toISOString() : null,
    attempts: typeof code.attempts === "number" ? code.attempts : 0,
    resendAvailableAt:
      resendAvailableAtMs > 0 ? new Date(resendAvailableAtMs).toISOString() : null,
    telegramNotificationStatus: telegramStatus,
    lastError,
    recommendedNextStep,
    registrationStage: typeof user.registrationStage === "string" ? user.registrationStage : null,
    emailCodeSentAt:
      typeof user.emailCodeSentAt === "string" ? user.emailCodeSentAt : null,
    emailCodeSendError:
      typeof user.emailCodeSendError === "string" ? user.emailCodeSendError : null,
    telegramNotifiedAt:
      typeof user.telegramNotifiedAt === "string" ? user.telegramNotifiedAt : null,
    telegramNotifyError:
      typeof user.telegramNotifyError === "string" ? user.telegramNotifyError : null,
  });
}
