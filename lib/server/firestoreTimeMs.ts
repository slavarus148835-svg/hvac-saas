/**
 * Миллисекунды из поля Firestore (Admin или web Timestamp, число, ISO-строка).
 * Без зависимости от клиентского Firebase SDK.
 */
export function firestoreTimeToMs(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number" && Number.isFinite(value)) {
    const n = value;
    if (n >= 1e11) return Math.round(n);
    if (n >= 1e9) return Math.round(n * 1000);
    return n;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "toMillis" in value &&
    typeof (value as { toMillis: () => number }).toMillis === "function"
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "seconds" in value &&
    typeof (value as { seconds: unknown }).seconds === "number" &&
    Number.isFinite((value as { seconds: number }).seconds)
  ) {
    const s = (value as { seconds: number }).seconds;
    const ns =
      "nanoseconds" in value && typeof (value as { nanoseconds: number }).nanoseconds === "number"
        ? (value as { nanoseconds: number }).nanoseconds
        : 0;
    return s * 1000 + Math.floor(ns / 1e6);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      const n = Number(trimmed);
      if (Number.isFinite(n)) {
        if (n >= 1e11) return Math.round(n);
        if (n >= 1e9) return Math.round(n * 1000);
        return n;
      }
    }
    const t = Date.parse(trimmed);
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const DEFAULT_TRIAL_DAYS = 15;

/** Согласовано с lib/trialSubscription getTrialEndMs (без клиентского Firestore). */
export function getTrialEndMsFromRecord(user: Record<string, unknown>): number {
  const explicit = firestoreTimeToMs(user.trialEndsAt);
  if (explicit > 0) return explicit;
  const daysRaw = user.trialDays;
  const days =
    typeof daysRaw === "number" && Number.isFinite(daysRaw) && daysRaw > 0
      ? daysRaw
      : DEFAULT_TRIAL_DAYS;
  const started = firestoreTimeToMs(user.trialStartedAt);
  if (started > 0) {
    return started + days * MS_PER_DAY;
  }
  const created = firestoreTimeToMs(user.createdAt);
  if (created > 0) {
    return created + days * MS_PER_DAY;
  }
  return 0;
}
