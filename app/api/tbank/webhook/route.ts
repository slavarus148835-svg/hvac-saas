import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { creditPartnerCommissionIfNeeded } from "@/lib/server/creditPartnerCommission";
import { resolveMonthlySubscriptionIntent } from "@/lib/server/tbankMonthlyPayment";
import {
  buildPaymentSuccessNotificationHtml,
  sendTelegramNotification,
} from "@/lib/server/sendTelegramNotification";

/** Подпись webhook только из process.env (тот же пароль, что для Init). */
const PASSWORD = process.env.TBANK_PASSWORD || "";

function generateWebhookToken(payload: Record<string, unknown>) {
  const values: Record<string, string> = {};

  for (const key of Object.keys(payload)) {
    const value = payload[key];

    if (
      key !== "Token" &&
      value !== undefined &&
      value !== null &&
      typeof value !== "object"
    ) {
      values[key] = String(value);
    }
  }

  values.Password = PASSWORD;

  const joined = Object.keys(values)
    .sort()
    .map((key) => values[key])
    .join("");

  return createHash("sha256").update(joined).digest("hex");
}

function addMonthsToPaidUntil(currentPaidUntil: number, months: number) {
  const base = currentPaidUntil > Date.now() ? currentPaidUntil : Date.now();
  return base + months * 30 * 24 * 60 * 60 * 1000;
}

function parseUserIdFromOrderId(orderId: string): string | null {
  const parts = String(orderId).split("__");
  if (parts.length < 2 || !parts[0]) return null;
  return parts[0];
}

