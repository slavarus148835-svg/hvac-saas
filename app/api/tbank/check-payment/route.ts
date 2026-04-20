import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireBearerUid } from "@/lib/server/requireBearerUid";
import {
  escapeTelegramHtml,
  sendTelegramNotification,
} from "@/lib/server/sendTelegramNotification";

const TERMINAL_KEY = process.env.TBANK_TERMINAL_KEY || "";
const PASSWORD = process.env.TBANK_PASSWORD || "";
const TBANK_GET_STATE_URL = "https://securepay.tinkoff.ru/v2/GetState";
const MONTHLY_AMOUNT_KOPECKS = 1190 * 100;

function generateGetStateToken(payload: Record<string, string | number>) {
  const values: Record<string, string> = {};
  for (const key of Object.keys(payload)) {
    const value = payload[key];
    if (value !== undefined && value !== null) {
      values[key] = String(value);
    }
  }
  values.Password = PASSWORD;
  const joined = Object.keys(values)
    .sort()
    .map((k) => values[k])
    .join("");
  return createHash("sha256").update(joined).digest("hex");
}

function parseUserIdFromOrderId(orderId: string): string | null {
  const parts = String(orderId).split("__");
  if (parts.length < 2 || !parts[0]) return null;
  return parts[0];
}

function addMonthsToPaidUntil(currentPaidUntil: number, months: number) {
  const base = currentPaidUntil > Date.now() ? currentPaidUntil : Date.now();
  return base + months * 30 * 24 * 60 * 60 * 1000;
}

function buildFallbackPaymentTelegramHtml(email: string, uid: string, amountRub: number) {
  const e = escapeTelegramHtml(email || "—");
  const u = escapeTelegramHtml(uid);
  const sum =
    Number.isFinite(amountRub) && amountRub >= 0
      ? String(Math.round(amountRub * 100) / 100).replace(/\.00$/, "")
      : "—";
  return [
    "<b>💰 Оплата прошла</b>",
    "",
    `<b>Email:</b> <code>${e}</code>`,
    `<b>UID:</b> <code>${u}</code>`,
    `<b>Сумма:</b> ${escapeTelegramHtml(sum)} ₽`,
    "",
    "<i>hvac-saas (fallback GetState)</i>",
  ].join("\n");
}

