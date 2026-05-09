import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { assertInternalDebugSecret } from "@/lib/server/assertInternalDebugSecret";
import { explainPaymentAccess } from "@/lib/server/explainPaymentAccess";
import { getAdminApp, getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

/**
 * Диагностика оплаты по email. Требуется INTERNAL_DEBUG_SECRET
 * (заголовок x-internal-debug-secret или Authorization: Bearer).
 *
 * GET /api/debug/payment-user?email=user@example.com
 */
export async function GET(req: Request) {
  const denied = assertInternalDebugSecret(req);
  if (denied) return denied;

  const app = getAdminApp();
  const db = getAdminDb();
  if (!app || !db) {
    return NextResponse.json({ error: "no_admin" }, { status: 503 });
  }

  const url = new URL(req.url);
  const emailRaw = url.searchParams.get("email")?.trim() || "";
  if (!emailRaw) {
    return NextResponse.json({ error: "email_required" }, { status: 400 });
  }

  let uid: string;
  try {
    const u = await getAuth(app).getUserByEmail(emailRaw);
    uid = u.uid;
  } catch {
    return NextResponse.json({ error: "auth_user_not_found", email: emailRaw }, { status: 404 });
  }

  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) {
    return NextResponse.json({
      uid,
      email: emailRaw,
      firestoreUserExists: false,
      explanation: explainPaymentAccess(null),
    });
  }

  const data = snap.data() ?? {};
  const explanation = explainPaymentAccess(data);

  return NextResponse.json({
    uid,
    email: typeof data.email === "string" ? data.email : emailRaw,
    firestoreUserExists: true,
    hasPaid: data.hasPaid === true,
    paidAt:
      data.paidAt === undefined || data.paidAt === null
        ? null
        : typeof data.paidAt === "number"
          ? data.paidAt
          : String(data.paidAt),
    paidUntil: data.paidUntil ?? null,
    plan: data.plan ?? null,
    blocked: data.blocked === true,
    lastPaymentIntent: data.lastPaymentIntent ?? null,
    lastPaymentConfirmed: data.lastPaymentConfirmed ?? null,
    subscriptionStatus: data.subscriptionStatus ?? null,
    trialEndsAt: data.trialEndsAt ?? null,
    /** Поля из ТЗ; в текущей кодовой базе доступ считается через paidUntil + plan, не через эти имена. */
    legacyFieldsPresent: {
      subscriptionActive: "subscriptionActive" in data,
      subscriptionExpiresAt: "subscriptionExpiresAt" in data,
      accessGranted: "accessGranted" in data,
      trialExpired: "trialExpired" in data,
      accessStatus: "accessStatus" in data,
    },
    explanation,
  });
}
