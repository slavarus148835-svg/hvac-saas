import { NextResponse } from "next/server";
import { getStats } from "@/lib/server/getStats";
import { sendTelegramMessage } from "@/lib/server/sendTelegramMessage";
import { telegramGetWebhookInfo } from "@/lib/server/telegramBotApiDebug";

export const runtime = "nodejs";

type TelegramChat = { id?: number };
type TelegramMessage = {
  text?: string;
  chat?: TelegramChat;
  [key: string]: unknown;
};
type TelegramUpdate = { message?: TelegramMessage };

const MESSAGE_JSON_MAX = 14_000;

function safeJsonStringify(value: unknown, maxLen = MESSAGE_JSON_MAX): string {
  try {
    const s = JSON.stringify(value, (_k, v) =>
      typeof v === "bigint" ? String(v) : v
    );
    return s.length > maxLen ? `${s.slice(0, maxLen)}…[truncated]` : s;
  } catch (e) {
    return JSON.stringify({
      error: "stringify_failed",
      detail: e instanceof Error ? e.message : String(e),
    });
  }
}

export async function POST(req: Request) {
  console.log("WEBHOOK HIT");
  const tokenPresent = !!String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  console.log("ENV TOKEN EXISTS:", tokenPresent);
  if (!tokenPresent) {
    console.error("[telegram/webhook] TELEGRAM_BOT_TOKEN is empty — sendMessage will fail");
  }
  const adminEnv = String(process.env.ADMIN_TELEGRAM_CHAT_ID ?? "").trim();
  console.log(
    "ENV ADMIN_TELEGRAM_CHAT_ID:",
    adminEnv ? "(set, length " + adminEnv.length + ")" : "(empty)"
  );
  const cronPresent = !!String(process.env.CRON_SECRET ?? "").trim();
  console.log("ENV CRON_SECRET:", cronPresent ? "(set)" : "(empty, only needed for debug routes)");

  try {
    let update: TelegramUpdate;
    try {
      update = (await req.json()) as TelegramUpdate;
    } catch (e) {
      console.error("[telegram/webhook] invalid JSON", e);
      return NextResponse.json({ ok: true });
    }

    const msg = update.message;
    if (!msg) {
      return NextResponse.json({ ok: true });
    }

    const chatId = msg.chat?.id;
    if (chatId == null || !Number.isFinite(chatId)) {
      return NextResponse.json({ ok: true });
    }

    console.log(
      "[telegram/webhook] update.message:",
      safeJsonStringify(msg)
    );

    const textRaw = String(msg.text ?? "");
    const normalized = textRaw.trim().toLowerCase();

    console.log("CHAT ID:", String(chatId));
    console.log("ADMIN ID:", process.env.ADMIN_TELEGRAM_CHAT_ID ?? "(unset)");
    console.log("MESSAGE TEXT:", textRaw.slice(0, 500));

    const adminRaw = String(process.env.ADMIN_TELEGRAM_CHAT_ID || "").trim();
    if (!adminRaw) {
      console.warn(
        "[telegram/webhook] ADMIN_TELEGRAM_CHAT_ID is empty — /stat still processed"
      );
    } else if (String(chatId) !== adminRaw) {
      console.warn(
        "[telegram/webhook] chat id does not match ADMIN_TELEGRAM_CHAT_ID — /stat still processed"
      );
    }

    if (!normalized.startsWith("/stat")) {
      return NextResponse.json({ ok: true });
    }

    console.log("STAT COMMAND RECEIVED");

    let hookInfo: unknown;
    try {
      hookInfo = await telegramGetWebhookInfo();
      console.log(
        "[telegram/webhook] getWebhookInfo (before /stat stats):",
        JSON.stringify(hookInfo)
      );
    } catch (e) {
      console.error("[telegram/webhook] getWebhookInfo failed", e);
    }

    const { totalUsers, paidUsers, conversion } = await getStats();
    const text = [
      "📊 Статистика",
      "",
      `👥 Регистрации: ${totalUsers}`,
      `💰 Оплатили: ${paidUsers}`,
      `📈 Конверсия: ${conversion}%`,
    ].join("\n");

    const send = await sendTelegramMessage(String(chatId), text);
    console.log(
      "[telegram/webhook] sendTelegramMessage result:",
      safeJsonStringify(send)
    );
    if (!send.ok) {
      console.error("[telegram/webhook] sendMessage failed", send.error);
    }
  } catch (e) {
    console.error("[telegram/webhook] handler error", e);
  }

  return NextResponse.json({ ok: true });
}
