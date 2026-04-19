import type { UserTrialFields } from "@/lib/trialSubscription";
import {
  getTrialEndMs,
  isPaidActive,
  isPaidSubscriptionLapsed,
  isTrialExpired,
  isTrialPending,
  isTrialRunning,
  logTrialAccessDebug,
  paidDaysRemainingWhileActive,
  trialDaysRemaining,
} from "@/lib/trialSubscription";

export type CabinetSubscriptionUiState =
  | "no_trial_started"
  | "trial_active_more_than_3_days"
  | "trial_active_3_days_or_less"
  | "trial_expired"
  | "paid_active_more_than_3_days"
  | "paid_active_3_days_or_less"
  | "paid_expired";

const NEAR_DAYS = 3;

/** Единственный источник состояния для кабинета и /billing (кроме API). */
export function getCabinetSubscriptionUiState(
  user: UserTrialFields | null | undefined
): CabinetSubscriptionUiState {
  if (!user) return "no_trial_started";

  logTrialAccessDebug(user, "getCabinetSubscriptionUiState");

  if (isPaidActive(user)) {
    const left = paidDaysRemainingWhileActive(user);
    if (left === null || left > NEAR_DAYS) return "paid_active_more_than_3_days";
    return "paid_active_3_days_or_less";
  }

  if (isPaidSubscriptionLapsed(user)) return "paid_expired";

  if (isTrialExpired(user)) return "trial_expired";

  if (isTrialPending(user)) return "no_trial_started";

  if (isTrialRunning(user)) {
    const t = trialDaysRemaining(user);
    if (t === null || t > NEAR_DAYS) return "trial_active_more_than_3_days";
    return "trial_active_3_days_or_less";
  }

  if (user.plan === "trial") {
    const endMs = getTrialEndMs(user);
    if (endMs > 0 && endMs <= Date.now()) return "trial_expired";
    return "no_trial_started";
  }

  return "no_trial_started";
}

/** Состояния 3, 4, 6, 7 — в интерфейсе допускаются кнопки/карточки, ведущие к оформлению доступа. */
export function cabinetShowsBillingNavigation(user: UserTrialFields | null | undefined): boolean {
  const s = getCabinetSubscriptionUiState(user);
  return (
    s === "trial_active_3_days_or_less" ||
    s === "trial_expired" ||
    s === "paid_active_3_days_or_less" ||
    s === "paid_expired"
  );
}

/** Цена и прямые формулировки про деньги — только после окончания trial или оплаченного периода. */
export function cabinetShowsPriceAndPaymentCopy(
  user: UserTrialFields | null | undefined
): boolean {
  const s = getCabinetSubscriptionUiState(user);
  return s === "trial_expired" || s === "paid_expired";
}

/** Мягкий блок «скоро конец срока» для trial (осталось ≤3 дней, период ещё идёт). */
export function cabinetShowsTrialNearExpirySoftBlock(
  user: UserTrialFields | null | undefined
): boolean {
  return getCabinetSubscriptionUiState(user) === "trial_active_3_days_or_less";
}

/** Мягкий блок для оплаченного доступа: осталось ≤3 дней. */
export function cabinetShowsPaidNearExpirySoftBlock(
  user: UserTrialFields | null | undefined
): boolean {
  return getCabinetSubscriptionUiState(user) === "paid_active_3_days_or_less";
}

export function cabinetShowsTrialExpiredHardBlock(
  user: UserTrialFields | null | undefined
): boolean {
  return getCabinetSubscriptionUiState(user) === "trial_expired";
}

export function cabinetShowsPaidExpiredHardBlock(
  user: UserTrialFields | null | undefined
): boolean {
  return getCabinetSubscriptionUiState(user) === "paid_expired";
}

export const CABINET_MONTHLY_PRICE_RUB = 1190;

export function cabinetPostExpiryPriceLine(): string {
  return `Полный доступ снова — ${CABINET_MONTHLY_PRICE_RUB} ₽ в месяц.`;
}

export function cabinetNearExpirySoftParagraphs(): string[] {
  return [
    "Чтобы не прерывать работу на объекте, заранее сохраните непрерывный доступ к разделам.",
    "Сервис уже в ежедневном использовании — при необходимости обновите срок до паузы в доступе.",
  ];
}

export function cabinetBillingPrimaryCtaLabel(state: CabinetSubscriptionUiState): string {
  if (state === "trial_expired" || state === "paid_expired") return "Оформить доступ";
  return "Продлить доступ";
}

/** Текст на бейдже в шапке кабинета без слов «тариф», «оплата», «подписка». */
export function cabinetBadgeLabel(state: CabinetSubscriptionUiState): string {
  switch (state) {
    case "no_trial_started":
      return "Старт с первого расчёта";
    case "trial_active_more_than_3_days":
      return "Инструменты открыты";
    case "trial_active_3_days_or_less":
      return "Скоро пауза в доступе";
    case "trial_expired":
      return "Нужен доступ";
    case "paid_active_more_than_3_days":
      return "Инструменты открыты";
    case "paid_active_3_days_or_less":
      return "Скоро пауза в доступе";
    case "paid_expired":
      return "Нужен доступ";
    default:
      return "—";
  }
}

/** Подпись к строке статуса в профиле (без оплаты/тарифа в «тихих» состояниях). */
export function cabinetProfileStatusTitle(state: CabinetSubscriptionUiState): string {
  return "Статус";
}

export function cabinetProfileStatusValue(state: CabinetSubscriptionUiState): string {
  switch (state) {
    case "no_trial_started":
      return "Старт после первого сохранённого расчёта";
    case "trial_active_more_than_3_days":
    case "trial_active_3_days_or_less":
      return "Инструменты открыты";
    case "trial_expired":
    case "paid_expired":
      return "Доступ к инструментам ограничен";
    case "paid_active_more_than_3_days":
    case "paid_active_3_days_or_less":
      return "Инструменты открыты";
    default:
      return "—";
  }
}

/** Дата окончания пробного режима в кабинете — только в последние 3 дня. */
export function cabinetShowsTrialEndDateRow(
  user: UserTrialFields | null | undefined
): boolean {
  return getCabinetSubscriptionUiState(user) === "trial_active_3_days_or_less";
}

/** Строка «доступ до …» в кабинете — только в последние 3 дня оплаченного периода. */
export function cabinetShowsPaidAccessUntilRow(
  user: UserTrialFields | null | undefined
): boolean {
  return getCabinetSubscriptionUiState(user) === "paid_active_3_days_or_less";
}

/** На странице /billing показывать блок с ценой и кнопкой оплаты. */
export function cabinetBillingShowsCommerce(user: UserTrialFields | null | undefined): boolean {
  return cabinetShowsBillingNavigation(user);
}
