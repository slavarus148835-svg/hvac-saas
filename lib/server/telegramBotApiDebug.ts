/** Диагностика Bot API (без логирования токена). */
export async function telegramGetMe(): Promise<unknown> {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) return { ok: false, error: "missing_token" };
  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
    cache: "no-store",
  });
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, parse_error: true, httpStatus: res.status, raw: text.slice(0, 500) };
  }
}

export async function telegramGetWebhookInfo(): Promise<unknown> {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) return { ok: false, error: "missing_token" };
  const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
    cache: "no-store",
  });
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, parse_error: true, httpStatus: res.status, raw: text.slice(0, 500) };
  }
}

export async function telegramSetWebhook(webhookUrl: string): Promise<unknown> {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) return { ok: false, error: "missing_token" };
  const u = new URL(`https://api.telegram.org/bot${token}/setWebhook`);
  u.searchParams.set("url", webhookUrl);
  const res = await fetch(u.toString(), { cache: "no-store" });
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, parse_error: true, httpStatus: res.status, raw: text.slice(0, 500) };
  }
}
