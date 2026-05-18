import { NextResponse } from "next/server";
import {
  processTelegramWebhookUpdate,
  type TelegramWebhookUpdate,
} from "@/lib/server/telegram/processTelegramWebhookUpdate";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const hitAt = new Date().toISOString();
  let rawBody = "";
  let rawBodyExists = false;

  try {
    rawBody = await req.text();
    rawBodyExists = rawBody.length > 0;
  } catch (e) {
    console.error("TELEGRAM_WEBHOOK_HIT", {
      timestamp: hitAt,
      rawBodyExists: false,
      readError: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ ok: true });
  }

  let update: TelegramWebhookUpdate = {};
  try {
    update = rawBody ? (JSON.parse(rawBody) as TelegramWebhookUpdate) : {};
  } catch (e) {
    console.error("TELEGRAM_WEBHOOK_HIT", {
      timestamp: hitAt,
      rawBodyExists,
      parseError: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ ok: true });
  }

  const msg = update.message;
  console.log("TELEGRAM_WEBHOOK_HIT", {
    timestamp: hitAt,
    update_id: update.update_id ?? null,
    messageText: msg?.text?.slice(0, 200) ?? null,
    chatId: msg?.chat?.id ?? update.callback_query?.message?.chat?.id ?? null,
    telegramUserId: msg?.from?.id ?? update.callback_query?.from?.id ?? null,
    rawBodyExists,
    hasCallbackQuery: Boolean(update.callback_query),
  });

  const tokenPresent = !!String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!tokenPresent) {
    console.error("TELEGRAM_WEBHOOK_FATAL", { reason: "missing_telegram_bot_token" });
  }

  try {
    await processTelegramWebhookUpdate(update);
  } catch (e) {
    console.error("TELEGRAM_WEBHOOK_FATAL", {
      message: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
    });
  }

  return NextResponse.json({ ok: true });
}
