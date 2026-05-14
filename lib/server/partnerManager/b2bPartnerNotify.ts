import type { Firestore } from "firebase-admin/firestore";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { PARTNER_MANAGERS_COLLECTION } from "@/lib/partner/b2bConstants";
import { computeB2BCommissionFromPaymentKop } from "@/lib/server/partnerManager/b2bCommissionMath";
import { sendTelegramMessage } from "@/lib/server/sendTelegramMessage";

function adminChatId(): string | null {
  const v = String(process.env.ADMIN_TELEGRAM_CHAT_ID ?? "").trim();
  return v || null;
}

export function maskEmailForManager(email: string | null | undefined): string | null {
  if (!email || !String(email).includes("@")) return null;
  const e = String(email).trim();
  const [local, domain] = e.split("@");
  if (!local || !domain) return "***@***";
  if (local.length <= 2) return `**@${domain}`;
  return `${local.slice(0, 3)}***@${domain}`;
}

export function formatRuDateTime(ms?: number): string {
  const d = ms && ms > 0 ? new Date(ms) : new Date();
  return d.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
}

export async function loadUserContactForB2BNotify(
  db: Firestore,
  uid: string
): Promise<{ email: string | null; telegramId: string | null; uid: string }> {
  const snap = await db.collection(PRICING_FS.users).doc(uid).get();
  const u = snap.data() ?? {};
  const email = typeof u.email === "string" ? u.email.trim() : "";
  const tg =
    (typeof u.telegramUserId === "string" && u.telegramUserId.trim()) ||
    (typeof u.telegramId === "string" && u.telegramId.trim()) ||
    "";
  return { email: email || null, telegramId: tg || null, uid };
}

async function pendingPayoutRub(db: Firestore, managerId: string): Promise<number> {
  const snap = await db.collection(PARTNER_MANAGERS_COLLECTION).doc(managerId).get();
  const m = snap.data() ?? {};
  const accrued = Math.round(Number(m.commissionAccruedKop) || 0);
  const paid = Math.round(Number(m.commissionPaidOutKop) || 0);
  return Math.max(0, accrued - paid) / 100;
}

type RegistrationCtx = {
  userId: string;
  partnerManagerId: string;
  partnerCode: string;
  managerName: string;
  source: "web" | "telegram_miniapp";
};

type FirstCalcCtx = {
  userId: string;
  partnerManagerId: string;
  partnerCode: string;
  managerName: string;
};

type PaymentCtx = {
  userId: string;
  partnerManagerId: string;
  partnerCode: string;
  managerName: string;
  orderId: string;
  amountKop: number;
};

type RefundCtx = {
  userId: string;
  partnerManagerId: string;
  partnerCode: string;
  managerName: string;
  orderId: string;
  commissionAmountKop: number;
  tbankStatus: string;
};

export type AdminPartnerNotifyPayload =
  | ({ type: "registration" } & RegistrationCtx)
  | ({ type: "first_calculation" } & FirstCalcCtx)
  | ({ type: "payment" } & PaymentCtx)
  | ({ type: "refund" } & RefundCtx);

async function sendAdmin(text: string): Promise<void> {
  const id = adminChatId();
  if (!id) {
    console.warn("[b2bPartnerNotify] ADMIN_TELEGRAM_CHAT_ID is empty");
    return;
  }
  const r = await sendTelegramMessage(id, text);
  if (!r.ok) {
    console.error("[b2bPartnerNotify] admin send failed", r.error);
  }
}

async function sendManager(chatId: number, text: string): Promise<void> {
  const r = await sendTelegramMessage(String(chatId), text);
  if (!r.ok) {
    console.error("[b2bPartnerNotify] manager send failed", r.error);
  }
}

