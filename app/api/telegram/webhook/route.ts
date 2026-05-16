import { NextResponse } from "next/server";
import { getAdminApp, getAdminDb } from "@/lib/firebaseAdmin";
import { buildTelegramFullStatsReportText } from "@/lib/server/buildTelegramFullStatsReportText";
import {
  handlePartnerManagerCallback,
  parseSlashPartnerAdminCode,
  sendAdminPartnerDetail,
  sendAdminPartnersList,
  sendAdminPartnerToggle,
  sendPartnerCabinet,
} from "@/lib/server/partnerManager/telegramPartnerBotHandlers";
import { createPartnerManagerAdmin } from "@/lib/server/partnerManager/partnerManagerB2b";
import { tryHandlePartnerManagerSignupWebhook } from "@/lib/server/partnerManager/partnerManagerTelegramSignupFlow";
import { provisionTelegramLoginUser } from "@/lib/server/provisionTelegramLoginUser";
import {
  answerTelegramCallbackQuery,
  sendTelegramMessage,
} from "@/lib/server/sendTelegramMessage";
import {
  extractTelegramIdentityFromWebhook,
  syncTelegramIdentityFromWebhook,
} from "@/lib/server/telegramUserLink";
import { confirmTelegramLoginSession } from "@/lib/server/telegramLoginSession";

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
type TelegramCallbackQuery = {
  id: string;
  from?: { id?: number };
  message?: { chat?: TelegramChat; message_id?: number };
  data?: string;
};
type TelegramUpdate = { message?: TelegramMessage; callback_query?: TelegramCallbackQuery };

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

function normalizeBotCommandToken(textRaw: string): string {
  const t = String(textRaw || "").trim().toLowerCase();
  const first = t.split(/\s+/)[0] || "";
  return first.split("@")[0] || first;
}