export async function POST(req: Request) {
  console.log("[payment] checking status start");

  const fail = (
    httpStatus: number,
    reason:
      | "missing_payment_id"
      | "unauthorized_user"
      | "missing_tb_env"
      | "no_firebase_admin"
      | "invalid_json"
      | "order_id_mismatch"
      | "last_payment_intent_missing"
      | "amount_mismatch"
      | "status_not_confirmed"
      | "firestore_update_failed"
      | "getstate_failed"
      | "invalid_order_id"
      | "user_not_found",
    message: string,
    extra?: Record<string, unknown>
  ) => {
    console.log("[payment] failed", { reason, ...extra });
    return NextResponse.json(
      {
        confirmed: false,
        pending: reason === "status_not_confirmed",
        reason,
        error: message,
        ...extra,
      },
      { status: httpStatus }
    );
  };

  const auth = await requireBearerUid(req);
  if (!auth.ok) {
    return fail(auth.status, "unauthorized_user", "Unauthorized");
  }
  const { uid: bearerUid, email: bearerEmail } = auth.data;

  if (!TERMINAL_KEY || !PASSWORD) {
    return fail(
      500,
      "missing_tb_env",
      "Не заданы TBANK_TERMINAL_KEY или TBANK_PASSWORD"
    );
  }

  const adminDb = getAdminDb();
  if (!adminDb) {
    return fail(
      500,
      "no_firebase_admin",
      "Сервер не настроен (FIREBASE_SERVICE_ACCOUNT_JSON)"
    );
  }

  let body: { paymentId?: string; orderId?: string | null };
  try {
    body = (await req.json()) as { paymentId?: string; orderId?: string | null };
  } catch {
    return fail(400, "invalid_json", "Invalid JSON");
  }

  let paymentIdRaw = body.paymentId != null ? String(body.paymentId).trim() : "";
  let orderIdRaw = body.orderId != null ? String(body.orderId).trim() : "";

  const userRef = adminDb.collection("users").doc(bearerUid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    return fail(404, "user_not_found", "Пользователь не найден");
  }
  const userData = userSnap.data() || {};
  const intent = userData.lastPaymentIntent as
    | {
        orderId?: string;
        paymentId?: string;
        plan?: string;
        months?: number;
        amount?: number;
        email?: string;
      }
    | undefined;

  const intentOrderId = intent?.orderId ? String(intent.orderId) : "";
  const intentPaymentId = intent?.paymentId ? String(intent.paymentId) : "";

  if (!orderIdRaw && intentOrderId) {
    orderIdRaw = intentOrderId;
  }
  if (!paymentIdRaw && intentPaymentId) {
    paymentIdRaw = intentPaymentId;
  }

  console.log("[payment] checking status payload", {
    paymentId: paymentIdRaw || null,
    orderIdFromRequest: body.orderId ?? null,
    orderIdEffective: orderIdRaw || null,
    uidFromBearer: bearerUid,
    lastPaymentIntent: intent
      ? {
          orderId: intentOrderId || null,
          paymentId: intentPaymentId || null,
          amount: intent.amount ?? null,
          months: intent.months ?? null,
        }
      : null,
    lastPaymentIntentOrderId: intentOrderId || null,
  });

  if (!orderIdRaw) {
    return fail(
      400,
      "last_payment_intent_missing",
      "Не найден orderId в запросе и в lastPaymentIntent"
    );
  }
  if (!paymentIdRaw) {
    return fail(
      400,
      "missing_payment_id",
      "Не найден paymentId в запросе и в lastPaymentIntent"
    );
  }

  const userIdFromOrder = parseUserIdFromOrderId(orderIdRaw);
  if (!userIdFromOrder) {
    return fail(400, "invalid_order_id", "Некорректный orderId");
  }
  if (userIdFromOrder !== bearerUid) {
    return fail(403, "order_id_mismatch", "orderId не соответствует текущему пользователю", {
      orderUid: userIdFromOrder,
      bearerUid,
    });
  }

  const getStatePayload = {
    TerminalKey: TERMINAL_KEY,
    PaymentId: paymentIdRaw,
  };
  const token = generateGetStateToken(getStatePayload);

  const gsRes = await fetch(TBANK_GET_STATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...getStatePayload,
      Token: token,
    }),
    cache: "no-store",
  });

  const gs = (await gsRes.json()) as Record<string, unknown>;

  if (!gs.Success) {
    return fail(400, "getstate_failed", String(gs.Message || "GetState error"), {
      details: gs.Details ?? null,
    });
  }

  const status = String(gs.Status || "");
  const orderIdFromBank = String(gs.OrderId || "");
  const amountFromBank = Number(gs.Amount ?? 0);
  console.log("[payment] GetState response", {
    status,
    amount: amountFromBank,
    expectedAmount: MONTHLY_AMOUNT_KOPECKS,
    orderIdFromBank: orderIdFromBank || null,
  });

  if (orderIdFromBank && orderIdFromBank !== orderIdRaw) {
    return fail(
      400,
      "order_id_mismatch",
      "OrderId не совпадает с ответом банка",
      {
        orderIdFromBank,
        orderIdExpected: orderIdRaw,
      }
    );
  }

  if (amountFromBank !== MONTHLY_AMOUNT_KOPECKS) {
    return fail(400, "amount_mismatch", "Неверная сумма платежа", {
      amountFromBank,
      expectedAmount: MONTHLY_AMOUNT_KOPECKS,
    });
  }

  if (status !== "CONFIRMED") {
    return fail(200, "status_not_confirmed", "Платёж ещё не подтверждён банком", {
      paymentStatus: status,
      pending: true,
    });
  }

  const lastConfirmed = userData.lastPaymentConfirmed as { orderId?: string } | undefined;
  if (lastConfirmed?.orderId === orderIdRaw) {
    console.log("[payment] confirmed", { alreadyProcessed: true });
    return NextResponse.json({ confirmed: true, alreadyProcessed: true });
  }

  const intentOk = intent?.orderId === orderIdRaw;
  if (!intentOk) {
    return fail(
      400,
      "last_payment_intent_missing",
      "Черновик оплаты не найден или orderId не совпадает",
      {
        lastPaymentIntentOrderId: intentOrderId || null,
        orderIdExpected: orderIdRaw,
      }
    );
  }

  const months = Number(intent.months || 0);
  const amount = Number(intent.amount || 0);
  if (months !== 1 || amount !== MONTHLY_AMOUNT_KOPECKS) {
    return fail(400, "amount_mismatch", "Некорректный lastPaymentIntent", {
      amountFromIntent: amount,
      monthsFromIntent: months,
      expectedAmount: MONTHLY_AMOUNT_KOPECKS,
    });
  }

  const emailOut = String(intent.email || userData.email || bearerEmail || "").trim();
  const currentPaidUntil = Number(userData.paidUntil || 0);
  const newPaidUntil = addMonthsToPaidUntil(currentPaidUntil, months);

  console.log("[payment] firestore grant start", {
    uid: bearerUid,
    orderId: orderIdRaw,
    paidUntil: newPaidUntil,
  });
  try {
    await userRef.set(
      {
        plan: "standard",
        blocked: false,
        paidUntil: newPaidUntil,
        lastPaymentIntent: FieldValue.delete(),
        lastPaymentConfirmed: {
          orderId: orderIdRaw,
          plan: "standard",
          months,
          amount,
          paidUntil: newPaidUntil,
          confirmedAt: new Date().toISOString(),
          source: "getstate",
        },
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    console.log("[payment] firestore grant success");
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return fail(500, "firestore_update_failed", "Не удалось выдать доступ в Firestore", {
      firestoreError: err,
    });
  }

  const amountRub = amount / 100;
  const tgHtml = buildFallbackPaymentTelegramHtml(emailOut, bearerUid, amountRub);
  console.log("[payment] telegram notify start");
  let telegramFailed = false;
  try {
    const tgRes = await sendTelegramNotification(tgHtml);
    if (tgRes.ok) {
      console.log("[payment] telegram notify success");
    } else {
      telegramFailed = true;
      console.error("[payment] telegram notify failed", tgRes);
    }
  } catch (err) {
    telegramFailed = true;
    console.error("[payment] telegram notify failed", err);
  }

  console.log("[payment] confirmed");
  return NextResponse.json({
    confirmed: true,
    paidUntil: newPaidUntil,
    reason: "confirmed",
    telegram: telegramFailed ? "telegram_failed" : "telegram_ok",
  });
}
