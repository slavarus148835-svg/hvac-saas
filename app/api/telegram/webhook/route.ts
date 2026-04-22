import { NextResponse } from "next/server";
import { getAdminApp, getAdminDb } from "@/lib/firebaseAdmin";
import { getStats } from "@/lib/server/getStats";
import { provisionTelegramLoginUser } from "@/lib/server/provisionTelegramLoginUser";
import { sendTelegramMessage } from "@/lib/server/sendTelegramMessage";
import { confirmTelegramLoginSession } from "@/lib/server/telegramLoginSession";
import { telegramGetWebhookInfo } from "@/lib/server/telegramBotApiDebug";

export const runtime = "nodejs";

type TelegramChat = { id?: number };
type TelegramMessage = {
  text?: string;
  chat?: TelegramChat;
  from?: {
    id?: number;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
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

function parseStartSessionId(textRaw: string): string | null {
  const parts = String(textRaw || "").trim().split(/\s+/);
  if (!parts[0] || parts[0].toLowerCase() !== "/start") return null;
  const payload = String(parts[1] || "").trim();
  if (!payload.startsWith("login_")) return null;
  const sid = payload.slice("login_".length).trim();
  return sid || null;
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
    const sessionIdFromStart = parseStartSessionId(textRaw);

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
      if (sessionIdFromStart) {
        const from = msg.from;
        const telegramUserId = String(from?.id ?? "").replace(/\D/g, "");
        if (!telegramUserId) {
          await sendTelegramMessage(
            String(chatId),
            "Не удалось подтвердить вход: не найден Telegram user id."
          );
          return NextResponse.json({ ok: true });
        }
        const app = getAdminApp();
        const db = getAdminDb();
        if (!app || !db) {
          await sendTelegramMessage(
            String(chatId),
            "Сервер временно недоступен. Попробуйте снова через минуту."
          );
          return NextResponse.json({ ok: true });
        }

        const provision = await provisionTelegramLoginUser({
          db,
          app,
          telegramUserId,
          telegramUsername: from?.username ?? null,
          telegramFirstName: from?.first_name ?? null,
          telegramLastName: from?.last_name ?? null,
        });

        const confirmed = await confirmTelegramLoginSession(db, {
          sessionId: sessionIdFromStart,
          telegramUserId,
          telegramUsername: from?.username ?? null,
          telegramFirstName: from?.first_name ?? null,
          telegramLastName: from?.last_name ?? null,
          resolvedUid: provision.uid,
        });

        if (!confirmed.ok) {
          const text =
            confirmed.reason === "expired"
              ? "Сессия входа истекла. Вернитесь на сайт и начните вход заново."
              : "Сессия входа не найдена или уже использована. Вернитесь на сайт и начните заново.";
          await sendTelegramMessage(String(chatId), text);
          return NextResponse.json({ ok: true });
        }

        await sendTelegramMessage(String(chatId), "Вход подтверждён. Вернитесь на сайт.");
        return NextResponse.json({ ok: true });
      }

      if (normalized === "/start") {
        await sendTelegramMessage(
          String(chatId),
          "Бот подключён. Теперь вы можете подтверждать вход через Telegram."
        );
      }
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
