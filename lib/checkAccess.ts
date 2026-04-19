import type { Feature } from "@/lib/access";
import { cabinetShowsBillingNavigation } from "@/lib/subscriptionVisibility";
import {
  hasSubscriptionFeatureAccess,
  isPaidActive,
  isTrialExpired,
  isTrialPending,
  isTrialRunning,
  logTrialAccessDebug,
  type UserTrialFields,
} from "@/lib/trialSubscription";

export type UserPlan =
  | "trial_pending"
  | "trial_active"
  | "trial"
  | "standard"
  | "pro"
  | "none"
  | "expired";

export type FeatureKey =
  | "dashboard"
  | "profile"
  | "billing"
  | "calculator"
  | "pricing"
  | "history";

function asTrial(userData: unknown): UserTrialFields | null {
  if (!userData || typeof userData !== "object") return null;
  return userData as UserTrialFields;
}

export function getUserPlan(userData: unknown): UserPlan {
  const u = asTrial(userData);
  if (!u) return "none";
  if (u.blocked) return "none";
  if (isPaidActive(u)) return "standard";
  if (isTrialExpired(u)) return "expired";
  if (isTrialRunning(u)) return "trial_active";
  if (isTrialPending(u)) {
    const p = (u as { plan?: string }).plan;
    if (p === "trial") return "trial_pending";
  }
  const p = (u as { plan?: string }).plan;
  if (p === "trial") return "trial";
  if (p === "standard") return "standard";
  if (p === "pro") return "pro";
  return "none";
}

export function getPlanLabel(plan: UserPlan) {
  if (plan === "trial_pending") return "Старт с первого сохранённого расчёта";
  if (plan === "trial_active") return "Инструменты открыты";
  if (plan === "trial") return "В работе";
  if (plan === "standard") return "Полный доступ";
  if (plan === "pro") return "Pro";
  if (plan === "expired") return "Срок доступа истёк";
  return "Не задано";
}

export function checkUserAccess(userData: unknown) {
  const u = asTrial(userData);
  if (!u) return false;
  if (u.blocked) return false;
  logTrialAccessDebug(u, "checkUserAccess");
  if (isPaidActive(u)) return true;
  if (isTrialExpired(u)) return false;
  if (isTrialPending(u)) return true;
  if (isTrialRunning(u)) return true;
  return false;
}

export function hasFeatureAccess(userData: unknown, feature: FeatureKey) {
  const u = asTrial(userData);
  if (!u || u.blocked) return false;
  if (feature === "dashboard") return true;
  if (feature === "billing") {
    return cabinetShowsBillingNavigation(u);
  }
  if (feature === "calculator" || feature === "history" || feature === "pricing" || feature === "profile") {
    return hasSubscriptionFeatureAccess(u, feature as Feature);
  }
  return false;
}

export function getRequiredPlanForFeature(_feature: FeatureKey) {
  return "standard";
}

export function getFeatureTitle(feature: FeatureKey) {
  if (feature === "dashboard") return "Личный кабинет";
  if (feature === "profile") return "Профиль";
  if (feature === "billing") return "Срок в сервисе";
  if (feature === "calculator") return "Калькулятор";
  if (feature === "pricing") return "Личный прайс";
  if (feature === "history") return "История расчётов";
  return "Раздел";
}
