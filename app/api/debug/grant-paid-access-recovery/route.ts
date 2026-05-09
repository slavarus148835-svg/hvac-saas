import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { assertInternalDebugSecret } from "@/lib/server/assertInternalDebugSecret";
import { explainPaymentAccess } from "@/lib/server/explainPaymentAccess";
import { isPaidActive } from "@/lib/trialSubscription";
import { getAdminApp, getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const MS_MONTH = 30 * 24 * 60 * 60 * 1000;

function summarize(user: Record<string, unknown> | null | undefined) {
  if (!user) return null;
  return {
    plan: user.plan ?? null,
    paidUntil: user.paidUntil ?? null,
    hasPaid: user.hasPaid === true,
    paidAt: user.paidAt ?? null,
    blocked: user.blocked === true,
    lastPaymentIntent: user.lastPaymentIntent ?? null,
    lastPaymentConfirmed: user.lastPaymentConfirmed ?? null,
  };
}

/**
 * Ручная выдача оплаченного доступа после бага lastPaymentIntent.
 *
 * POST /api/debug/grant-paid-access-recovery
 * Headers: x-internal-debug-secret: <INTERNAL_DEBUG_SECRET>
 * Body JSON: { "email": "user@host", "apply": true }
 *
 * При apply=false только читает состояние (dry-run).
 */
export async function POST(req: Request) {
  const denied = assertInternalDebugSecret(req);
  if (denied) return denied;

  const app = getAdminApp();
  const db = getAdminDb();
  if (!app || !db) {
    return NextResponse.json({ error: "no_admin" }, { status: 503 });
  }

  let body: { email?: string; apply?: boolean };
  try {
    body = (await req.json()) as { email?: string; apply?: boolean };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const apply = body.apply === true;
  if (!email) {
    return NextResponse.json({ error: "email_required" }, { status: 400 });
  }

  let uid: string;
  try {
    const u = await getAuth(app).getUserByEmail(email);
    uid = u.uid;
  } catch {
    return NextResponse.json({ error: "auth_user_not_found", email }, { status: 404 });
  }

  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  const beforeFull = snap.exists ? (snap.data() as Record<string, unknown>) : null;
  const beforeSummary = summarize(beforeFull);

  const paidUntilMs = Date.now() + MS_MONTH;
  const priorOrderId =
    beforeFull &&
    typeof beforeFull.lastPaymentIntent === "object" &&
    beforeFull.lastPaymentIntent !== null &&
    "orderId" in beforeFull.lastPaymentIntent
      ? String((beforeFull.lastPaymentIntent as { orderId?: string }).orderId || "")
      : "";

  const patch = {
    plan: "standard",
    blocked: false,
    hasPaid: true,
    paidAt: FieldValue.serverTimestamp(),
    paidUntil: paidUntilMs,
    lastPaymentIntent: FieldValue.delete(),
    lastPaymentConfirmed: {
      orderId: priorOrderId || "manual_recovery_intent_bug",
      plan: "standard",
      months: 1,
      amount: 1190 * 100,
      paidUntil: paidUntilMs,
      confirmedAt: new Date().toISOString(),
      source: "debug_grant_paid_access_recovery",
    },
    updatedAt: new Date().toISOString(),
  };

  if (!apply) {
    return NextResponse.json({
      dryRun: true,
      uid,
      email,
      before: beforeSummary,
      wouldApply: {
        ...patch,
        paidAt: "(serverTimestamp)",
        lastPaymentIntent: "(delete)",
      },
      accessBefore: explainPaymentAccess(beforeFull),
      isPaidActiveBefore: beforeFull ? isPaidActive(beforeFull) : false,
    });
  }

  await ref.set(patch, { merge: true });
  const afterSnap = await ref.get();
  const afterFull = afterSnap.data() as Record<string, unknown>;

  return NextResponse.json({
    ok: true,
    uid,
    email,
    before: beforeSummary,
    after: summarize(afterFull),
    accessAfter: explainPaymentAccess(afterFull),
    isPaidActiveAfter: isPaidActive(afterFull),
  });
}
