import { NextResponse } from "next/server";
import {
  getEmailFrom,
  getSmtpEnvStatus,
  isGmailVerificationSmtpConfigured,
  sendPasswordResetTestEmail,
} from "@/lib/server/gmailNodemailer";

export const runtime = "nodejs";

function normalizeEmail(raw: string | null): string {
  return String(raw || "").trim().toLowerCase();
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
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
    }

    const smtpStatus = getSmtpEnvStatus();
    if (!isGmailVerificationSmtpConfigured()) {
      return NextResponse.json(
        {
          ok: false,
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

    try {
      const sent = await sendPasswordResetTestEmail({ to: email });
      return NextResponse.json({
        ok: true,
        messageId: sent.messageId || null,
        sentTo: email,
        previewText: "TEST PASSWORD RESET EMAIL",
      });
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          error: "send_failed",
          detail: error instanceof Error ? error.message : String(error),
        },
        { status: 502 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: "internal_error",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