function parseAddPartnerCommand(textRaw: string): {
  name: string;
  telegramUserId: number;
} | null {
  const trimmed = String(textRaw || "").trim();
  if (!trimmed.toLowerCase().startsWith("/add_partner")) return null;
  const rest = trimmed.slice("/add_partner".length).trim();
  const parts = rest.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const telegramUserId = Number(parts[parts.length - 1]);
  if (!Number.isFinite(telegramUserId) || telegramUserId <= 0) return null;
  const name = parts.slice(0, -1).join(" ").trim();
  if (!name) return null;
  return { name, telegramUserId };
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

    console.log("TELEGRAM_WEBHOOK_UPDATE_RECEIVED", {
      keys: Object.keys(update),
      hasMessage: Boolean(update.message),
      hasCallbackQuery: Boolean(update.callback_query),
      textPreview: update.message?.text?.slice(0, 120) ?? null,
      callbackData: update.callback_query?.data ?? null,
    });

    const dbPartner = getAdminDb();

    if (update.callback_query) {
      const cq = update.callback_query;
      const data = String(cq.data || "");
      const fromId = cq.from?.id;
      const msg = cq.message;
      const chatId = msg?.chat?.id;
      const msgId = msg?.message_id;
      const partnerCallbacks = new Set([
        "partner_stats",
        "partner_links",
        "partner_clients",
        "partner_payouts",
      ]);
      if (
        dbPartner &&
        partnerCallbacks.has(data) &&
        fromId != null &&
        Number.isFinite(fromId) &&
        chatId != null &&
        Number.isFinite(chatId) &&
        msgId != null &&
        Number.isFinite(msgId)
      ) {
        await handlePartnerManagerCallback({
          db: dbPartner,
          callbackQueryId: cq.id,
          fromTelegramUserId: Number(fromId),
          chatId: Number(chatId),
          messageId: Number(msgId),
          data,
        });
      } else {
        await answerTelegramCallbackQuery(cq.id);
      }
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
    const cmd0 = normalizeBotCommandToken(textRaw);
    if (cmd0 === "/manager") {
      console.log("TELEGRAM_MANAGER_COMMAND_RECEIVED", {
        chatId,
        fromId: msg.from?.id,
        hasDb: Boolean(dbPartner),
      });
    }
    const sessionIdFromStart = parseStartSessionId(textRaw);
    const dbForSync = getAdminDb();
    const identity = extractTelegramIdentityFromWebhook(msg);
    if (dbForSync && identity) {
      try {
        const linked = await syncTelegramIdentityFromWebhook(dbForSync, identity);
        console.log("[telegram/webhook] telegram identity synced", linked);
      } catch (e) {
        console.warn("[telegram/webhook] telegram identity sync failed", e);
      }
    }

    console.log("CHAT ID:", String(chatId));
    console.log("ADMIN ID:", process.env.ADMIN_TELEGRAM_CHAT_ID ?? "(unset)");
    console.log("MESSAGE TEXT:", textRaw.slice(0, 500));

    const adminRaw = String(process.env.ADMIN_TELEGRAM_CHAT_ID || "").trim();

    if (dbPartner) {
      const fromTg = msg.from?.id;
      if (fromTg != null && Number.isFinite(fromTg)) {
        const signupHandled = await tryHandlePartnerManagerSignupWebhook({
          db: dbPartner,
          chatId: Number(chatId),
          textRaw,
          cmd0,
          fromId: Number(fromTg),
          telegramUsername: msg.from?.username ?? null,
        });
        if (signupHandled) {
          return NextResponse.json({ ok: true });
        }
      }
    } else if (cmd0 === "/manager") {
      await sendTelegramMessage(
        String(chatId),
        "Команда /manager сейчас недоступна: на сервере нет подключения к базе данных. Обратитесь к администратору."
      );
      return NextResponse.json({ ok: true });
    }

    if (dbPartner && cmd0 === "/partner") {
      const fromId = msg.from?.id;
      if (fromId == null || !Number.isFinite(fromId)) {
        await sendTelegramMessage(String(chatId), "Не удалось определить ваш Telegram id.");
        return NextResponse.json({ ok: true });
      }
      await sendPartnerCabinet(dbPartner, String(chatId), Number(fromId));
      return NextResponse.json({ ok: true });
    }

    if (dbPartner && adminRaw && String(chatId) === adminRaw) {
      const detailCode = parseSlashPartnerAdminCode(textRaw, "/partner_detail");
      if (detailCode) {
        await sendAdminPartnerDetail(dbPartner, String(chatId), detailCode);
        return NextResponse.json({ ok: true });
      }
      const disableCode = parseSlashPartnerAdminCode(textRaw, "/disable_partner");
      if (disableCode) {
        await sendAdminPartnerToggle(dbPartner, String(chatId), disableCode, false);
        return NextResponse.json({ ok: true });
      }
      const enableCode = parseSlashPartnerAdminCode(textRaw, "/enable_partner");
      if (enableCode) {
        await sendAdminPartnerToggle(dbPartner, String(chatId), enableCode, true);
        return NextResponse.json({ ok: true });
      }
    }

    if (dbPartner && cmd0 === "/partners") {
      if (!adminRaw || String(chatId) !== adminRaw) {
        await sendTelegramMessage(
          String(chatId),
          "Команда /partners доступна только администратору."
        );
        return NextResponse.json({ ok: true });
      }
      await sendAdminPartnersList(dbPartner, String(chatId));
      return NextResponse.json({ ok: true });
    }

    const addPartner = parseAddPartnerCommand(textRaw);
    if (dbPartner && addPartner) {
      if (!adminRaw || String(chatId) !== adminRaw) {
        await sendTelegramMessage(
          String(chatId),
          "Создание менеджера доступно только администратору."
        );
        return NextResponse.json({ ok: true });
      }
      const adminFromId = msg.from?.id;
      const created = await createPartnerManagerAdmin(dbPartner, {
        name: addPartner.name,
        telegramUserId: addPartner.telegramUserId,
        createdByAdminTelegramId:
          adminFromId != null && Number.isFinite(adminFromId) ? Number(adminFromId) : 0,
      });
      if (!created.ok) {
        const msgErr =
          created.reason === "duplicate_code"
            ? "Код уже занят. Повторите команду."
            : "Не удалось создать менеджера.";
        await sendTelegramMessage(String(chatId), msgErr);
        return NextResponse.json({ ok: true });
      }
      const { buildPartnerManagerLinksBlock } = await import(
        "@/lib/server/partnerManager/partnerManagerLinks"
      );
      const links = buildPartnerManagerLinksBlock(created.code);
      await sendTelegramMessage(
        String(chatId),
        [
          "Менеджер создан.",
          `ID: ${created.managerId}`,
          `Имя: ${addPartner.name}`,
          `Код: ${created.code}`,
          `telegramUserId: ${addPartner.telegramUserId}`,
          "",
          links.text,
        ].join("\n")
      );
      return NextResponse.json({ ok: true });
    }

    if (normalized.startsWith("/stat")) {
      if (!adminRaw || String(chatId) !== adminRaw) {
        await sendTelegramMessage(
          String(chatId),
          "Команда /stat доступна только администратору."
        );
        return NextResponse.json({ ok: true });
      }

      const dbStat = getAdminDb();
      if (!dbStat) {
        await sendTelegramMessage(
          String(chatId),
          "Сервер временно недоступен. Попробуйте позже."
        );
        return NextResponse.json({ ok: true });
      }

      try {
        console.log("TELEGRAM_STAT_START");
        const report = await buildTelegramFullStatsReportText(Date.now(), {
          topPeriod: "yesterday",
        });
        console.log("TELEGRAM_STAT_BUILT");
        const sendStat = await sendTelegramMessage(String(chatId), report);
        console.log(
          "[telegram/webhook] /stat sendTelegramMessage:",
          safeJsonStringify(sendStat)
        );
        if (!sendStat.ok) {
          console.error("TELEGRAM_STAT_ERROR", sendStat.error);
          console.error("[telegram/webhook] /stat sendMessage failed", sendStat.error);
        } else {
          console.log("TELEGRAM_STAT_SENT");
        }
      } catch (e) {
        console.error("TELEGRAM_STAT_ERROR", e);
        console.error("[telegram/webhook] /stat stats failed", e);
        await sendTelegramMessage(
          String(chatId),
          "Не удалось загрузить статистику. Попробуйте позже."
        );
      }
      return NextResponse.json({ ok: true });
    }

    if (sessionIdFromStart) {
        console.log("[telegram/webhook] login start payload", { sessionId: sessionIdFromStart });
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

        if (!provision) {
          console.log("TELEGRAM_LOGIN_CONFIRM_SKIPPED", { telegramUserId, reason: "no_linked_user" });
          await sendTelegramMessage(
            String(chatId),
            "Аккаунт с этим Telegram не найден. Зарегистрируйтесь на сайте с email, подтвердите почту и привяжите Telegram в Mini App."
          );
          return NextResponse.json({ ok: true });
        }

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
              : confirmed.reason === "not_found"
                ? "Сессия входа не найдена. Вернитесь на сайт и начните заново."
                : "Вход уже подтверждён. Вернитесь на сайт, вход должен завершиться автоматически.";
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
  } catch (e) {
    console.error("[telegram/webhook] handler error", e);
  }

  return NextResponse.json({ ok: true });
}
