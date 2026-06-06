import { checkUserAccess } from "@/lib/checkAccess";
import type { UserTrialFields } from "@/lib/trialSubscription";

export type MiniAppSubscriptionGateReason = "ok" | "subscription_expired" | "no_access";

export type MiniAppSubscriptionGateResult = {
  allowed: boolean;
  reason: MiniAppSubscriptionGateReason;
};

/** Единая проверка trial/paid — та же логика, что Web (`checkUserAccess`). */
export function evaluateMiniAppSubscriptionAccess(
  data: Record<string, unknown> | null | undefined
): MiniAppSubscriptionGateResult {
  if (!data) {
    return { allowed: false, reason: "no_access" };
  }
  const u = data as UserTrialFields;
  if (!checkUserAccess(u)) {
    return { allowed: false, reason: "subscription_expired" };
  }
  return { allowed: true, reason: "ok" };
}
