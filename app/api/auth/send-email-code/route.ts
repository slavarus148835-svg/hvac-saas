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
  getConfiguredMailProvider,
  getMailProviderBlocker,
  sendTransactionalEmail,
} from "@/lib/server/sendMail";

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

  const blocker = getMailProviderBlocker();
  if (blocker) {
    const err = blocker.code;
    console.log("[send-email-code] no mail transport:", err);
    await userRef.set(
      {
        registrationStage: "code_send_failed",
        emailCodeSendError: err,
        lastRegistrationError: err,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    console.log("[send-email-code] response status: 503", err);
    return NextResponse.json({ error: err }, { status: 503 });
  }

  const mailProvider = getConfiguredMailProvider();

  await userRef.set(
    {
      registrationStage: "code_send_started",
      emailCodeSendError: null,
      lastRegistrationError: null,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

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

  const subject = "Подтверждение регистрации";
  const text = `Ваш код подтверждения: ${plain}\nКод действует 10 минут.`;

  console.log(`[send-email-code] provider=${mailProvider}`);
  console.log("[send-email-code] provider request start");

  const sent = await sendTransactionalEmail({ to: email, subject, text });

  if (!sent.ok) {
    if (sent.error === "smtp_env_incomplete") {
      await userRef.set(
        {
          registrationStage: "code_send_failed",
          emailCodeSendError: "smtp_env_incomplete",
          lastRegistrationError: sent.detail ?? sent.error,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      console.error("[send-email-code] smtp_env_incomplete", sent.detail);
      console.log("[send-email-code] response status: 503 smtp_env_incomplete");
      return NextResponse.json(
        {
          ok: false,
          error: "smtp_env_incomplete",
          detail: sent.detail,
          provider: mailProvider,
        },
        { status: 503 }
      );
    }

    const detail = [sent.error, sent.detail].filter(Boolean).join(" | ").slice(0, 500);
    const apiError =
      mailProvider === "resend" ? "resend_provider_failed" : "smtp_provider_failed";
    console.error("[send-email-code] mail send failed", {
      provider: mailProvider,
      apiError,
      smtpCode: sent.smtpCode,
      message: sent.smtpMessage ?? detail,
    });
    await userRef.set(
      {
        registrationStage: "code_send_failed",
        emailCodeSendError: apiError,
        lastRegistrationError: sent.error,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    console.log("[send-email-code] response status: 502", apiError);
    return NextResponse.json(
      {
        ok: false,
        error: apiError,
        provider: mailProvider,
        smtpCode: sent.smtpCode,
        smtpMessage: sent.smtpMessage ?? undefined,
        detail: sent.detail ?? detail,
      },
      { status: 502 }
    );
  }

  console.log("[send-email-code] provider success");
  console.log(`[send-email-code] transport=${sent.provider}`);

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