export async function POST(req: Request) {
  try {
    console.log("PAYMENT_WEBHOOK_START");
    const adminDb = getAdminDb();
    if (!adminDb) {
      console.error(
        "[payment] callback failed FIREBASE_SERVICE_ACCOUNT_JSON is not set — cannot update Firestore"
      );
      return NextResponse.json(
        {
          error:
            "Сервер не настроен: задайте FIREBASE_SERVICE_ACCOUNT_JSON для обработки оплаты.",
        },
        { status: 500 }
      );
    }

    const body = (await req.json()) as Record<string, unknown>;

    if (!PASSWORD) {
      console.error("[payment] callback failed TBANK_PASSWORD not set");
      return NextResponse.json(
        { error: "Не найден TBANK_PASSWORD в environment variables" },
        { status: 500 }
      );
    }

    const incomingToken = String(body.Token || "");
    const expectedToken = generateWebhookToken(body);

    if (!incomingToken || incomingToken !== expectedToken) {
      console.error("[payment] callback failed invalid webhook signature");
      return NextResponse.json(
        { error: "Неверная подпись webhook" },
        { status: 400 }
      );
    }

    const orderId = String(body.OrderId || "");
    const paymentStatus = String(body.Status || "");
    const bankAmountKopecks = Number(body.Amount ?? NaN);
    console.log("[payment] callback received", { orderId, status: paymentStatus });

    if (!orderId) {
      return NextResponse.json(
        { error: "Не передан OrderId" },
        { status: 400 }
      );
    }

    const userId = parseUserIdFromOrderId(orderId);
    if (!userId) {
      return NextResponse.json(
        { error: "Некорректный OrderId" },
        { status: 400 }
      );
    }

    const userRef = adminDb.collection("users").doc(userId);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      console.error("[payment] webhook user doc missing", { orderId, userId });
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    console.log("PAYMENT_USER_FOUND", { userId, orderId });
    const userData = userSnap.data() || {};
    const intent = userData.lastPaymentIntent as
      | {
          orderId?: string;
          plan?: "standard" | "pro";
          months?: number;
          amount?: number;
          email?: string;
        }
      | undefined;

    const resolved = resolveMonthlySubscriptionIntent(intent, orderId, {
      bankAmountKopecks: Number.isFinite(bankAmountKopecks) ? bankAmountKopecks : undefined,
    });
    if (!resolved.ok) {
      console.error("[payment] callback failed intent resolve", {
        orderId,
        userId,
        code: resolved.code,
        bankAmountKopecks: Number.isFinite(bankAmountKopecks) ? bankAmountKopecks : null,
        intentSnapshot: intent
          ? { orderId: intent.orderId, months: intent.months, amount: intent.amount }
          : null,
      });
      return NextResponse.json(
        {
          error:
            resolved.code === "intent_order_mismatch"
              ? "Черновик оплаты не найден или orderId не совпадает"
              : "Некорректный lastPaymentIntent или сумма в уведомлении банка",
        },
        { status: 400 }
      );
    }

    const paymentOrder = {
      userId,
      months: resolved.months,
      amount: resolved.amount,
      plan: "standard" as const,
      email: resolved.email || String(userData.email || ""),
    };

    await userRef.set(
      {
        lastWebhook: {
          orderId,
          status: paymentStatus,
          receivedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    if (paymentStatus !== "CONFIRMED") {
      console.log("PAYMENT_WEBHOOK_SUCCESS", {
        outcome: "ignored_not_confirmed",
        orderId,
        userId,
        paymentStatus,
      });
      console.log("[payment] callback success (no access change; status not CONFIRMED)");
      return NextResponse.json({ ok: true });
    }

    const currentPaidUntil = Number(userData.paidUntil || 0);
    const newPaidUntil = addMonthsToPaidUntil(
      currentPaidUntil,
      Number(paymentOrder.months || 0)
    );

    await userRef.set(
      {
        plan: paymentOrder.plan,
        blocked: false,
        paidUntil: newPaidUntil,
        hasPaid: true,
        paidAt: Date.now(),
        lastPaymentIntent: FieldValue.delete(),
        lastPaymentConfirmed: {
          orderId,
          plan: paymentOrder.plan,
          months: paymentOrder.months,
          amount: paymentOrder.amount,
          paidUntil: newPaidUntil,
          confirmedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    console.log("PAYMENT_FIRESTORE_UPDATED", {
      userId,
      orderId,
      paidUntil: newPaidUntil,
      plan: paymentOrder.plan,
    });
    console.log("PAYMENT_ACCESS_GRANTED", { userId, orderId, paidUntil: newPaidUntil });

    const paymentIdRaw =
      body.PaymentId != null
        ? String(body.PaymentId)
        : body.PaymentID != null
          ? String(body.PaymentID)
          : "";

    try {
      await creditPartnerCommissionIfNeeded({
        db: adminDb,
        paidUserId: userId,
        orderId,
        amountKopecks: paymentOrder.amount,
        paymentId: paymentIdRaw.trim() || undefined,
      });
    } catch (e) {
      console.error("[payment] partner commission failed", e);
    }

    console.log("[payment] access granted", {
      userId,
      orderId,
      paidUntil: newPaidUntil,
      plan: paymentOrder.plan,
    });

    const amountRub = paymentOrder.amount / 100;
    const periodLabel =
      paymentOrder.months === 1 ? "1 месяц" : `${paymentOrder.months} мес.`;
    const dateStr = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
    const payHtml = buildPaymentSuccessNotificationHtml({
      email: paymentOrder.email || "—",
      uid: userId,
      plan: paymentOrder.plan,
      amountRub,
      periodLabel,
      date: dateStr,
    });

    console.log("[payment] telegram notify start");
    void sendTelegramNotification(payHtml)
      .then((r) => {
        if (r.ok) {
          console.log("[payment] telegram notify ok");
        } else {
          console.error("[payment] telegram notify failed", {
            skipped: r.skipped,
            error: r.error,
            httpStatus: r.httpStatus,
          });
        }
      })
      .catch((err) => console.error("[payment] telegram notify failed", err));

    console.log("PAYMENT_WEBHOOK_SUCCESS", {
      outcome: "confirmed_access_granted",
      userId,
      orderId,
    });
    console.log("[payment] callback success");
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Внутренняя ошибка webhook";
    console.error("[payment] callback failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
