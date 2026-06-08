import { NextResponse } from "next/server";
import { getServerPublicOrigin } from "@/lib/siteUrl";
import { isEmailVerificationSatisfied } from "@/lib/emailVerificationSatisfied";
import {
  initTbankSubscriptionPayment,
  MONTHLY_SUBSCRIPTION_KOPECKS,
} from "@/lib/server/tbank/initTbankSubscriptionPayment";
import { loadUserDocByUid } from "@/lib/server/telegram/telegramMiniAppSession";
import { requireMiniAppSessionBearer } from "@/lib/server/telegram/requireMiniAppSessionBearer";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";

export const runtime = "nodejs";

/**
 * POST /api/telegram/miniapp-create-payment
 * Создание платежа T‑Банк по сессии Mini App (без Firebase Auth в браузере).
 */
export async function POST(req: Request) {
  const session = await requireMiniAppSessionBearer(req);
  if (!session.ok) {
    return NextResponse.json(session.body, { status: session.status });
  }

  const { uid, db } = session;
  const loaded = await loadUserDocByUid(db, uid);
  if (!loaded) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const data = loaded.data;
  if (data.blocked === true) {
    return NextResponse.json({ ok: false, error: "blocked" }, { status: 403 });
  }

  if (!isEmailVerificationSatisfied(data)) {
    return NextResponse.json(
      { ok: false, error: "email_not_verified", message: "Сначала подтвердите email." },
      { status: 403 }
    );
  }

  const payEmail = String(data.email ?? "").trim();
  if (!payEmail || !payEmail.includes("@")) {
    return NextResponse.json(
      { ok: false, error: "no_email", message: "Привяжите email к аккаунту." },
      { status: 400 }
    );
  }

  const orderId = `${uid}__${Date.now()}`;
  const nowIso = new Date().toISOString();
  const origin = getServerPublicOrigin() || "";

  await db.collection(PRICING_FS.users).doc(uid).set(
    {
      lastPaymentIntent: {
        orderId,
        plan: "standard",
        months: 1,
        amount: MONTHLY_SUBSCRIPTION_KOPECKS,
        email: payEmail,
        status: "checkout_started",
        createdAt: nowIso,
        source: "telegram_mini_app",
      },
      updatedAt: nowIso,
    },
    { merge: true }
  );

  const payment = await initTbankSubscriptionPayment({
    uid,
    email: payEmail,
    orderId,
    successUrl: origin ? `${origin}/tg/cabinet?payment=success` : undefined,
    failUrl: origin ? `${origin}/tg/cabinet?payment=failed` : undefined,
  });

  if (!payment.ok) {
    return NextResponse.json(
      { ok: false, error: payment.error, details: payment.details ?? null },
      { status: payment.status }
    );
  }

  await db.collection(PRICING_FS.users).doc(uid).set(
    {
      lastPaymentIntent: {
        orderId: payment.orderId,
        paymentId: payment.paymentId,
        plan: "standard",
        months: 1,
        amount: MONTHLY_SUBSCRIPTION_KOPECKS,
        email: payEmail,
        status: "bank_redirect_ready",
        updatedAt: new Date().toISOString(),
        source: "telegram_mini_app",
      },
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  console.log("[miniapp-payment] create success", { uid, orderId: payment.orderId });

  return NextResponse.json({
    ok: true,
    url: payment.url,
    orderId: payment.orderId,
    paymentId: payment.paymentId,
  });
}
