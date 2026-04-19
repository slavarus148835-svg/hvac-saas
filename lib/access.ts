import {
  hasSubscriptionFeatureAccess,
  isPaidActive,
  isTrialExpired,
  isTrialPending,
  isTrialRunning,
  type UserTrialFields,
} from "@/lib/trialSubscription";

export type Plan = "FREE" | "STANDARD" | "PRO" | "TRIAL_PENDING" | "TRIAL_ACTIVE" | "EXPIRED";

export type Feature =
  | "pricing"
  | "calculator"
  | "history"
  | "profile";

type LegacyPlan = "none" | "trial" | "standard" | "pro";

function normalizeLegacyPlan(value: unknown): LegacyPlan {
  if (value === "trial") return "trial";
  if (value === "standard") return "standard";
  if (value === "pro") return "pro";
  return "none";
}

export function getUserPlan(userData: unknown): Plan {
  const u = userData as UserTrialFields | null | undefined;
  if (!u) return "FREE";
  if (u.blocked) return "FREE";
  if (isPaidActive(u)) return "STANDARD";
  const legacy = normalizeLegacyPlan(u.plan);
  if (legacy === "pro") return "PRO";
  if (isTrialExpired(u)) return "EXPIRED";
  if (isTrialRunning(u)) return "TRIAL_ACTIVE";
  if (isTrialPending(u) && legacy === "trial") return "TRIAL_PENDING";
  if (legacy === "standard") return "STANDARD";
  if (legacy === "trial") return "TRIAL_PENDING";
  return "FREE";
}

export function hasAccess(userData: unknown, feature: Feature): boolean {
  return hasSubscriptionFeatureAccess(userData as UserTrialFields, feature);
}
