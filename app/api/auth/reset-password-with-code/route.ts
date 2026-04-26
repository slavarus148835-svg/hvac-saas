import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getAdminApp, getAdminDb } from "@/lib/firebaseAdmin";
import {
  EMAIL_CODE_MAX_ATTEMPTS,
  PASSWORD_RESET_CODES_COLLECTION,
} from "@/lib/server/emailCodeConstants";
import { getEmailCodePepper, hashEmailCode } from "@/lib/server/emailCodeCrypto";

export const runtime = "nodejs";

function normalizeEmail(raw: unknown): string {
  return String(raw || "").trim().toLowerCase();
}

function passwordResetDocId(email: string): string {
  return createHash("sha256").update(`password_reset:${email}`, "utf8").digest("hex");
}

export async function POST(req: Request) {
  let body: { email?: string; code?: string; newPassword?: string };
  try {
    body = (await req.json()) as { email?: string; code?: string; newPassword?: string };
  } catch {
    body = {};
  }

  const email = normalizeEmail(body.email);
  const code = String(body.code || "").replace(/\D/g, "").slice(0, 6);
  const newPassword = String(body.newPassword || "");

  if (!email) return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  if (code.length !== 6) {
    return NextResponse.json({ ok: false, error: "invalid_code_format" }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ ok: false, error: "password_too_short" }, { status: 400 });
  }

  const pepper = getEmailCodePepper();
  if (!pepper) return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  const db = getAdminDb();
  const app = getAdminApp();
  if (!db || !app) return NextResponse.json({ ok: false, error: "server_unavailable" }, { status: 503 });

  const ref = db.collection(PASSWORD_RESET_CODES_COLLECTION).doc(passwordResetDocId(email));
  const tryHash = hashEmailCode(code, pepper);

  const txResult = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false as const, error: "no_code" };
    const d = snap.data() as {
      consumed?: boolean;
      codeHash?: string;
      attempts?: number;
      expiresAt?: Timestamp;
    };
    if (d.consumed === true) return { ok: false as const, error: "code_used" };
    const expiresAt = d.expiresAt;
    if (!expiresAt || expiresAt.toMillis() < Date.now()) return { ok: false as const, error: "expired" };
    const attempts = typeof d.attempts === "number" ? d.attempts : 0;
    if (attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
      return { ok: false as const, error: "too_many_attempts" };
    }
    if (String(d.codeHash || "") !== tryHash) {
      tx.update(ref, { attempts: FieldValue.increment(1) });
      return {
        ok: false as const,
        error: "wrong_code",
        attemptsLeft: Math.max(0, EMAIL_CODE_MAX_ATTEMPTS - attempts - 1),
      };
    }
    tx.update(ref, {
      consumed: true,
      usedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true as const };
  });

  if (!txResult.ok) {
    if (txResult.error === "wrong_code") {
      return NextResponse.json(
        { ok: false, error: "wrong_code", attemptsLeft: txResult.attemptsLeft },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: false, error: txResult.error }, { status: 400 });
  }

  try {
    const authUser = await getAuth(app).getUserByEmail(email);
    await getAuth(app).updateUser(authUser.uid, { password: newPassword });
  } catch {
    return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 400 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
