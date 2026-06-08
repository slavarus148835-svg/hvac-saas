import { createHash } from "crypto";
import { getServerPublicOrigin } from "@/lib/siteUrl";

const TERMINAL_KEY = process.env.TBANK_TERMINAL_KEY || "";
const PASSWORD = process.env.TBANK_PASSWORD || "";
const TAXATION = process.env.TBANK_TAXATION || "usn_income";
const TBANK_INIT_URL = "https://securepay.tinkoff.ru/v2/Init";

export const MONTHLY_SUBSCRIPTION_KOPECKS = 1190 * 100;

function generateToken(payload: Record<string, string | number>) {
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
    .map((key) => values[key])
    .join("");
  return createHash("sha256").update(joined).digest("hex");
}

function getTariffName(plan: string, months: number) {
  if (plan === "standard" && months === 1) {
    return "Подписка HVAC SaaS — 1190 ₽/мес (1 месяц)";
  }
  return `Подписка HVAC SaaS (${plan}, ${months} мес.)`;
}

export function isValidOrderIdForUser(orderId: string, userId: string) {
  const prefix = `${userId}__`;
  return typeof orderId === "string" && orderId.startsWith(prefix) && orderId.length > prefix.length;
}

export type InitTbankPaymentParams = {
  uid: string;
  email: string;
  orderId: string;
  successUrl?: string;
  failUrl?: string;
};

export type InitTbankPaymentResult =
  | { ok: true; url: string; paymentId: string; orderId: string }
  | { ok: false; status: number; error: string; details?: string | null };

export async function initTbankSubscriptionPayment(
  params: InitTbankPaymentParams
): Promise<InitTbankPaymentResult> {
  const { uid, email, orderId } = params;
  const amount = MONTHLY_SUBSCRIPTION_KOPECKS;
  const months = 1;
  const plan = "standard";

  if (!TERMINAL_KEY || !PASSWORD) {
    return {
      ok: false,
      status: 500,
      error: "Не найдены TBANK_TERMINAL_KEY или TBANK_PASSWORD в environment variables",
    };
  }

  if (!isValidOrderIdForUser(orderId, uid)) {
    return {
      ok: false,
      status: 400,
      error:
        "Некорректный orderId. Ожидается формат userId__timestamp.",
    };
  }

  const emailTrim = email.trim();
  if (!emailTrim) {
    return { ok: false, status: 400, error: "Укажите email для чека" };
  }

  const publicOrigin = getServerPublicOrigin();
  if (!publicOrigin) {
    return {
      ok: false,
      status: 500,
      error: "Не задан публичный URL приложения (NEXT_PUBLIC_APP_URL).",
    };
  }

  const webhookUrl =
    process.env.TBANK_WEBHOOK_URL?.trim() || `${publicOrigin}/api/tbank/webhook`;

  const successUrl = params.successUrl?.trim() || `${publicOrigin}/dashboard?payment=success`;
  const failUrl = params.failUrl?.trim() || `${publicOrigin}/billing?payment=failed`;

  const description = getTariffName(plan, months);
  const payload = {
    TerminalKey: TERMINAL_KEY,
    Amount: amount,
    OrderId: orderId,
    Description: description,
    NotificationURL: webhookUrl,
    SuccessURL: successUrl,
    FailURL: failUrl,
  };

  const Token = generateToken(payload);

  const response = await fetch(TBANK_INIT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      Token,
      Receipt: {
        Email: emailTrim,
        Taxation: TAXATION,
        Items: [
          {
            Name: description,
            Price: amount,
            Quantity: 1,
            Amount: amount,
            Tax: "none",
          },
        ],
      },
    }),
    cache: "no-store",
  });

  const data = (await response.json()) as {
    Success?: boolean;
    Message?: string;
    Details?: string;
    PaymentURL?: string;
    PaymentId?: string | number;
  };

  if (!data.Success) {
    return {
      ok: false,
      status: 400,
      error: data.Message || "Ошибка T-Банка",
      details: data.Details || null,
    };
  }

  if (!data.PaymentURL) {
    return { ok: false, status: 400, error: "Банк не вернул ссылку на оплату" };
  }

  return {
    ok: true,
    url: data.PaymentURL,
    orderId,
    paymentId: data.PaymentId != null ? String(data.PaymentId) : "",
  };
}
