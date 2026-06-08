import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { App } from "firebase-admin/app";
import type { Firestore } from "firebase-admin/firestore";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import {
  EMAIL_CODE_MAX_ATTEMPTS,
  EMAIL_CODE_RESEND_COOLDOWN_MS,
  EMAIL_CODE_TTL_MS,
  EMAIL_VERIFICATION_CODES_COLLECTION,
} from "@/lib/server/emailCodeConstants";
import { generateSixDigitCode, getEmailCodePepper, hashEmailCode } from "@/lib/server/emailCodeCrypto";
import { finalizePostVerificationUserDoc } from "@/lib/server/finalizePostVerificationUserDoc";
import {
  isGmailVerificationSmtpConfigured,
  sendVerificationCodeEmail,
} from "@/lib/server/gmailNodemailer";
import { upsertLeadEmailStarted, markLeadCompletedForUid } from "@/lib/server/leadsFirestore";
import { isEmailVerificationSatisfied } from "@/lib/emailVerificationSatisfied";

export type SendCodeResult =
  | { ok: true; cooldownSec: number }
  | { ok: false; error: string; status: number; retryAfterSec?: number; detail?: string };

export async function sendEmailVerificationCodeForUid(
  db: Firestore,
  uid: string,
  email: string
): Promise<SendCodeResult> {
  const pepper = getEmailCodePepper();
  if (!pepper) {
    return { ok: false, error: "missing_email_code_pepper", status: 503 };
  }

  const userRef = db.collection(PRICING_FS.users).doc(uid);
  const userSnap = await userRef.get();
  const userData = userSnap.exists ? (userSnap.data() ?? {}) : {};
  if (isEmailVerificationSatisfied(userData)) {
    return { ok: false, error: "already_verified", status: 400 };
  }

  if (!email.trim()) {
    return { ok: false, error: "no_email", status: 400 };
  }

  if (!isGmailVerificationSmtpConfigured()) {
    return {
      ok: false,
      error: "smtp_env_incomplete",
      status: 503,
      detail: "SMTP не настроен на сервере",
    };
  }

  const ref = db.collection(EMAIL_VERIFICATION_CODES_COLLECTION).doc(uid);
  const snap = await ref.get();
  const now = Date.now();

  if (snap.exists) {
    const lastSent = snap.data()?.lastSentAt as Timestamp | undefined;
    const lastMs = lastSent?.toMillis?.() ?? 0;
    const elapsed = now - lastMs;
    if (lastMs > 0 && elapsed < EMAIL_CODE_RESEND_COOLDOWN_MS) {
      return {
        ok: false,
        error: "rate_limited",
        status: 429,
        retryAfterSec: Math.ceil((EMAIL_CODE_RESEND_COOLDOWN_MS - elapsed) / 1000),
      };
    }
  }

  try {
    await upsertLeadEmailStarted(db, uid, email);
  } catch {
    /* */
  }

  const plain = generateSixDigitCode();
  const codeHash = hashEmailCode(plain, pepper);
  const expiresAt = Timestamp.fromMillis(now + EMAIL_CODE_TTL_MS);

  await ref.set({
    uid,
    email,
    codeHash,
    expiresAt,
    attempts: 0,
    consumed: false,
    createdAt: FieldValue.serverTimestamp(),
    lastSentAt: Timestamp.fromMillis(now),
  });

  try {
    await sendVerificationCodeEmail({ to: email, code: plain });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await userRef.set(
      {
        registrationStage: "code_send_failed",
        emailCodeSendError: "smtp_provider_failed",
        lastRegistrationError: message,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    return { ok: false, error: "smtp_provider_failed", status: 502, detail: message };
  }

  await userRef.set(
    {
      registrationStage: "code_sent",
      emailCodeSentAt: new Date().toISOString(),
      emailCodeSendError: null,
      lastRegistrationError: null,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  return { ok: true, cooldownSec: Math.ceil(EMAIL_CODE_RESEND_COOLDOWN_MS / 1000) };
}

export type VerifyCodeResult =
  | { ok: true }
  | { ok: false; error: string; status: number; attemptsLeft?: number };

export async function verifyEmailVerificationCodeForUid(
  db: Firestore,
  app: App,
  uid: string,
  email: string,
  rawCode: string
): Promise<VerifyCodeResult> {
  const pepper = getEmailCodePepper();
  if (!pepper) {
    return { ok: false, error: "server_misconfigured", status: 500 };
  }

  const code = String(rawCode || "").replace(/\D/g, "").slice(0, 6);
  if (code.length !== 6) {
    return { ok: false, error: "invalid_code_format", status: 400 };
  }

  const ref = db.collection(EMAIL_VERIFICATION_CODES_COLLECTION).doc(uid);
  const userRef = db.collection(PRICING_FS.users).doc(uid);
  const tryHash = hashEmailCode(code, pepper);
  const nowIso = new Date().toISOString();

  type TxResult =
    | { status: "ok" }
    | { status: "error"; code: string; attemptsLeft?: number };

  const outcome = await db.runTransaction(async (tx): Promise<TxResult> => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { status: "error", code: "no_code" };
    const d = snap.data()!;
    if (d.consumed === true) return { status: "error", code: "code_used" };

    const expiresAt = d.expiresAt as Timestamp | undefined;
    if (!expiresAt || expiresAt.toMillis() < Date.now()) {
      return { status: "error", code: "expired" };
    }

    const attempts = typeof d.attempts === "number" ? d.attempts : 0;
    if (attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
      return { status: "error", code: "too_many_attempts" };
    }

    const expectedHash = String(d.codeHash || "");
    if (tryHash !== expectedHash) {
      tx.update(ref, { attempts: FieldValue.increment(1) });
      return {
        status: "error",
        code: "wrong_code",
        attemptsLeft: Math.max(0, EMAIL_CODE_MAX_ATTEMPTS - attempts - 1),
      };
    }

    tx.set(
      userRef,
      {
        emailVerifiedByCode: true,
        emailVerifiedAt: nowIso,
        emailVerified: true,
        updatedAt: nowIso,
      },
      { merge: true }
    );
    tx.update(ref, { consumed: true });
    return { status: "ok" };
  });

  if (outcome.status === "error") {
    return {
      ok: false,
      error: outcome.code,
      status: 400,
      attemptsLeft: outcome.attemptsLeft,
    };
  }

  await finalizePostVerificationUserDoc({ db, app, uid });
  try {
    await markLeadCompletedForUid(db, uid);
  } catch {
    /* */
  }

  return { ok: true };
}
