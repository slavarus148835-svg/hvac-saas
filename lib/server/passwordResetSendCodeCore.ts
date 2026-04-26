import { createHash } from "crypto";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import type { App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import {
  EMAIL_CODE_RESEND_COOLDOWN_MS,
  EMAIL_CODE_TTL_MS,
  PASSWORD_RESET_CODES_COLLECTION,
} from "@/lib/server/emailCodeConstants";
import { generateSixDigitCode, hashEmailCode } from "@/lib/server/emailCodeCrypto";
import { sendVerificationCodeEmail } from "@/lib/server/gmailNodemailer";

export type PasswordResetSendOutcome =
  | { kind: "rate_limited"; retryAfterSec: number }
  | { kind: "masked_success"; codeSaved: true; emailSent: false }
  | { kind: "sent"; codeSaved: true; emailSent: true; messageId: string }
  | { kind: "send_error"; codeSaved: true; emailSent: false; message: string }
  | { kind: "lookup_error"; codeSaved: false; emailSent: false; message: string };

export function passwordResetDocId(email: string): string {
  return createHash("sha256").update(`password_reset:${email}`, "utf8").digest("hex");
}

function firebaseErrorCode(e: unknown): string {
  if (typeof e === "object" && e !== null && "code" in e) {
    return String((e as { code?: unknown }).code ?? "");
  }
  return "";
}

/**
 * Общая логика POST /api/auth/send-password-reset-code и debug GET.
 * Предусловия: email уже нормализован и валиден, db/app/pepper/SMTP проверены снаружи.
 */
export async function executePasswordResetSendCode(params: {
  normalizedEmail: string;
  db: Firestore;
  adminApp: App;
  pepper: string;
}): Promise<PasswordResetSendOutcome> {
  const { normalizedEmail: email, db, adminApp, pepper } = params;

  console.log("PASSWORD_RESET_START");
  console.log("PASSWORD_RESET_EMAIL_NORMALIZED", email);

  const docRef = db.collection(PASSWORD_RESET_CODES_COLLECTION).doc(passwordResetDocId(email));
  const now = Date.now();
  const snap = await docRef.get();
  if (snap.exists) {
    const lastSent = snap.data()?.lastSentAt as Timestamp | undefined;
    const lastMs = lastSent?.toMillis?.() ?? 0;
    const elapsed = now - lastMs;
    if (lastMs > 0 && elapsed < EMAIL_CODE_RESEND_COOLDOWN_MS) {
      const retryAfterSec = Math.ceil((EMAIL_CODE_RESEND_COOLDOWN_MS - elapsed) / 1000);
      console.log("PASSWORD_RESET_RATE_LIMIT", { email, retryAfterSec });
      return { kind: "rate_limited", retryAfterSec };
    }
  }

  let userExists = false;
  try {
    await getAuth(adminApp).getUserByEmail(email);
    userExists = true;
    console.log("PASSWORD_RESET_USER_FOUND", { email });
  } catch (e: unknown) {
    const code = firebaseErrorCode(e);
    if (code === "auth/user-not-found") {
      userExists = false;
      console.log("PASSWORD_RESET_USER_NOT_FOUND", { email });
    } else {
      const message = e instanceof Error ? e.message : String(e);
      console.error("PASSWORD_RESET_USER_LOOKUP_FAILED", { code, message });
      return {
        kind: "lookup_error",
        codeSaved: false,
        emailSent: false,
        message: message || code || "getUserByEmail failed",
      };
    }
  }

  const plain = generateSixDigitCode();
  console.log("PASSWORD_RESET_CODE_GENERATED", { email, hashPrefix: hashEmailCode(plain, pepper).slice(0, 12) });

  const codeHash = hashEmailCode(plain, pepper);
  const expiresAt = Timestamp.fromMillis(now + EMAIL_CODE_TTL_MS);

  await docRef.set(
    {
      email,
      codeHash,
      expiresAt,
      attempts: 0,
      consumed: false,
      purpose: "password_reset",
      createdAt: FieldValue.serverTimestamp(),
      lastSentAt: Timestamp.fromMillis(now),
      usedAt: null,
    },
    { merge: true }
  );
  console.log("PASSWORD_RESET_CODE_SAVED", {
    email,
    collection: PASSWORD_RESET_CODES_COLLECTION,
    purpose: "password_reset",
    ttlMs: EMAIL_CODE_TTL_MS,
  });

  if (!userExists) {
    console.log("PASSWORD_RESET_SKIP_EMAIL_NO_USER", { email });
    return { kind: "masked_success", codeSaved: true, emailSent: false };
  }

  const text = [
    `Ваш код восстановления пароля: ${plain}`,
    "Код действует 10 минут.",
    "Если вы не запрашивали восстановление, просто игнорируйте это письмо.",
  ].join("\n");

  console.log("PASSWORD_RESET_SEND_EMAIL_START", { email, via: "sendVerificationCodeEmail" });
  try {
    const sent = await sendVerificationCodeEmail({
      to: email,
      code: plain,
      subject: "Код восстановления пароля HVAC SaaS",
      text,
    });
    console.log("PASSWORD_RESET_SEND_EMAIL_SUCCESS", { email, messageId: sent.messageId || null });
    return { kind: "sent", codeSaved: true, emailSent: true, messageId: sent.messageId || "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("PASSWORD_RESET_SEND_EMAIL_ERROR", { email, message, error });
    return { kind: "send_error", codeSaved: true, emailSent: false, message };
  }
}
