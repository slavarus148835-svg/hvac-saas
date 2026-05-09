import {
  firestoreTimeToMs,
  getTrialEndMs,
  hasSubscriptionFeatureAccess,
  isPaidActive,
  isTrialExpired,
  type UserTrialFields,
} from "@/lib/trialSubscription";
import { checkUserAccess } from "@/lib/checkAccess";

export type PaymentAccessExplanation = {
  accessOpen: boolean;
  /** Почему закрыт доступ к продукту (как checkUserAccess). */
  closedReason: string | null;
  /** Детали по оплате (фактические поля влияют на isPaidActive). */
  paidActive: boolean;
  paidUntilMs: number;
  paidUntilInFuture: boolean;
  plan: string | undefined;
  blocked: boolean;
  hasPaidFlag: boolean;
  paidAtMs: number;
  trialExpired: boolean;
  trialEndEffectiveMs: number;
  hints: string[];
};

type UserDoc = UserTrialFields & { hasPaid?: boolean; paidAt?: unknown };

function flagHints(user: UserDoc): string[] {
  const hints: string[] = [];
  const hasPaid = user.hasPaid === true;
  const paidUntilMs = firestoreTimeToMs(user.paidUntil);
  const paidOk = isPaidActive(user);

  if (hasPaid && !paidOk) {
    hints.push(
      "hasPaid=true, но isPaidActive=false: проверьте paidUntil в будущем и plan standard|pro"
    );
  }
  if (!hasPaid && paidOk) {
    hints.push("Оплата активна по paidUntil/plan, но hasPaid не true — лучше выровнять для аналитики");
  }
  if (paidUntilMs > 0 && paidUntilMs <= Date.now() && (user.plan === "standard" || user.plan === "pro")) {
    hints.push("Оплаченный период по paidUntil истёк");
  }
  return hints;
}

export function explainPaymentAccess(user: UserTrialFields | null | undefined): PaymentAccessExplanation {
  if (!user) {
    return {
      accessOpen: false,
      closedReason: "нет документа users",
      paidActive: false,
      paidUntilMs: 0,
      paidUntilInFuture: false,
      plan: undefined,
      blocked: false,
      hasPaidFlag: false,
      paidAtMs: 0,
      trialExpired: false,
      trialEndEffectiveMs: 0,
      hints: [],
    };
  }

  const docUser = user as UserDoc;
  const blocked = Boolean(docUser.blocked);
  const paidActive = isPaidActive(docUser);
  const paidUntilMs = firestoreTimeToMs(docUser.paidUntil);
  const accessOpen = checkUserAccess(docUser);

  let closedReason: string | null = null;
  if (!accessOpen) {
    if (blocked) closedReason = "blocked=true";
    else if (paidActive) closedReason = "unexpected: paid active но checkUserAccess false";
    else if (isTrialExpired(docUser)) closedReason = "trial истёк и нет активной оплаты";
    else if (!hasSubscriptionFeatureAccess(docUser, "calculator"))
      closedReason =
        "нет доступа по правилам trial (нет безопасного timeline / не trial / не running)";
    else closedReason = "не выполнены условия доступа";
  }

  return {
    accessOpen,
    closedReason,
    paidActive,
    paidUntilMs,
    paidUntilInFuture: paidUntilMs > Date.now(),
    plan: docUser.plan,
    blocked,
    hasPaidFlag: docUser.hasPaid === true,
    paidAtMs: firestoreTimeToMs(docUser.paidAt),
    trialExpired: isTrialExpired(docUser),
    trialEndEffectiveMs: getTrialEndMs(docUser),
    hints: flagHints(docUser),
  };
}
