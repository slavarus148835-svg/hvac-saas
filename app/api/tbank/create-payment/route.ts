import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getServerPublicOrigin } from "@/lib/siteUrl";

const TERMINAL_KEY = process.env.TBANK_TERMINAL_KEY || "";
const PASSWORD = process.env.TBANK_PASSWORD || "";
const TAXATION = process.env.TBANK_TAXATION || "usn_income";

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

function isValidOrderIdForUser(orderId: string, userId: string) {
  const prefix = `${userId}__`;
  return typeof orderId === "string" && orderId.startsWith(prefix) && orderId.length > prefix.length;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { amount, months, plan, userId, email, orderId } = body as {
      amount?: number;
      months?: number;
      plan?: string;
      userId?: string;
      email?: string;
      orderId?: string;
    };

    if (!TERMINAL_KEY || !PASSWORD) {
      return NextResponse.json(
        {
          error: "Не найдены TBANK_TERMINAL_KEY или TBANK_PASSWORD в environment variables",
        },
        { status: 500 }
      );
    }

    if (!amount || !months || !plan || !userId) {
      return NextResponse.json(
        { error: "Не переданы amount, months, plan или userId" },
        { status: 400 }
      );
    }

    if (!orderId || !isValidOrderIdForUser(String(orderId), String(userId))) {
      return NextResponse.json(
        {
          error:
            "Некорректный orderId. Ожидается формат userId__timestamp (черновик оплаты записывается в users/{uid} на клиенте).",
        },
        { status: 400 }
      );
    }

    if (plan !== "standard") {
      return NextResponse.json({ error: "Доступен только тариф standard (1190 ₽/мес)" }, { status: 400 });
    }

    const amountNumber = Number(amount);
    const monthsNumber = Number(months);

    if (monthsNumber !== 1 || amountNumber !== 1190 * 100) {
      return NextResponse.json(
        { error: "Неверная сумма или период: только 1190 ₽ за 1 месяц" },
        { status: 400 }
      );
    }

    const publicOrigin = getServerPublicOrigin();
    if (!publicOrigin) {
      return NextResponse.json(
        {
          error:
            "Не задан публичный URL приложения. Укажите NEXT_PUBLIC_APP_URL (или NEXT_PUBLIC_SITE_URL) с полным адресом сайта, например https://ваш-домен.ru",
        },
        { status: 500 }
      );
    }

    const webhookUrl =
      process.env.TBANK_WEBHOOK_URL?.trim() ||
      `${publicOrigin}/api/tbank/webhook`;

    const orderIdStr = String(orderId);
    const description = getTariffName(plan, monthsNumber);

    const payload = {
      TerminalKey: TERMINAL_KEY,
      Amount: amountNumber,
      OrderId: orderIdStr,
      Description: description,
      NotificationURL: webhookUrl,
      SuccessURL: `${publicOrigin}/dashboard`,
      FailURL: `${publicOrigin}/billing`,
    };

    const Token = generateToken(payload);

    const response = await fetch("https://securepay.tinkoff.ru/v2/Init", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...payload,
        Token,
        Receipt: {
          Email: email || "test@example.com",
          Taxation: TAXATION,
          Items: [
            {
              Name: description,
              Price: amountNumber,
              Quantity: 1,
              Amount: amountNumber,
              Tax: "none",
            },
          ],
        },
      }),
      cache: "no-store",
    });

    const data = await response.json();

    if (!data.Success) {
      return NextResponse.json(
        {
          error: data.Message || "Ошибка T-Банка",
          details: data.Details || null,
          raw: data,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      url: data.PaymentURL,
      orderId: orderIdStr,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Внутренняя ошибка сервера";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
