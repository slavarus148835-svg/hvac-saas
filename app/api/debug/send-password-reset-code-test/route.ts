import { NextResponse } from "next/server";
import { getAdminApp, getAdminDb } from "@/lib/firebaseAdmin";
import { getEmailCodePepper } from "@/lib/server/emailCodeCrypto";
import { EMAIL_CODE_RESEND_COOLDOWN_MS } from "@/lib/server/emailCodeConstants";
import {
  getEmailFrom,
  getSmtpEnvStatus,
  isGmailVerificationSmtpConfigured,
} from "@/lib/server/gmailNodemailer";
import { executePasswordResetSendCode } from "@/lib/server/passwordResetSendCodeCore";

export const runtime = "nodejs";

function normalizeEmail(raw: string | null): string {
  return String(raw || "").trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function outcomeToDebugPayload(
  email: string,
  outcome: Awaited<ReturnType<typeof executePasswordResetSendCode>>
): {
  ok: boolean;
  step: string;
  email: string;
  codeSaved: boolean;
  emailSent: boolean;
  messageId: string | null;
  error: string | null;
  retryAfterSec?: number;
  detail?: string;
} {
  if (outcome.kind === "rate_limited") {
    return {
      ok: false,
      step: "rate_limited",
      email,
      codeSaved: false,
      emailSent: false,
      messageId: null,
      error: "rate_limited",
      retryAfterSec: outcome.retryAfterSec,
    };
  }
  if (outcome.kind === "lookup_error") {
    return {
      ok: false,
      step: "user_lookup_failed",
      email,
      codeSaved: outcome.codeSaved,
      emailSent: false,
      messageId: null,
      error: outcome.message,
    };
  }
  if (outcome.kind === "send_error") {
    return {
      ok: false,
      step: "send_error",
      email,
      codeSaved: outcome.codeSaved,
      emailSent: false,
      messageId: null,
      error: outcome.message,
    };
  }
  if (outcome.kind === "masked_success") {
    return {
      ok: true,
      step: "masked_no_user",
      email,
      codeSaved: true,
      emailSent: false,
      messageId: null,
      error: null,
    };
  }
  return {
    ok: true,
    step: "email_sent",
    email,
    codeSaved: true,
    emailSent: true,
    messageId: outcome.messageId || null,
    error: null,
  };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const querySecret = url.searchParams.get("secret");
    const authHeader = req.headers.get("authorization");
    const expected = process.env.CRON_SECRET;
    if (!expected || (querySecret !== expected && authHeader !== `Bearer ${expected}`)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const email = normalizeEmail(url.searchParams.get("email"));
    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        { ok: false, step: "invalid_email", email, codeSaved: false, emailSent: false, messageId: null, error: "invalid_email" },
        { status: 400 }
      );
    }

    const pepper = getEmailCodePepper();
    if (!pepper) {
      return NextResponse.json(
        {
          ok: false,
          step: "missing_pepper",
          email,
          codeSaved: false,
          emailSent: false,
          messageId: null,
          error: "missing_email_code_pepper",
        },
        { status: 503 }
      );
    }

    const db = getAdminDb();
    const app = getAdminApp();
    if (!db || !app) {
      return NextResponse.json(
        {
          ok: false,
          step: "no_admin",
          email,
          codeSaved: false,
          emailSent: false,
          messageId: null,
          error: "no_admin",
        },
        { status: 503 }
      );
    }

    const smtpStatus = getSmtpEnvStatus();
    if (!isGmailVerificationSmtpConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          step: "smtp_env_incomplete",
          email,
          codeSaved: false,
          emailSent: false,
          messageId: null,
          error: "smtp_env_incomplete",
          missingEnv: {
            SMTP_HOST: !smtpStatus.SMTP_HOST,
            SMTP_USER: !smtpStatus.SMTP_USER,
            SMTP_PASS: !smtpStatus.SMTP_PASS,
            EMAIL_FROM: !smtpStatus.EMAIL_FROM,
          },
          emailFrom: getEmailFrom(),
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

    const body = outcomeToDebugPayload(email, outcome);
    const status =
      outcome.kind === "sent" || outcome.kind === "masked_success"
        ? 200
        : outcome.kind === "rate_limited"
          ? 429
          : outcome.kind === "lookup_error"
            ? 503
            : 502;

    return NextResponse.json(
      {
        ...body,
        cooldownSec: Math.ceil(EMAIL_CODE_RESEND_COOLDOWN_MS / 1000),
      },
      { status }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        step: "internal_error",
        email: "",
        codeSaved: false,
        emailSent: false,
        messageId: null,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
