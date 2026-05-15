import type { UserTrialFields } from "@/lib/trialSubscription";
import {
  TRIAL_DAYS,
  firestoreTimeToMs,
  getTrialEndMs,
  isPaidActive,
  isTrialPending,
  isTrialRunning,
  paidPeriodEndsMs,
} from "@/lib/trialSubscription";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Дата для кабинета: ДД.MM.ГГГГ */
export function formatCabinetDateRu(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return new Date(ms).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Конец trial для отображения: getTrialEndMs, иначе firstCalculationAt + TRIAL_DAYS. */
export function getTrialEndMsForCabinetDisplay(
  user: UserTrialFields | null | undefined
): number {
  if (!user) return 0;
  const fromHelpers = getTrialEndMs(user);
  if (fromHelpers > 0) return fromHelpers;
  const firstCalc = firestoreTimeToMs(user.firstCalculationAt);
  if (firstCalc > 0) return firstCalc + TRIAL_DAYS * MS_PER_DAY;
  return 0;
}

export type CabinetAccessStatusLabel = "Триал активен" | "Подписка активна" | "Доступ истёк";

/** Статус для строки «Статус» в кабинете (web / Mini App). paidUntil в приоритете. */
export function cabinetAccessStatusLabel(
  user: UserTrialFields | null | undefined
): CabinetAccessStatusLabel {
  if (!user) return "Доступ истёк";
  if (isPaidActive(user)) return "Подписка активна";
  const paidEnd = paidPeriodEndsMs(user);
  if (paidEnd > Date.now()) return "Подписка активна";
  if (isTrialRunning(user) || isTrialPending(user)) return "Триал активен";
  const trialEnd = getTrialEndMsForCabinetDisplay(user);
  if (trialEnd > Date.now()) return "Триал активен";
  return "Доступ истёк";
}

/** Срок для строки «Срок» в кабинете: «до ДД.MM.ГГГГ» или «—». */
export function cabinetAccessUntilLabel(
  user: UserTrialFields | null | undefined
): string {
  if (!user) return "—";

  const paidMs = paidPeriodEndsMs(user);
  if (paidMs > Date.now()) {
    return `до ${formatCabinetDateRu(paidMs)}`;
  }

  const paidUntilRaw = firestoreTimeToMs(user.paidUntil);
  if (paidUntilRaw > Date.now()) {
    return `до ${formatCabinetDateRu(paidUntilRaw)}`;
  }

  if (isTrialPending(user) || isTrialRunning(user)) {
    const end = getTrialEndMsForCabinetDisplay(user);
    return end > 0 ? `до ${formatCabinetDateRu(end)}` : "—";
  }

  const trialEnd = getTrialEndMsForCabinetDisplay(user);
  if (trialEnd > Date.now()) {
    return `до ${formatCabinetDateRu(trialEnd)}`;
  }

  return "—";
}
