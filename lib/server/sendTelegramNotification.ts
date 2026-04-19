export type TelegramSendResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: "missing_env";
  httpStatus?: number;
  error?: string;
  telegramDescription?: string;
  telegramErrorCode?: number;
  data?: Record<string, unknown>;
};

export function escapeTelegramHtml(text: string): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function plainTextToHtmlMessage(text: string): string {
  return escapeTelegramHtml(text).replace(/\n/g, "<br/>");
}

/**
 * Единая отправка в Telegram (server-only).
 * Env: только TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID.
 */
export async function sendTelegramNotification(html: string): Promise<TelegramSendResult> {
  console.log("[telegram] notify start");

  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatIdRaw = String(process.env.TELEGRAM_CHAT_ID || "").trim();

  if (!botToken || !chatIdRaw) {
    console.error(
      "[telegram] notify failed: TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не заданы в environment"
    );
    return { ok: false, skipped: true, reason: "missing_env" };
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatIdRaw,
        text: html,
        parse_mode: "HTML",
      }),
      cache: "no-store",
    });

    const rawText = await response.text();
    let data: Record<string, unknown> = {};
    try {
      data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
    } catch {
      console.error("[telegram] notify failed: не-JSON ответ Telegram", {
        httpStatus: response.status,
        raw: rawText.slice(0, 2000),
      });
      return {
        ok: false,
        httpStatus: response.status,
        error: "invalid_telegram_response",
        telegramDescription: rawText.slice(0, 500),
      };
    }

    const description = typeof data.description === "string" ? data.description : undefined;
    const errorCode = typeof data.error_code === "number" ? data.error_code : undefined;

    if (!response.ok) {
      console.error("[telegram] notify failed: HTTP", {
        httpStatus: response.status,
        description,
        error_code: errorCode,
      });
      return {
        ok: false,
        httpStatus: response.status,
        telegramDescription: description,
        telegramErrorCode: errorCode,
        data,
        error: description || `http_${response.status}`,
      };
    }

    if (!data?.ok) {
      console.error("[telegram] notify failed: Telegram ok=false", {
        description,
        error_code: errorCode,
      });
      return {
        ok: false,
        httpStatus: response.status,
        telegramDescription: description,
        telegramErrorCode: errorCode,
        data,
        error: description || "telegram_ok_false",
      };
    }

    console.log("[telegram] notify success");
    return { ok: true, httpStatus: response.status, data };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "telegram_error";
    console.error("[telegram] notify failed: fetch", msg, error);
    return { ok: false, error: msg };
  }
}

/** Plain-текст для тестов и legacy: экранирование + переносы строк. */
export async function sendTelegramPlainTextAsHtml(text: string): Promise<TelegramSendResult> {
  return sendTelegramNotification(plainTextToHtmlMessage(text));
}

export function buildRegistrationNotificationHtml(params: {
  email: string;
  uid: string;
  name: string | null | undefined;
  phone: string | null | undefined;
  date: string;
}): string {
  const name = String(params.name ?? "").trim();
  const phone = String(params.phone ?? "").trim();
  const nameLine = name ? escapeTelegramHtml(name) : "не указано";
  const phoneLine = phone ? escapeTelegramHtml(phone) : "не указан";
  const email = escapeTelegramHtml(params.email || "—");
  const uid = escapeTelegramHtml(params.uid);
  const date = escapeTelegramHtml(params.date);

  return [
    "<b>🆕 Новый пользователь</b>",
    "",
    `<b>Email:</b> <code>${email}</code>`,
    `<b>UID:</b> <code>${uid}</code>`,
    "",
    `<b>Имя:</b> ${nameLine}`,
    `<b>Телефон:</b> ${phoneLine}`,
    "",
    `<b>Дата:</b> ${date}`,
    "",
    "---------------------",
    "<i>hvac-saas</i>",
  ].join("\n");
}

function formatPlanLabel(plan: string): string {
  const p = String(plan || "").toLowerCase();
  if (p === "standard") return "Стандарт";
  if (p === "pro") return "Pro";
  return escapeTelegramHtml(plan || "—");
}

export function buildPaymentSuccessNotificationHtml(params: {
  email: string;
  uid: string;
  plan: string;
  amountRub: number;
  periodLabel: string;
  date: string;
}): string {
  const email = escapeTelegramHtml(params.email || "—");
  const uid = escapeTelegramHtml(params.uid);
  const plan = formatPlanLabel(params.plan);
  const amount =
    Number.isFinite(params.amountRub) && params.amountRub >= 0
      ? String(Math.round(params.amountRub * 100) / 100).replace(/\.00$/, "")
      : "—";
  const period = escapeTelegramHtml(params.periodLabel || "—");
  const date = escapeTelegramHtml(params.date);

  return [
    "<b>💸 Новая оплата</b>",
    "",
    `<b>Email:</b> <code>${email}</code>`,
    `<b>UID:</b> <code>${uid}</code>`,
    "",
    `<b>Тариф:</b> ${plan}`,
    `<b>Сумма:</b> ${amount} ₽`,
    `<b>Период:</b> ${period}`,
    "",
    "<b>Статус:</b> ✅ Успешно",
    `<b>Дата:</b> ${date}`,
    "",
    "---------------------",
    "<i>hvac-saas</i>",
  ].join("\n");
}
