import { NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/server/sendTelegramMessage";

export const runtime = "nodejs";

const TEST_TEXT = "TEST MESSAGE FROM DEBUG ENDPOINT";

/** GET: sendMessage в ADMIN чат + явная диагностика шага 3. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const querySecret = url.searchParams.get("secret");
  const authHeader = req.headers.get("authorization");
  if (
    querySecret !== process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const adminChat = String(process.env.ADMIN_TELEGRAM_CHAT_ID ?? "").trim();
  if (!adminChat) {
    return NextResponse.json(
      {
        ok: false,
        diagnosis: {
          step: 3,
          sendMessage: "ERROR",
          problem: "ПРОБЛЕМА: НЕ ОТПРАВЛЯЕТСЯ СООБЩЕНИЕ В TELEGRAM",
          message: "ADMIN_TELEGRAM_CHAT_ID пустой. Задайте числовой chat_id в Vercel.",
        },
      },
      { status: 503 }
    );
  }

  const tokenPresent = !!String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!tokenPresent) {
    return NextResponse.json(
      {
        ok: false,
        diagnosis: {
          step: 3,
          sendMessage: "ERROR",
          problem: "ПРОБЛЕМА: НЕ ОТПРАВЛЯЕТСЯ СООБЩЕНИЕ В TELEGRAM",
          message: "TELEGRAM_BOT_TOKEN пустой.",
        },
      },
      { status: 503 }
    );
  }

  const result = await sendTelegramMessage(adminChat, TEST_TEXT);

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        targetChatId: adminChat,
        message: TEST_TEXT,
        result,
        diagnosis: {
          step: 3,
          sendMessage: "ERROR",
          problem: "ПРОБЛЕМА: НЕ ОТПРАВЛЯЕТСЯ СООБЩЕНИЕ В TELEGRAM",
          message:
            "Проверьте TELEGRAM_BOT_TOKEN и ADMIN_TELEGRAM_CHAT_ID. Пользователь с этим id должен написать боту /start.",
          telegramError: result.error ?? null,
          httpStatus: result.httpStatus ?? null,
        },
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    targetChatId: adminChat,
    message: TEST_TEXT,
    result,
    diagnosis: {
      step: 3,
      sendMessage: "OK",
      message: "Сообщение должно прийти в чат ADMIN_TELEGRAM_CHAT_ID.",
    },
  });
}
