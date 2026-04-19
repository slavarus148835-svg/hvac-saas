import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

export async function sendTelegram(text, logger) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || "").trim();
  if (!token || !chatId) {
    logger?.warn("telegram skipped: missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
    return { ok: false, skipped: true };
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: String(text || "").slice(0, 4090),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!body.ok) {
      logger?.error(`telegram api error: ${JSON.stringify(body)}`);
      return { ok: false, body };
    }
    logger?.info(`telegram sent message_id=${body?.result?.message_id ?? "?"}`);
    return { ok: true, body };
  } catch (error) {
    logger?.error(`telegram send failed: ${error?.message || String(error)}`);
    return { ok: false, error: error?.message || String(error) };
  }
}
