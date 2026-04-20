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
  console.log("[payment] checking status");

  const auth = await requireBearerUid(req);
  if (!auth.ok) {
    console.log("[payment] failed auth");
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { uid: bearerUid, email: bearerEmail } = auth.data;

  if (!TERMINAL_KEY || !PASSWORD) {
    console.log("[payment] failed missing TBANK env");
    return NextResponse.json(
      { error: "Не заданы TBANK_TERMINAL_KEY или TBANK_PASSWORD" },
      { status: 500 }
    );
  }

  const adminDb = getAdminDb();
  if (!adminDb) {
    console.log("[payment] failed no Firestore admin");
    return NextResponse.json(
      { error: "Сервер не настроен (FIREBASE_SERVICE_ACCOUNT_JSON)" },
      { status: 500 }
    );
  }

  let body: { paymentId?: string; orderId?: string };
  try {
    body = (await req.json()) as { paymentId?: string; orderId?: string };
  } catch {
    console.log("[payment] failed bad json");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const paymentIdRaw = body.paymentId != null ? String(body.paymentId).trim() : "";
  const orderIdRaw = body.orderId != null ? String(body.orderId).trim() : "";

  if (!paymentIdRaw || !orderIdRaw) {
    console.log("[payment] failed missing paymentId or orderId");
    return NextResponse.json(
      { error: "Нужны paymentId и orderId" },
      { status: 400 }
    );
  }

  const userIdFromOrder = parseUserIdFromOrderId(orderIdRaw);
  if (!userIdFromOrder || userIdFromOrder !== bearerUid) {
    console.log("[payment] failed orderId uid mismatch");
    return NextResponse.json(
      { error: "orderId не соответствует текущему пользователю" },
      { status: 403 }
    );
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
    console.log("[payment] failed", { message: gs.Message, details: gs.Details });
    return NextResponse.json(
      {
        confirmed: false,
        pending: false,
        error: String(gs.Message || "GetState error"),
        details: gs.Details ?? null,
      },
      { status: 200 }
    );
  }

  const status = String(gs.Status || "");
  const orderIdFromBank = String(gs.OrderId || "");
  const amountFromBank = Number(gs.Amount ?? 0);

  if (orderIdFromBank && orderIdFromBank !== orderIdRaw) {
    console.log("[payment] failed order mismatch", { orderIdFromBank, orderIdRaw });
    return NextResponse.json(
      { confirmed: false, pending: false, error: "OrderId не совпадает с ответом банка" },
      { status: 400 }
    );
  }

  if (amountFromBank !== MONTHLY_AMOUNT_KOPECKS) {
    console.log("[payment] failed amount mismatch", amountFromBank);
    return NextResponse.json(
      { confirmed: false, pending: false, error: "Неверная сумма платежа" },
      { status: 400 }
    );
  }

  if (status !== "CONFIRMED") {
    console.log("[payment] pending", status);
    return NextResponse.json({
      confirmed: false,
      pending: true,
      paymentStatus: status,
    });
  }

  const userRef = adminDb.collection("users").doc(bearerUid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    console.log("[payment] failed user not found");
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }

  const userData = userSnap.data() || {};
  const intent = userData.lastPaymentIntent as
    | {
        orderId?: string;
        plan?: string;
        months?: number;
        amount?: number;
        email?: string;
      }
    | undefined;

  const lastConfirmed = userData.lastPaymentConfirmed as { orderId?: string } | undefined;
  if (lastConfirmed?.orderId === orderIdRaw) {
    console.log("[payment] confirmed");
    return NextResponse.json({ confirmed: true, alreadyProcessed: true });
  }

  const intentOk = intent?.orderId === orderIdRaw;
  if (!intentOk) {
    console.log("[payment] failed intent mismatch (fallback allows recovery only with matching order in GetState)");
    return NextResponse.json(
      {
        confirmed: false,
        pending: false,
        error: "Черновик оплаты не найден — начните оплату снова со страницы биллинга",
      },
      { status: 400 }
    );
  }

  const months = Number(intent.months || 0);
  const amount = Number(intent.amount || 0);
  if (months !== 1 || amount !== MONTHLY_AMOUNT_KOPECKS) {
    console.log("[payment] failed invalid intent amounts");
    return NextResponse.json({ error: "Некорректный черновик оплаты" }, { status: 400 });
  }

  const emailOut = String(intent.email || userData.email || bearerEmail || "").trim();
  const currentPaidUntil = Number(userData.paidUntil || 0);
  const newPaidUntil = addMonthsToPaidUntil(currentPaidUntil, months);

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

  const amountRub = amount / 100;
  const tgHtml = buildFallbackPaymentTelegramHtml(emailOut, bearerUid, amountRub);
  void sendTelegramNotification(tgHtml).catch((err) =>
    console.error("[payment] telegram notify failed", err)
  );

  console.log("[payment] confirmed");
  return NextResponse.json({ confirmed: true, paidUntil: newPaidUntil });
}
