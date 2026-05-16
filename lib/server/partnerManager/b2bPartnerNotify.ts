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

/** Сумма в ₽: целые без копеек, иначе 2 знака. */
export function formatRubAmount(rub: number): string {
  const n = Number(rub);
  if (!Number.isFinite(n)) return "0 ₽";
  if (Math.abs(n - Math.round(n)) < 0.005) {
    return `${Math.round(n)} ₽`;
  }
  return `${n.toFixed(2)} ₽`;
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

export type PartnerManagerNotifyInfo = {
  name: string;
  code: string;
  telegramUserId: number | null;
  telegramChatId: number | null;
};

export async function loadPartnerManagerForB2BNotify(
  db: Firestore,
  managerId: string
): Promise<PartnerManagerNotifyInfo> {
  const snap = await db.collection(PARTNER_MANAGERS_COLLECTION).doc(managerId).get();
  const m = snap.data() ?? {};
  const name = typeof m.name === "string" && m.name.trim() ? m.name.trim() : managerId;
  const code = typeof m.code === "string" ? m.code.trim() : "";
  const telegramUserId =
    typeof m.telegramUserId === "number" && Number.isFinite(m.telegramUserId) && m.telegramUserId > 0
      ? Math.trunc(m.telegramUserId)
      : null;
  const telegramChatId =
    typeof m.telegramChatId === "number" && Number.isFinite(m.telegramChatId) && m.telegramChatId > 0
      ? Math.trunc(m.telegramChatId)
      : null;
  return { name, code, telegramUserId, telegramChatId };
}

async function pendingPayoutRub(db: Firestore, managerId: string): Promise<number> {
  const snap = await db.collection(PARTNER_MANAGERS_COLLECTION).doc(managerId).get();
  const m = snap.data() ?? {};
  const accrued = Math.round(Number(m.commissionAccruedKop) || 0);
  const paid = Math.round(Number(m.commissionPaidOutKop) || 0);
  return Math.max(0, accrued - paid) / 100;
}

function formatSourceLabel(source: "web" | "telegram_miniapp"): string {
  return source === "telegram_miniapp" ? "telegram_miniapp" : "web";
}

function buildAdminManagerBlock(mgr: PartnerManagerNotifyInfo): string[] {
  return [
    `Менеджер: ${mgr.name}`,
    `Код менеджера: ${mgr.code || "—"}`,
    `Telegram ID менеджера: ${mgr.telegramUserId ?? "—"}`,
  ];
}

function buildAdminClientBlock(user: {
  email: string | null;
  telegramId: string | null;
  uid: string;
}): string[] {
  return [
    "Клиент:",
    `Email: ${user.email ?? "—"}`,
    `Telegram ID: ${user.telegramId ?? "—"}`,
    `UID: ${user.uid}`,
  ];
}

type RegistrationCtx = {
  userId: string;
  partnerManagerId: string;
  source: "web" | "telegram_miniapp";
};

type FirstCalcCtx = {
  userId: string;
  partnerManagerId: string;
};

type PaymentCtx = {
  userId: string;
  partnerManagerId: string;
  orderId: string;
  amountKop: number;
};

type RefundCtx = {
  userId: string;
  partnerManagerId: string;
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
    console.error("[b2bPartnerNotify] manager send failed", { chatId, error: r.error });
  }
}

/** Уведомление админу после успешной записи partnerEvent. */
export async function notifyAdminPartnerManagerEvent(
  db: Firestore,
  payload: AdminPartnerNotifyPayload
): Promise<void> {
  const [user, mgr] = await Promise.all([
    loadUserContactForB2BNotify(db, payload.userId),
    loadPartnerManagerForB2BNotify(db, payload.partnerManagerId),
  ]);

  const managerLines = buildAdminManagerBlock(mgr);
  const clientLines = buildAdminClientBlock(user);
  const dateLine = `Дата: ${formatRuDateTime()}`;

  try {
    if (payload.type === "registration") {
      await sendAdmin(
        [
          "🆕 Новый пользователь по партнёрской ссылке",
          "",
          ...managerLines,
          "",
          ...clientLines,
          "",
          `Источник: ${formatSourceLabel(payload.source)}`,
          dateLine,
        ].join("\n")
      );
      return;
    }

    if (payload.type === "first_calculation") {
      await sendAdmin(
        [
          "🧮 Первый расчёт по партнёрской ссылке",
          "",
          ...managerLines,
          "",
          ...clientLines,
          "",
          dateLine,
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
          ...managerLines,
          "",
          ...clientLines,
          "",
          `Оплата: ${formatRubAmount(calc.amountRub)}`,
          `Налог 12%: ${formatRubAmount(taxRub)}`,
          `База после налога: ${formatRubAmount(calc.netAfterTaxRub)}`,
          `Комиссия менеджера 30%: ${formatRubAmount(calc.commissionAmountRub)}`,
          "",
          `Order ID: ${payload.orderId}`,
          dateLine,
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
          ...managerLines,
          "",
          ...clientLines,
          "",
          `Сторно комиссии: ${formatRubAmount(rub)}`,
          `Order ID: ${payload.orderId}`,
          `Статус T-Bank: ${payload.tbankStatus}`,
          dateLine,
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

/** Уведомление менеджеру (без email / Telegram ID / UID клиента). */
export async function notifyPartnerManagerEvent(
  db: Firestore,
  payload: ManagerPartnerNotifyPayload
): Promise<void> {
  const chatId = payload.managerTelegramChatId;
  if (!Number.isFinite(chatId) || chatId <= 0) {
    console.error("[notifyPartnerManagerEvent] missing telegramChatId", {
      partnerManagerId: payload.partnerManagerId,
      type: payload.type,
    });
    return;
  }

  try {
    if (payload.type === "registration") {
      await sendManager(
        chatId,
        [
          "🆕 По вашей ссылке зарегистрировался новый пользователь",
          "",
          `Источник: ${formatSourceLabel(payload.source)}`,
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
          `Оплата: ${formatRubAmount(calc.amountRub)}`,
          `Ваш бонус: ${formatRubAmount(calc.commissionAmountRub)}`,
          `Ожидает выплаты всего: ${formatRubAmount(pending)}`,
        ].join("\n")
      );
      return;
    }

    if (payload.type === "refund") {
      const rub = payload.commissionKop / 100;
      const pending = await pendingPayoutRub(db, payload.partnerManagerId);
      const bonusLine =
        rub <= 0
          ? `Сторно бонуса: ${formatRubAmount(rub)}`
          : `Сторно бонуса: -${formatRubAmount(rub)}`;
      await sendManager(
        chatId,
        [
          "↩️ По оплате пользователя был возврат",
          "",
          bonusLine,
          `Ожидает выплаты всего: ${formatRubAmount(pending)}`,
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
  const mgr = await loadPartnerManagerForB2BNotify(db, managerId);
  return mgr.name;
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
      `Код менеджера: ${params.code}`,
      `Telegram ID менеджера: ${params.telegramUserId}`,
    ].join("\n")
  );
}
