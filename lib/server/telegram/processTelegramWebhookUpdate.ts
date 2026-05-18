import { getAdminApp, getAdminDb } from "@/lib/firebaseAdmin";
import { handleTelegramStatCommand } from "@/lib/server/telegram/handleStatCommand";
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
import { isTelegramAdmin, parseAdminTelegramIds } from "@/lib/server/telegram/telegramAdminAuth";
import {
  isStatTelegramCommand,
  normalizeBotCommandToken,
} from "@/lib/server/telegram/telegramWebhookCommands";
import {
  extractTelegramIdentityFromWebhook,
  syncTelegramIdentityFromWebhook,
} from "@/lib/server/telegramUserLink";
import { confirmTelegramLoginSession } from "@/lib/server/telegramLoginSession";

export type TelegramWebhookUpdate = {
  update_id?: number;
  message?: {
    text?: string;
    chat?: { id?: number };
    from?: {
      id?: number;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
    [key: string]: unknown;
  };
  callback_query?: {
    id: string;
    from?: { id?: number };
    message?: { chat?: { id?: number }; message_id?: number };
    data?: string;
  };
};

const MESSAGE_JSON_MAX = 14_000;

function safeJsonStringify(value: unknown, maxLen = MESSAGE_JSON_MAX): string {
  try {
    const s = JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? String(v) : v));
    return s.length > maxLen ? `${s.slice(0, maxLen)}…[truncated]` : s;
  } catch (e) {
    return JSON.stringify({
      error: "stringify_failed",
      detail: e instanceof Error ? e.message : String(e),
    });
  }
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

function scheduleIdentitySync(
  db: ReturnType<typeof getAdminDb>,
  msg: NonNullable<TelegramWebhookUpdate["message"]>
): void {
  if (!db) return;
  const identity = extractTelegramIdentityFromWebhook(msg);
  if (!identity) return;
  void syncTelegramIdentityFromWebhook(db, identity).catch((e) => {
    console.warn("TELEGRAM_IDENTITY_SYNC_DEFERRED_ERROR", {
      message: e instanceof Error ? e.message : String(e),
    });
  });
}

async function handleStatCommandFastPath(params: {
  chatId: number;
  textRaw: string;
  cmd0: string;
  fromTelegramUserId?: number;
}): Promise<boolean> {
  if (!isStatTelegramCommand(params.textRaw, params.cmd0)) return false;

  const chatStr = String(params.chatId);
  console.log("TELEGRAM_COMMAND_DETECTED", { command: "/stat", chatId: chatStr });
  console.log("TELEGRAM_STAT_HANDLER_ENTER", {
    chatId: chatStr,
    telegramUserId: params.fromTelegramUserId ?? null,
  });

  const adminIds = parseAdminTelegramIds();
  const allowed = isTelegramAdmin({
    chatId: params.chatId,
    fromTelegramUserId: params.fromTelegramUserId,
  });

  console.log("STAT_AUTH_CHECK", {
    chatId: chatStr,
    telegramUserId: params.fromTelegramUserId ?? null,
    adminIdsCount: adminIds.length,
    allowed,
  });

  if (!allowed) {
    console.log("STAT_AUTH_DENIED", { chatId: chatStr });
    await sendTelegramMessage(
      chatStr,
      "Команда /stat доступна только администратору."
    );
    console.log("TELEGRAM_STAT_HANDLER_EXIT", { chatId: chatStr, outcome: "denied" });
    return true;
  }

  console.log("STAT_AUTH_ALLOWED", { chatId: chatStr });

  if (process.env.TELEGRAM_STAT_DEBUG_ACK === "1") {
    await sendTelegramMessage(chatStr, "DEBUG: /stat handler reached");
  }

  const dbStat = getAdminDb();
  if (!dbStat) {
    await sendTelegramMessage(chatStr, "Сервер временно недоступен. Попробуйте позже.");
    console.log("TELEGRAM_STAT_HANDLER_EXIT", { chatId: chatStr, outcome: "no_db" });
    return true;
  }

  await handleTelegramStatCommand({
    chatId: chatStr,
    telegramUserId: params.fromTelegramUserId,
  });

  console.log("TELEGRAM_STAT_HANDLER_EXIT", { chatId: chatStr, outcome: "done" });
  return true;
}