/** Уведомление админу после успешной записи partnerEvent. */
export async function notifyAdminPartnerManagerEvent(
  db: Firestore,
  payload: AdminPartnerNotifyPayload
): Promise<void> {
  const user = await loadUserContactForB2BNotify(db, payload.userId);

  try {
    if (payload.type === "registration") {
      await sendAdmin(
        [
          "🆕 Новый пользователь по партнёрской ссылке",
          "",
          `Менеджер: ${payload.managerName}`,
          `Код: ${payload.partnerCode}`,
          "",
          "Пользователь:",
          `Email: ${user.email ?? "—"}`,
          `Telegram ID: ${user.telegramId ?? "—"}`,
          `UID: ${user.uid}`,
          "",
          `Источник: ${payload.source === "telegram_miniapp" ? "telegram_miniapp" : "web"}`,
          `Дата: ${formatRuDateTime()}`,
        ].join("\n")
      );
      return;
    }

    if (payload.type === "first_calculation") {
      await sendAdmin(
        [
          "🧮 Первый расчёт по партнёрской ссылке",
          "",
          `Менеджер: ${payload.managerName}`,
          `Код: ${payload.partnerCode}`,
          "",
          "Пользователь:",
          `Email: ${user.email ?? "—"}`,
          `Telegram ID: ${user.telegramId ?? "—"}`,
          `UID: ${user.uid}`,
          "",
          `Дата: ${formatRuDateTime()}`,
        ].join("\n")
      );
      return;
    }

    if (payload.type === "payment") {
      const calc = computeB2BCommissionFromPaymentKop(payload.amountKop);
      const taxRub = calc.amountRub - calc.netAfterTaxRub;
      await sendAdmin(
        [
          "💰 Новая оплата по партнёрской ссылке",
          "",
          `Менеджер: ${payload.managerName}`,
          `Код: ${payload.partnerCode}`,
          "",
          "Пользователь:",
          `Email: ${user.email ?? "—"}`,
          `Telegram ID: ${user.telegramId ?? "—"}`,
          `UID: ${user.uid}`,
          "",
          `Оплата: ${calc.amountRub.toFixed(2)} ₽`,
          `Налог 12%: ${taxRub.toFixed(2)} ₽`,
          `База после налога: ${calc.netAfterTaxRub.toFixed(2)} ₽`,
          `Комиссия менеджера 30%: ${calc.commissionAmountRub.toFixed(2)} ₽`,
          "",
          `Order ID: ${payload.orderId}`,
          `Дата: ${formatRuDateTime()}`,
        ].join("\n")
      );
      return;
    }

    if (payload.type === "refund") {
      const rub = payload.commissionAmountKop / 100;
      await sendAdmin(
        [
          "↩️ Возврат по партнёрской оплате",
          "",
          `Менеджер: ${payload.managerName}`,
          `Код: ${payload.partnerCode}`,
          "",
          "Пользователь:",
          `Email: ${user.email ?? "—"}`,
          `Telegram ID: ${user.telegramId ?? "—"}`,
          `UID: ${user.uid}`,
          "",
          `Сторно комиссии: ${rub.toFixed(2)} ₽`,
          `Order ID: ${payload.orderId}`,
          `Статус T-Bank: ${payload.tbankStatus}`,
          `Дата: ${formatRuDateTime()}`,
        ].join("\n")
      );
    }
  } catch (e) {
    console.error("[notifyAdminPartnerManagerEvent]", e);
  }
}

export type ManagerPartnerNotifyPayload =
  | {
      type: "registration";
      managerTelegramChatId: number;
      source: "web" | "telegram_miniapp";
      partnerManagerId: string;
    }
  | {
      type: "first_calculation";
      managerTelegramChatId: number;
      partnerManagerId: string;
    }
  | {
      type: "payment";
      managerTelegramChatId: number;
      partnerManagerId: string;
      amountKop: number;
    }
  | {
      type: "refund";
      managerTelegramChatId: number;
      partnerManagerId: string;
      commissionKop: number;
    };

/** Уведомление менеджеру (без лишних персональных данных). */
export async function notifyPartnerManagerEvent(
  db: Firestore,
  payload: ManagerPartnerNotifyPayload
): Promise<void> {
  const chatId = payload.managerTelegramChatId;
  if (!Number.isFinite(chatId) || chatId <= 0) return;

  try {
    if (payload.type === "registration") {
      const src = payload.source === "telegram_miniapp" ? "telegram_miniapp" : "web";
      await sendManager(
        chatId,
        [
          "🆕 По вашей ссылке зарегистрировался новый пользователь",
          "",
          `Источник: ${src}`,
          `Дата: ${formatRuDateTime()}`,
        ].join("\n")
      );
      return;
    }

    if (payload.type === "first_calculation") {
      await sendManager(
        chatId,
        [
          "🧮 Пользователь по вашей ссылке сделал первый расчёт",
          "",
          `Дата: ${formatRuDateTime()}`,
        ].join("\n")
      );
      return;
    }

    if (payload.type === "payment") {
      const calc = computeB2BCommissionFromPaymentKop(payload.amountKop);
      const pending = await pendingPayoutRub(db, payload.partnerManagerId);
      await sendManager(
        chatId,
        [
          "💰 Пользователь по вашей ссылке оплатил подписку",
          "",
          `Оплата: ${calc.amountRub.toFixed(2)} ₽`,
          `Ваш бонус: ${calc.commissionAmountRub.toFixed(2)} ₽`,
          "",
          `Ожидает выплаты всего: ${pending.toFixed(2)} ₽`,
        ].join("\n")
      );
      return;
    }

    if (payload.type === "refund") {
      const rub = payload.commissionKop / 100;
      const pending = await pendingPayoutRub(db, payload.partnerManagerId);
      await sendManager(
        chatId,
        [
          "↩️ По оплате пользователя был возврат",
          "",
          `Сторно бонуса: ${rub.toFixed(2)} ₽`,
          `Ожидает выплаты всего: ${pending.toFixed(2)} ₽`,
        ].join("\n")
      );
    }
  } catch (e) {
    console.error("[notifyPartnerManagerEvent]", e);
  }
}

export async function loadPartnerManagerName(
  db: Firestore,
  managerId: string
): Promise<string> {
  const snap = await db.collection(PARTNER_MANAGERS_COLLECTION).doc(managerId).get();
  const n = snap.data()?.name;
  return typeof n === "string" && n.trim() ? n.trim() : managerId;
}

/** Саморегистрация менеджера через Telegram (не B2B-событие клиента). */
export async function notifyAdminNewSelfRegisteredPartner(params: {
  name: string;
  phone: string;
  code: string;
  telegramUserId: number;
}): Promise<void> {
  await sendAdmin(
    [
      "🤝 Новый менеджер зарегистрировался",
      "",
      `Имя: ${params.name}`,
      `Телефон: ${params.phone}`,
      `Код: ${params.code}`,
      `Telegram ID: ${params.telegramUserId}`,
    ].join("\n")
  );
}
