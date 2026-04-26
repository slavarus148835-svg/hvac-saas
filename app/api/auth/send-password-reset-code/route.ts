import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getAdminApp, getAdminDb } from "@/lib/firebaseAdmin";
import {
  EMAIL_CODE_RESEND_COOLDOWN_MS,
  EMAIL_CODE_TTL_MS,
  PASSWORD_RESET_CODES_COLLECTION,
} from "@/lib/server/emailCodeConstants";
import { generateSixDigitCode, getEmailCodePepper, hashEmailCode } from "@/lib/server/emailCodeCrypto";
import {
  isGmailVerificationSmtpConfigured,
  sendPasswordResetCodeEmail,
} from "@/lib/server/gmailNodemailer";

export const runtime = "nodejs";

function normalizeEmail(raw: unknown): string {
  return String(raw || "").trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function passwordResetDocId(email: string): string {
  return createHash("sha256").update(`password_reset:${email}`, "utf8").digest("hex");
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
  if (!isGmailVerificationSmtpConfigured()) {
    return NextResponse.json({ ok: false, error: "smtp_unavailable" }, { status: 503 });
  }

  const now = Date.now();
  const docRef = db.collection(PASSWORD_RESET_CODES_COLLECTION).doc(passwordResetDocId(email));
  const snap = await docRef.get();
  if (snap.exists) {
    const lastSent = snap.data()?.lastSentAt as Timestamp | undefined;
    const lastMs = lastSent?.toMillis?.() ?? 0;
    const elapsed = now - lastMs;
    if (lastMs > 0 && elapsed < EMAIL_CODE_RESEND_COOLDOWN_MS) {
      const retryAfterSec = Math.ceil((EMAIL_CODE_RESEND_COOLDOWN_MS - elapsed) / 1000);
      return NextResponse.json({ ok: true, retryAfterSec }, { status: 200 });
    }
  }

  let userExists = false;
  try {
    await getAuth(app).getUserByEmail(email);
    userExists = true;
  } catch {
    userExists = false;
  }

  const plain = generateSixDigitCode();
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

  // Не раскрываем существование email: при отсутствии пользователя возвращаем безопасный OK.
  if (!userExists) {
    return NextResponse.json(
      { ok: true, cooldownSec: Math.ceil(EMAIL_CODE_RESEND_COOLDOWN_MS / 1000) },
      { status: 200 }
    );
  }

  try {
    await sendPasswordResetCodeEmail({ to: email, code: plain });
  } catch {
    return NextResponse.json({ ok: false, error: "send_failed" }, { status: 502 });
  }

  return NextResponse.json(
    { ok: true, cooldownSec: Math.ceil(EMAIL_CODE_RESEND_COOLDOWN_MS / 1000) },
    { status: 200 }
  );
}
