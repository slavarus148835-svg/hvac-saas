import { NextResponse } from "next/server";
import { getAdminApp, getAdminDb } from "@/lib/firebaseAdmin";
import { getEmailCodePepper } from "@/lib/server/emailCodeCrypto";
import {
  getEmailFrom,
  getSmtpEnvStatus,
  isGmailVerificationSmtpConfigured,
} from "@/lib/server/gmailNodemailer";
import { EMAIL_CODE_RESEND_COOLDOWN_MS } from "@/lib/server/emailCodeConstants";
import { executePasswordResetSendCode } from "@/lib/server/passwordResetSendCodeCore";

export const runtime = "nodejs";

function normalizeEmail(raw: unknown): string {
  return String(raw || "").trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
  let body: { email?: string };
  try {
    body = (await req.json()) as { email?: string };
  } catch {
    body = {};
  }

  const email = normalizeEmail(body.email);
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  const pepper = getEmailCodePepper();
  if (!pepper) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  const db = getAdminDb();
  const app = getAdminApp();
  if (!db || !app) {
    return NextResponse.json({ ok: false, error: "server_unavailable" }, { status: 503 });
  }

  const smtpStatus = getSmtpEnvStatus();
  console.log("[send-password-reset-code] SMTP_HOST exists", smtpStatus.SMTP_HOST);
  console.log("[send-password-reset-code] SMTP_USER exists", smtpStatus.SMTP_USER);
  console.log("[send-password-reset-code] SMTP_PASS exists", smtpStatus.SMTP_PASS);
  console.log("[send-password-reset-code] EMAIL_FROM exists", smtpStatus.EMAIL_FROM);
  console.log("[send-password-reset-code] EMAIL_FROM value", getEmailFrom());

  if (!isGmailVerificationSmtpConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "smtp_unavailable",
        missingEnv: {
          SMTP_HOST: !smtpStatus.SMTP_HOST,
          SMTP_USER: !smtpStatus.SMTP_USER,
          SMTP_PASS: !smtpStatus.SMTP_PASS,
          EMAIL_FROM: !smtpStatus.EMAIL_FROM,
        },
      },
      { status: 503 }
    );
  }

  const outcome = await executePasswordResetSendCode({
    normalizedEmail: email,
    db,
    adminApp: app,
    pepper,
  });

  if (outcome.kind === "rate_limited") {
    return NextResponse.json(
      { ok: false, error: "rate_limited", retryAfterSec: outcome.retryAfterSec },
      { status: 429 }
    );
  }

  if (outcome.kind === "lookup_error") {
    return NextResponse.json(
      {
        ok: false,
        error: "server_unavailable",
        detail: outcome.message,
      },
      { status: 503 }
    );
  }

  if (outcome.kind === "send_error") {
    return NextResponse.json(
      { ok: false, error: "send_failed", detail: outcome.message },
      { status: 502 }
    );
  }

  const cooldownSec = Math.ceil(EMAIL_CODE_RESEND_COOLDOWN_MS / 1000);

  if (outcome.kind === "masked_success") {
    return NextResponse.json({ ok: true, cooldownSec });
  }

  return NextResponse.json({ ok: true, cooldownSec });
}
