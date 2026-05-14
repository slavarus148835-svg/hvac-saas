/**
 * Отправка произвольного текста в указанный чат (Bot API sendMessage).
 * Env: TELEGRAM_BOT_TOKEN
 */
export type SendTelegramMessageResult = {
  ok: boolean;
  error?: string;
  httpStatus?: number;
  httpStatusText?: string;
  /** Распарсенный JSON ответа Telegram (getMe/sendMessage и т.д.) */
  telegramResponse?: unknown;
};

export type TelegramInlineKeyboardButton =
  | { text: string; callback_data: string }
  | { text: string; url: string };

export type SendTelegramMessageOptions = {
  replyMarkup?: { inline_keyboard: TelegramInlineKeyboardButton[][] };
  /** Telegram Bot API: HTML | Markdown | MarkdownV2 */
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
};

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options?: SendTelegramMessageOptions
): Promise<SendTelegramMessageResult> {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const id = String(chatId ?? "").trim();

  if (!token) {
    console.error(
      "sendTelegramMessage: TELEGRAM_BOT_TOKEN is empty or missing (after trim)"
    );
    return { ok: false, error: "missing_telegram_bot_token" };
  }
  if (!id) {
    console.error("sendTelegramMessage: chatId is empty after String(...).trim()");
    return { ok: false, error: "missing_chat_id" };
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  console.log("SENDING TG MESSAGE", id, text);

  const body: Record<string, unknown> = { chat_id: id, text };
  if (options?.replyMarkup) {
    body.reply_markup = options.replyMarkup;
  }
  if (options?.parseMode) {
    body.parse_mode = options.parseMode;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const raw = await res.text();
    let parsed: unknown = undefined;
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch {
      if (!res.ok) {
        console.error("TELEGRAM SEND ERROR", {
          httpStatus: res.status,
          httpStatusText: res.statusText,
          body: raw,
          parseError: true,
        });
      }
      return {
        ok: false,
        error: "invalid_json",
        httpStatus: res.status,
        httpStatusText: res.statusText,
      };
    }

    if (!res.ok) {
      console.error("TELEGRAM SEND ERROR", {
        httpStatus: res.status,
        httpStatusText: res.statusText,
        body: raw,
        telegramResponse: parsed,
      });
      const desc =
        typeof (parsed as { description?: string })?.description === "string"
          ? (parsed as { description: string }).description
          : undefined;
      return {
        ok: false,
        error: desc || `http_${res.status}`,
        httpStatus: res.status,
        httpStatusText: res.statusText,
        telegramResponse: parsed,
      };
    }

    console.log("TELEGRAM SEND OK", JSON.stringify(parsed));

    const data = parsed as { ok?: boolean; description?: string };
    if (!data?.ok) {
      return {
        ok: false,
        error:
          typeof data.description === "string" ? data.description : "telegram_ok_false",
        httpStatus: res.status,
        httpStatusText: res.statusText,
        telegramResponse: parsed,
      };
    }

    return {
      ok: true,
      httpStatus: res.status,
      httpStatusText: res.statusText,
      telegramResponse: parsed,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch_error";
    console.error("TELEGRAM SEND FETCH EXCEPTION", msg, e);
    return { ok: false, error: msg };
  }
}

export async function answerTelegramCallbackQuery(
  callbackQueryId: string,
  text?: string
): Promise<SendTelegramMessageResult> {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const id = String(callbackQueryId ?? "").trim();
  if (!token) return { ok: false, error: "missing_telegram_bot_token" };
  if (!id) return { ok: false, error: "missing_callback_query_id" };

  const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;
  const body: Record<string, unknown> = { callback_query_id: id };
  if (text) body.text = text.slice(0, 200);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const raw = await res.text();
    let parsed: unknown = {};
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch {
      return { ok: false, error: "invalid_json", httpStatus: res.status };
    }
    const data = parsed as { ok?: boolean; description?: string };
    if (!res.ok || !data?.ok) {
      return {
        ok: false,
        error: typeof data.description === "string" ? data.description : `http_${res.status}`,
        httpStatus: res.status,
      };
    }
    return { ok: true, httpStatus: res.status, telegramResponse: parsed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch_error" };
  }
}

export async function editTelegramMessageText(
  chatId: string,
  messageId: number,
  text: string,
  options?: SendTelegramMessageOptions
): Promise<SendTelegramMessageResult> {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) return { ok: false, error: "missing_telegram_bot_token" };

  const url = `https://api.telegram.org/bot${token}/editMessageText`;
  const body: Record<string, unknown> = {
    chat_id: String(chatId),
    message_id: messageId,
    text,
  };
  if (options?.replyMarkup) body.reply_markup = options.replyMarkup;
  if (options?.parseMode) body.parse_mode = options.parseMode;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const raw = await res.text();
    let parsed: unknown = {};
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch {
      return { ok: false, error: "invalid_json", httpStatus: res.status };
    }
    const data = parsed as { ok?: boolean; description?: string };
    if (!res.ok || !data?.ok) {
      const err = typeof data.description === "string" ? data.description : `http_${res.status}`;
      if (err.includes("message is not modified")) {
        return { ok: true, httpStatus: res.status, telegramResponse: parsed };
      }
      return { ok: false, error: err, httpStatus: res.status, telegramResponse: parsed };
    }
    return { ok: true, httpStatus: res.status, telegramResponse: parsed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch_error" };
  }
}
