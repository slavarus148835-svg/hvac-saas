import { firestoreTimeToMs } from "@/lib/server/firestoreTimeMs";

export type UserRecord = Record<string, unknown>;

/** База для MRR в /stat (₽ за одну активную подписку в месяц). */
export const MONTHLY_SUBSCRIPTION_PRICE_RUB = 1190 as const;

/** Формат суммы для Telegram (целые ₽, пробелы тысяч). */
export function formatRubForTelegram(n: number): string {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(n))} ₽`;
}

/** Источник lastPaymentConfirmed, который не считается банковской оплатой (ручной debug). */
export const LAST_PAYMENT_CONFIRMED_SOURCE_DEBUG_RECOVERY =
  "debug_grant_paid_access_recovery" as const;

/** Подтверждение через callback Т-Банка (см. app/api/tbank/webhook). */
export const LAST_PAYMENT_CONFIRMED_SOURCE_WEBHOOK = "webhook" as const;

/** Подтверждение через GetState (см. app/api/tbank/check-payment). */
export const LAST_PAYMENT_CONFIRMED_SOURCE_GETSTATE = "getstate" as const;

/** Placeholder orderId из ручного восстановления доступа (не банк). */
export const LAST_PAYMENT_CONFIRMED_ORDER_MANUAL_RECOVERY =
  "manual_recovery_intent_bug" as const;

/**
 * Широкий критерий «имеют платный доступ»:
 * hasPaid, plan standard|pro, paidUntil в будущем, любой объект lastPaymentConfirmed, paidAt.
 * Для «Оплатили» (реальный банк) в /stat не используется — см. `userHasConfirmedBankPayment`.
 */
export function isPaidUserForStatsTotals(user: UserRecord, nowMs: number): boolean {
  if (user.hasPaid === true) return true;
  const plan = user.plan;
  if (plan === "standard" || plan === "pro") return true;
  const pu = firestoreTimeToMs(user.paidUntil);
  if (pu > nowMs) return true;
  const lpc = user.lastPaymentConfirmed;
  if (lpc && typeof lpc === "object" && !Array.isArray(lpc)) return true;
  if (firestoreTimeToMs(user.paidAt) > 0) return true;
  return false;
}

/** Алиас: широкий «платный доступ» (как `isPaidUserForStatsTotals`). */
export function userHasActivePaidAccess(user: UserRecord, nowMs: number): boolean {
  return isPaidUserForStatsTotals(user, nowMs);
}

function lastPaymentConfirmedSourceOk(sourceTrimmed: string): boolean {
  if (sourceTrimmed === "") return true;
  if (sourceTrimmed === LAST_PAYMENT_CONFIRMED_SOURCE_GETSTATE) return true;
  if (sourceTrimmed === LAST_PAYMENT_CONFIRMED_SOURCE_WEBHOOK) return true;
  return false;
}

/**
 * Подтверждённая оплата Т-Банка: только по `lastPaymentConfirmed` с orderId и допустимым source.
 * Не считает оплатой сами по себе hasPaid, plan, paidUntil, верхний paidAt, пустой lastPaymentConfirmed.
 */
export function userHasConfirmedBankPayment(user: UserRecord): boolean {
  const lpc = user.lastPaymentConfirmed;
  if (!lpc || typeof lpc !== "object" || Array.isArray(lpc)) return false;
  const o = lpc as Record<string, unknown>;
  const orderId = String(o.orderId ?? "").trim();
  if (!orderId) return false;
  if (orderId === LAST_PAYMENT_CONFIRMED_ORDER_MANUAL_RECOVERY) return false;
  const source = String(o.source ?? "").trim();
  if (source === LAST_PAYMENT_CONFIRMED_SOURCE_DEBUG_RECOVERY) return false;
  if (!lastPaymentConfirmedSourceOk(source)) return false;
  return true;
}

/**
 * Активная платная подписка по банку: подтверждённый платёж и `paidUntil` в будущем.
 * Не использует hasPaid/plan/legacy-доступ без подтверждённого `lastPaymentConfirmed`.
 */
export function userHasActiveConfirmedBankSubscription(user: UserRecord, nowMs: number): boolean {
  if (!userHasConfirmedBankPayment(user)) return false;
  return firestoreTimeToMs(user.paidUntil) > nowMs;
}

/**
 * Дата события подтверждённой банковской оплаты только из полей `lastPaymentConfirmed`
 * (без верхнеуровневого `user.paidAt`).
 */
export function getConfirmedBankPaymentEventMs(user: UserRecord): number {
  if (!userHasConfirmedBankPayment(user)) return 0;
  const lpc = user.lastPaymentConfirmed as Record<string, unknown>;
  const fromConfirmed = firestoreTimeToMs(lpc.confirmedAt);
  if (fromConfirmed > 0) return fromConfirmed;
  const fromNestedPaidAt = firestoreTimeToMs(lpc.paidAt);
  if (fromNestedPaidAt > 0) return fromNestedPaidAt;
  const fromCreated = firestoreTimeToMs(lpc.createdAt);
  if (fromCreated > 0) return fromCreated;
  const fromRestored = firestoreTimeToMs(lpc.restoredAt);
  if (fromRestored > 0) return fromRestored;
  return 0;
}

/** Почему запись считается подтверждённой банковской оплатой (для debug). */
export function getConfirmedBankPaymentReasons(user: UserRecord): string[] {
  if (!userHasConfirmedBankPayment(user)) return [];
  const o = user.lastPaymentConfirmed as Record<string, unknown>;
  const reasons: string[] = ["lastPaymentConfirmed.orderId+allowed_source"];
  const source = String(o.source ?? "").trim();
  if (source === LAST_PAYMENT_CONFIRMED_SOURCE_GETSTATE) {
    reasons.push("source:getstate");
  } else if (source === LAST_PAYMENT_CONFIRMED_SOURCE_WEBHOOK) {
    reasons.push("source:webhook");
  } else {
    reasons.push("source:legacy_empty_implicit_webhook");
  }
  return reasons;
}

/** @deprecated Используйте `getConfirmedBankPaymentReasons`. */
export const getConfirmedPaymentMatchReasons = getConfirmedBankPaymentReasons;

/**
 * Ветки широкого «доступа» (`isPaidUserForStatsTotals`), все сработавшие условия (для debug).
 */
export function getAccessPaidMatchReasons(user: UserRecord, nowMs: number): string[] {
  const reasons: string[] = [];
  if (user.hasPaid === true) reasons.push("hasPaid");
  const plan = user.plan;
  if (plan === "standard" || plan === "pro") reasons.push("plan");
  const pu = firestoreTimeToMs(user.paidUntil);
  if (pu > nowMs) reasons.push("paidUntilFuture");
  const lpc = user.lastPaymentConfirmed;
  if (lpc && typeof lpc === "object" && !Array.isArray(lpc)) {
    reasons.push("lastPaymentConfirmedObject");
  }
  if (firestoreTimeToMs(user.paidAt) > 0) reasons.push("paidAt");
  return reasons;
}

export function isSuspiciousAccessOnlyLegacy(
  accessReasons: string[],
  hasConfirmedBank: boolean
): boolean {
  if (hasConfirmedBank) return false;
  if (accessReasons.length === 0) return false;
  const hasStrong = accessReasons.some(
    (r) =>
      r === "hasPaid" ||
      r === "lastPaymentConfirmedObject" ||
      r === "paidUntilFuture"
  );
  if (hasStrong) return false;
  return accessReasons.every((r) => r === "plan" || r === "paidAt");
}

/**
 * Дата события оплаты для legacy/прочих агрегатов: сначала верхний paidAt, затем поля в lastPaymentConfirmed.
 */
export function getPaidEventMsForStats(user: UserRecord): number {
  const fromPaidAt = firestoreTimeToMs(user.paidAt);
  if (fromPaidAt > 0) return fromPaidAt;

  const lpc = user.lastPaymentConfirmed;
  if (!lpc || typeof lpc !== "object" || Array.isArray(lpc)) return 0;

  const o = lpc as Record<string, unknown>;
  const keys = ["confirmedAt", "restoredAt", "createdAt"] as const;
  for (const k of keys) {
    const t = firestoreTimeToMs(o[k]);
    if (t > 0) return t;
  }
  return 0;
}
