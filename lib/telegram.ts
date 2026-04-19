import {
  sendTelegramPlainTextAsHtml,
  type TelegramSendResult,
} from "@/lib/server/sendTelegramNotification";

export type { TelegramSendResult };

let telegramEnvOkLogged = false;

export function hasTelegramEnv(): boolean {
  return (
    !!String(process.env.TELEGRAM_BOT_TOKEN || "").trim() &&
    !!String(process.env.TELEGRAM_CHAT_ID || "").trim()
  );
}

export async function sendTelegramMessage(text: string): Promise<TelegramSendResult> {
  if (!hasTelegramEnv()) {
    console.error("Telegram env missing");
    return { ok: false, skipped: true, reason: "missing_env" };
  }

  if (!telegramEnvOkLogged) {
    telegramEnvOkLogged = true;
    console.log("[telegram] TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID present (server, values not logged)");
  }

  return sendTelegramPlainTextAsHtml(text);
}

/** @deprecated используйте sendTelegramMessage */
export const sendTelegramNotification = sendTelegramMessage;