export async function processTelegramWebhookUpdate(update: TelegramWebhookUpdate): Promise<void> {
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
    return;
  }

  const msg = update.message;
  if (!msg) return;

  const chatId = msg.chat?.id;
  if (chatId == null || !Number.isFinite(chatId)) return;

  const textRaw = String(msg.text ?? "");
  const normalized = textRaw.trim().toLowerCase();
  const cmd0 = normalizeBotCommandToken(textRaw);
  const fromTelegramUserId = msg.from?.id;

  if (
    await handleStatCommandFastPath({
      chatId: Number(chatId),
      textRaw,
      cmd0,
      fromTelegramUserId:
        fromTelegramUserId != null && Number.isFinite(fromTelegramUserId)
          ? Number(fromTelegramUserId)
          : undefined,
    })
  ) {
    scheduleIdentitySync(dbPartner, msg);
    return;
  }

  scheduleIdentitySync(dbPartner, msg);

  if (cmd0 === "/manager") {
    console.log("TELEGRAM_MANAGER_COMMAND_RECEIVED", {
      chatId,
      fromId: fromTelegramUserId,
      hasDb: Boolean(dbPartner),
    });
  }

  const sessionIdFromStart = parseStartSessionId(textRaw);
  const isAdminChat = isTelegramAdmin({
    chatId,
    fromTelegramUserId,
  });

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
      if (signupHandled) return;
    }
  } else if (cmd0 === "/manager") {
    await sendTelegramMessage(
      String(chatId),
      "Команда /manager сейчас недоступна: на сервере нет подключения к базе данных."
    );
    return;
  }

  if (dbPartner && cmd0 === "/partner") {
    const fromId = msg.from?.id;
    if (fromId == null || !Number.isFinite(fromId)) {
      await sendTelegramMessage(String(chatId), "Не удалось определить ваш Telegram id.");
      return;
    }
    await sendPartnerCabinet(dbPartner, String(chatId), Number(fromId));
    return;
  }

  if (dbPartner && isAdminChat) {
    const detailCode = parseSlashPartnerAdminCode(textRaw, "/partner_detail");
    if (detailCode) {
      await sendAdminPartnerDetail(dbPartner, String(chatId), detailCode);
      return;
    }
    const disableCode = parseSlashPartnerAdminCode(textRaw, "/disable_partner");
    if (disableCode) {
      await sendAdminPartnerToggle(dbPartner, String(chatId), disableCode, false);
      return;
    }
    const enableCode = parseSlashPartnerAdminCode(textRaw, "/enable_partner");
    if (enableCode) {
      await sendAdminPartnerToggle(dbPartner, String(chatId), enableCode, true);
      return;
    }
  }

  if (dbPartner && cmd0 === "/partners") {
    if (!isAdminChat) {
      await sendTelegramMessage(String(chatId), "Команда /partners доступна только администратору.");
      return;
    }
    await sendAdminPartnersList(dbPartner, String(chatId));
    return;
  }

  const addPartner = parseAddPartnerCommand(textRaw);
  if (dbPartner && addPartner) {
    if (!isAdminChat) {
      await sendTelegramMessage(String(chatId), "Создание менеджера доступно только администратору.");
      return;
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
      return;
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
    return;
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
      return;
    }
    const app = getAdminApp();
    const db = getAdminDb();
    if (!app || !db) {
      await sendTelegramMessage(
        String(chatId),
        "Сервер временно недоступен. Попробуйте снова через минуту."
      );
      return;
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
      await sendTelegramMessage(
        String(chatId),
        "Аккаунт с этим Telegram не найден. Зарегистрируйтесь на сайте с email."
      );
      return;
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
            ? "Сессия входа не найдена."
            : "Вход уже подтверждён. Вернитесь на сайт.";
      await sendTelegramMessage(String(chatId), text);
      return;
    }

    await sendTelegramMessage(String(chatId), "Вход подтверждён. Вернитесь на сайт.");
    return;
  }

  if (normalized === "/start") {
    await sendTelegramMessage(
      String(chatId),
      "Бот подключён. Теперь вы можете подтверждать вход через Telegram."
    );
  }

  console.log("[telegram/webhook] update.message:", safeJsonStringify(msg));
}
