import type { Firestore } from "firebase-admin/firestore";
import { buildPartnerManagerLinksBlock } from "@/lib/server/partnerManager/partnerManagerLinks";
import { notifyAdminNewSelfRegisteredPartner } from "@/lib/server/partnerManager/b2bPartnerNotify";
import {
  createSelfRegisteredPartnerManager,
  getPartnerManagerByTelegramUserId,
} from "@/lib/server/partnerManager/partnerManagerB2b";
import {
  deletePartnerManagerSignupSession,
  lookupPartnerManagerSignupSession,
  saveSignupSessionName,
  startPartnerManagerSignupSession,
  validatePartnerManagerSignupName,
  validatePartnerManagerSignupPhone,
} from "@/lib/server/partnerManager/partnerManagerSignupSession";
import { sendPartnerCabinet } from "@/lib/server/partnerManager/telegramPartnerBotHandlers";
import { sendTelegramMessage } from "@/lib/server/sendTelegramMessage";

function managerWelcomeAfterSignup(code: string): string {
  const { text, webUrl } = buildPartnerManagerLinksBlock(code);
  return [
    "Готово. Вы добавлены как менеджер.",
    "",
    text,
    "",
    "Шаблон сообщения клиенту (можно скопировать и отредактировать):",
    "",
    `Привет! Смету по монтажу кондиционера можно посчитать здесь: ${webUrl}`,
    "Это калькулятор HVAC-SaaS — удобно на объекте и для клиента.",
  ].join("\n");
}

/**
 * /manager, /cancel во время анкеты, и свободный текст по шагам сессии.
 * @returns true если сообщение обработано и дальше по цепочке webhook идти не нужно.
 */
export async function tryHandlePartnerManagerSignupWebhook(params: {
  db: Firestore;
  chatId: number;
  textRaw: string;
  cmd0: string;
  fromId: number;
  telegramUsername?: string | null;
}): Promise<boolean> {
  const { db, chatId, textRaw, cmd0, fromId, telegramUsername } = params;
  const chatStr = String(chatId);

  if (cmd0 === "/cancel") {
    const session = await lookupPartnerManagerSignupSession(db, fromId);
    if (session.status === "active") {
      await deletePartnerManagerSignupSession(db, fromId);
      await sendTelegramMessage(chatStr, "Регистрация партнёра отменена.");
      return true;
    }
    return false;
  }

  if (cmd0 === "/manager") {
    const existing = await getPartnerManagerByTelegramUserId(db, fromId);
    if (existing) {
      await deletePartnerManagerSignupSession(db, fromId);
      const links = buildPartnerManagerLinksBlock(existing.data.code);
      await sendTelegramMessage(
        chatStr,
        [
          "Вы уже зарегистрированы как менеджер HVAC-SaaS.",
          "",
          links.text,
          "",
          "Ниже — кабинет партнёра в боте (статистика и ссылки).",
        ].join("\n")
      );
      await sendPartnerCabinet(db, chatStr, fromId);
      return true;
    }
    await startPartnerManagerSignupSession({
      db,
      telegramUserId: fromId,
      telegramChatId: chatId,
      telegramUsername,
    });
    await sendTelegramMessage(chatStr, "Введите ваше имя:");
    return true;
  }

  const trimmed = textRaw.trim();
  if (!trimmed || trimmed.startsWith("/")) {
    return false;
  }

  const su = await lookupPartnerManagerSignupSession(db, fromId);
  if (su.status === "expired") {
    await sendTelegramMessage(
      chatStr,
      "Анкета устарела. Отправьте /manager заново."
    );
    return true;
  }
  if (su.status !== "active") {
    return false;
  }

  const step = su.data.step;
  if (step === "awaiting_name") {
    const v = validatePartnerManagerSignupName(trimmed);
    if (!v.ok) {
      await sendTelegramMessage(
        chatStr,
        "Введите имя текстом (2–80 символов). Например: Иван Петров"
      );
      return true;
    }
    await saveSignupSessionName({ db, telegramUserId: fromId, name: v.name });
    await sendTelegramMessage(chatStr, "Введите номер телефона.\nНапример: +7 999 123-45-67");
    return true;
  }

  if (step === "awaiting_phone") {
    const v = validatePartnerManagerSignupPhone(trimmed);
    if (!v.ok) {
      await sendTelegramMessage(
        chatStr,
        "Введите корректный номер телефона. Например: +7 999 123-45-67"
      );
      return true;
    }

    const again = await getPartnerManagerByTelegramUserId(db, fromId);
    if (again) {
      await deletePartnerManagerSignupSession(db, fromId);
      await sendTelegramMessage(chatStr, "Вы уже зарегистрированы как партнёр HVAC-SaaS.");
      await sendPartnerCabinet(db, chatStr, fromId);
      return true;
    }

    const name = String(su.data.name ?? "").trim();
    if (!name) {
      await deletePartnerManagerSignupSession(db, fromId);
      await sendTelegramMessage(
        chatStr,
        "Сессия анкеты повреждена. Отправьте /manager заново."
      );
      return true;
    }

    const created = await createSelfRegisteredPartnerManager({
      db,
      name,
      phone: v.phone,
      telegramUserId: fromId,
      telegramChatId: chatId,
      telegramUsername,
    });

    if (!created.ok) {
      if (created.reason === "duplicate_telegram") {
        await deletePartnerManagerSignupSession(db, fromId);
        await sendTelegramMessage(chatStr, "Вы уже зарегистрированы как партнёр HVAC-SaaS.");
        await sendPartnerCabinet(db, chatStr, fromId);
        return true;
      }
      await sendTelegramMessage(
        chatStr,
        "Не удалось завершить регистрацию. Попробуйте /manager позже."
      );
      return true;
    }

    await deletePartnerManagerSignupSession(db, fromId);
    try {
      await notifyAdminNewSelfRegisteredPartner({
        name,
        phone: v.phone,
        code: created.code,
        telegramUserId: fromId,
      });
    } catch (e) {
      console.error("[partner signup] notify admin failed", e);
    }

    await sendTelegramMessage(chatStr, managerWelcomeAfterSignup(created.code));
    await sendPartnerCabinet(db, chatStr, fromId);
    return true;
  }

  return false;
}
