import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminApp, getAdminDb } from "@/lib/firebaseAdmin";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import {
  EMAIL_CODE_MAX_ATTEMPTS,
  EMAIL_VERIFICATION_CODES_COLLECTION,
} from "@/lib/server/emailCodeConstants";
import { getEmailCodePepper, hashEmailCode } from "@/lib/server/emailCodeCrypto";
import { requireBearerUid } from "@/lib/server/requireBearerUid";
import { finalizePostVerificationUserDoc } from "@/lib/server/finalizePostVerificationUserDoc";

export async function POST(req: Request) {
  const auth = await requireBearerUid(req);
  if (!auth.ok) {
    return NextResponse.json(auth.data, { status: auth.status });
  }

  const pepper = getEmailCodePepper();
  if (!pepper) {
    console.error("[api/auth/verify-email-code] EMAIL_CODE_PEPPER missing");
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  let body: { code?: string };
  try {
    body = (await req.json()) as { code?: string };
  } catch {
    body = {};
  }
  const rawCode = String(body.code || "").replace(/\D/g, "").slice(0, 6);
  if (rawCode.length !== 6) {
    return NextResponse.json({ error: "invalid_code_format" }, { status: 400 });
  }

  const db = getAdminDb();
  const app = getAdminApp();
  if (!db || !app) {
    return NextResponse.json({ error: "no_admin" }, { status: 503 });
  }

  const { uid, email } = auth.data;
  const ref = db.collection(EMAIL_VERIFICATION_CODES_COLLECTION).doc(uid);
  const userRef = db.collection(PRICING_FS.users).doc(uid);

  const tryHash = hashEmailCode(rawCode, pepper);
  const nowIso = new Date().toISOString();

  type TxResult =
    | { status: "ok" }
    | { status: "error"; code: string; attemptsLeft?: number };

  const outcome = await db.runTransaction(async (tx): Promise<TxResult> => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      return { status: "error", code: "no_code" };
    }
    const d = snap.data()!;
    if (d.consumed === true) {
      return { status: "error", code: "code_used" };
    }

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
    await userRef.set(
      {
        lastRegistrationError: outcome.code,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    const map: Record<string, number> = {
      wrong_code: 400,
      expired: 400,
      too_many_attempts: 400,
      no_code: 400,
      code_used: 400,
    };
    const status = map[outcome.code] ?? 400;
    if (outcome.code === "wrong_code") {
      return NextResponse.json(
        { error: outcome.code, attemptsLeft: outcome.attemptsLeft },
        { status }
      );
    }
    return NextResponse.json({ error: outcome.code }, { status });
  }

  await finalizePostVerificationUserDoc({ db, app, uid });

  return NextResponse.json({ ok: true, email: email || "" });
}
