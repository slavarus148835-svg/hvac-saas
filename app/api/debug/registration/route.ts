import { NextResponse } from "next/server";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getAdminApp, getAdminDb } from "@/lib/firebaseAdmin";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import {
  EMAIL_CODE_RESEND_COOLDOWN_MS,
  EMAIL_CODE_TTL_MS,
  EMAIL_VERIFICATION_CODES_COLLECTION,
} from "@/lib/server/emailCodeConstants";
import { generateSixDigitCode, getEmailCodePepper, hashEmailCode } from "@/lib/server/emailCodeCrypto";
import { sendTransactionalEmail } from "@/lib/server/sendMail";
import { assertInternalDebugSecret } from "@/lib/server/assertInternalDebugSecret";

async function resolveUidEmail(
  uidRaw: string | null,
  emailRaw: string | null
): Promise<{ uid: string; email: string } | { error: string }> {
  const app = getAdminApp();
  if (!app) return { error: "no_admin" };
  const auth = getAuth(app);
  const uid = uidRaw?.trim() || "";
  const email = emailRaw?.trim() || "";

  if (uid && !email) {
    try {
      const u = await auth.getUser(uid);
      return { uid: u.uid, email: u.email || "" };
    } catch {
      return { error: "auth_user_not_found" };
    }
  }
  if (email && !uid) {
    try {
      const u = await auth.getUserByEmail(email);
      return { uid: u.uid, email: u.email || "" };
    } catch {
      return { error: "auth_user_not_found" };
    }
  }
  if (uid && email) {
    return { uid, email };
  }
  return { error: "uid_or_email_required" };
}

function buildStatusPayload(
  uid: string,
  email: string,
  userSnap: DocumentSnapshot,
  codeSnap: DocumentSnapshot
) {
  const now = Date.now();
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

  return {
    ok: true as const,
    uid,
    email: email || (typeof user.email === "string" ? user.email : ""),
    authUserExists: true,
    firestoreUserExists: userSnap.exists,
    registrationStage: typeof user.registrationStage === "string" ? user.registrationStage : null,
    emailVerifiedByCode: Boolean(user.emailVerifiedByCode),
    emailCodeSentAt: typeof user.emailCodeSentAt === "string" ? user.emailCodeSentAt : null,
    emailCodeSendError:
      user.emailCodeSendError === null || user.emailCodeSendError === undefined
        ? null
        : String(user.emailCodeSendError),
    telegramNotifiedAt: typeof user.telegramNotifiedAt === "string" ? user.telegramNotifiedAt : null,
    telegramNotifyError:
      user.telegramNotifyError === null || user.telegramNotifyError === undefined
        ? null
        : String(user.telegramNotifyError),
    lastRegistrationError:
      user.lastRegistrationError === null || user.lastRegistrationError === undefined
        ? null
        : String(user.lastRegistrationError),
    hasActiveCode,
    codeExpiresAt: codeExpiresAtMs > 0 ? new Date(codeExpiresAtMs).toISOString() : null,
    attempts: typeof code.attempts === "number" ? code.attempts : 0,
    resendAvailableAt:
      resendAvailableAtMs > 0 ? new Date(resendAvailableAtMs).toISOString() : null,
  };
}

export async function GET(req: Request) {
  const denied = assertInternalDebugSecret(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const uidParam = url.searchParams.get("uid");
  const emailParam = url.searchParams.get("email");

  const resolved = await resolveUidEmail(uidParam, emailParam);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ error: "no_admin" }, { status: 503 });
  }

  const userSnap = await db.collection(PRICING_FS.users).doc(resolved.uid).get();
  const codeSnap = await db.collection(EMAIL_VERIFICATION_CODES_COLLECTION).doc(resolved.uid).get();

  return NextResponse.json(buildStatusPayload(resolved.uid, resolved.email, userSnap, codeSnap));
}

export async function POST(req: Request) {
  const denied = assertInternalDebugSecret(req);
  if (denied) return denied;

  let body: { uid?: string; email?: string; action?: string };
  try {
    body = (await req.json()) as { uid?: string; email?: string; action?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (body.action !== "resend") {
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  }

  const resolved = await resolveUidEmail(
    body.uid ? String(body.uid) : null,
    body.email ? String(body.email) : null
  );
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }

  const { uid, email } = resolved;
  if (!email) {
    return NextResponse.json({ error: "no_email_on_user" }, { status: 400 });
  }

  const pepper = getEmailCodePepper();
  if (!pepper) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ error: "no_admin" }, { status: 503 });
  }

  const userRef = db.collection(PRICING_FS.users).doc(uid);
  const ref = db.collection(EMAIL_VERIFICATION_CODES_COLLECTION).doc(uid);

  await userRef.set(
    {
      registrationStage: "code_send_started",
      emailCodeSendError: null,
      lastRegistrationError: null,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

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
      return NextResponse.json({ error: "rate_limited", retryAfterSec }, { status: 429 });
    }
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

  const appName = String(process.env.EMAIL_BRAND_NAME || "HVAC SaaS").trim();
  const subject = `${appName}: код подтверждения`;
  const text = `Ваш код подтверждения: ${plain}\n\nКод действует 10 минут. Если вы не регистрировались, проигнорируйте письмо.`;

  const sent = await sendTransactionalEmail({ to: email, subject, text });
  if (!sent.ok) {
    await userRef.set(
      {
        registrationStage: "code_send_failed",
        emailCodeSendError: sent.error,
        lastRegistrationError: sent.error,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    return NextResponse.json({ error: "mail_send_failed", detail: sent.error }, { status: 502 });
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

  const userSnap = await userRef.get();
  const codeSnap = await ref.get();

  return NextResponse.json({
    resent: true,
    ...buildStatusPayload(uid, email, userSnap, codeSnap),
  });
}
