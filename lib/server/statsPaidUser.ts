import { firestoreTimeToMs } from "@/lib/server/firestoreTimeMs";

export type UserRecord = Record<string, unknown>;

/**
 * Пользователь считается оплатившим для агрегатов «всего оплатили»,
 * если выполняется хотя бы одно условие (в т.ч. ручное восстановление доступа).
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

/**
 * Дата события оплаты для попадания в окна «вчера» / «7 дней» / отчётный период.
 * Если не удалось извлечь — 0 (пользователь может быть в paidTotal, но не в периоде).
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
