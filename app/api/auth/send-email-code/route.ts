import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import {
  EMAIL_CODE_RESEND_COOLDOWN_MS,
  EMAIL_CODE_TTL_MS,
  EMAIL_VERIFICATION_CODES_COLLECTION,
} from "@/lib/server/emailCodeConstants";
import { generateSixDigitCode, getEmailCodePepper, hashEmailCode } from "@/lib/server/emailCodeCrypto";
import { requireBearerUid } from "@/lib/server/requireBearerUid";
import {
  isGmailVerificationSmtpConfigured,
  sendVerificationCodeEmail,
} from "@/lib/server/gmailNodemailer";
import { upsertLeadEmailStarted } from "@/lib/server/leadsFirestore";

/** Явно Node: на Vercel доступны все process.env для SMTP. */
export const runtime = "nodejs";

export async function POST(req: Request) {
  console.log("[send-email-code] start");

  const auth = await requireBearerUid(req);
  if (!auth.ok) {
    console.log("[send-email-code] response status:", auth.status, "auth fail");
    return NextResponse.json(auth.data, { status: auth.status });
  }

  const pepper = getEmailCodePepper();
  if (!pepper) {
    console.log("[send-email-code] missing env: EMAIL_CODE_PEPPER");
    console.log("[send-email-code] response status: 503 missing_email_code_pepper");
    return NextResponse.json({ error: "missing_email_code_pepper" }, { status: 503 });
  }

  const db = getAdminDb();
  if (!db) {
    console.log("[send-email-code] response status: 503 no_admin");
    return NextResponse.json(
      { error: "unknown_send_code_error", detail: "no_admin" },
      { status: 503 }
    );
  }

  const { uid, email } = auth.data;
  const userRef = db.collection(PRICING_FS.users).doc(uid);

  if (!email) {
    await userRef.set(
      {
        registrationStage: "code_send_failed",
        emailCodeSendError: "no_email",
        lastRegistrationError: "no_email",
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    console.log("[send-email-code] response status: 400 no_email");
    return NextResponse.json({ error: "no_email" }, { status: 400 });
  }

  if (!isGmailVerificationSmtpConfigured()) {
    const detail =
      "Задайте GMAIL_SMTP_PASS или SMTP_PASS (пароль приложения Gmail) на сервере";
    console.log("[send-email-code] no gmail smtp pass:", detail);
    await userRef.set(
      {
        registrationStage: "code_send_failed",
        emailCodeSendError: "smtp_env_incomplete",
        lastRegistrationError: detail,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    console.log("[send-email-code] response status: 503 smtp_env_incomplete");
    return NextResponse.json(
      { ok: false, error: "smtp_env_incomplete", detail },
      { status: 503 }
    );
  }

  await userRef.set(
    {
      registrationStage: "code_send_started",
      emailCodeSendError: null,
      lastRegistrationError: null,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  try {
    await upsertLeadEmailStarted(db, uid, email);
  } catch (e) {
    console.warn("[send-email-code] lead upsert (email started) failed", e);
  }

  const ref = db.collection(EMAIL_VERIFICATION_CODES_COLLECTION).doc(uid);
  const snap = await ref.get();
  const now = Date.now();

  if (snap.exists) {
    const lastSent = snap.data()?.lastSentAt as Timestamp | undefined;
    const lastMs = lastSent?.toMillis?.() ?? 0;
    const elapsed = now - lastMs;
    if (lastMs > 0 && elapsed < EMAIL_CODE_RESEND_COOLDOWN_MS) {
      const retryAfterSec = Math.ceil((EMAIL_CODE_RESEND_COOLDOWN_MS - elapsed) / 1000);
      await userRef.set(
        {
          registrationStage: "code_send_failed",
          emailCodeSendError: "rate_limited",
          lastRegistrationError: "rate_limited",
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      console.log("[send-email-code] response status: 429 rate_limited");
      return NextResponse.json({ error: "rate_limited", retryAfterSec }, { status: 429 });
    }
  }

  const plain = generateSixDigitCode();
  const codeHash = hashEmailCode(plain, pepper);
  console.log("[send-email-code] generated code hash:", `${codeHash.slice(0, 12)}…`);

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

  console.log("[send-email-code] provider=gmail_smtp (nodemailer)");
  console.log("[send-email-code] provider request start");

  try {
    await sendVerificationCodeEmail({ to: email, code: plain });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[send-email-code] mail send failed", { message });
    await userRef.set(
      {
        registrationStage: "code_send_failed",
        emailCodeSendError: "smtp_provider_failed",
        lastRegistrationError: message,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    console.log("[send-email-code] response status: 502 smtp_provider_failed");
    return NextResponse.json(
      {
        ok: false,
        error: "smtp_provider_failed",
        provider: "gmail_smtp",
        detail: message,
      },
      { status: 502 }
    );
  }

  console.log("[send-email-code] provider success");
  console.log("[send-email-code] transport=gmail_smtp");

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

  console.log("[send-email-code] response status: 200 ok");
  return NextResponse.json({
    ok: true,
    cooldownSec: Math.ceil(EMAIL_CODE_RESEND_COOLDOWN_MS / 1000),
  });
}
