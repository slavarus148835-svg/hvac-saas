import type { TelegramMiniAppProfile } from "@/lib/telegramMiniAppAuth";

export type MiniAppAccessGateReason =
  | "ok"
  | "blocked"
  | "no_email"
  | "email_not_verified"
  | "telegram_not_linked"
  | "provision_account"
  | "subscription_expired";

export type MiniAppAccessStatus = {
  allowed: boolean;
  reason: MiniAppAccessGateReason;
  emailVerifiedByCode: boolean;
  subscriptionAllowed: boolean;
};

export function accessStatusFromApi(raw: unknown): MiniAppAccessStatus | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const reason = o.accessGate ?? o.reason;
  const identityOk = o.accessAllowed === true || reason === "ok";
  const subscriptionAllowed =
    o.subscriptionAllowed !== false && reason !== "subscription_expired";
  if (typeof reason !== "string") return null;
  return {
    allowed: identityOk && subscriptionAllowed,
    reason: reason as MiniAppAccessStatus["reason"],
    emailVerifiedByCode: o.emailVerifiedByCode === true,
    subscriptionAllowed,
  };
}

/** Клиентский gate для защищённых страниц Mini App. */
export type TgProtectedPhase =
  | "loading"
  | "no_init"
  | "error"
  | "need_link"
  | "need_verify"
  | "blocked"
  | "subscription_expired"
  | "ready";

export function resolveTgProtectedPhase(params: {
  hasInitData: boolean;
  profile: TelegramMiniAppProfile | null;
  access: MiniAppAccessStatus | null;
  pendingRegistration: boolean;
  errorMessage?: string | null;
  requireSubscription?: boolean;
}): TgProtectedPhase {
  if (params.errorMessage) return "error";
  if (!params.hasInitData && !params.profile && !params.pendingRegistration) {
    return "no_init";
  }
  if (params.pendingRegistration || !params.profile) {
    return "need_link";
  }
  if (params.access?.reason === "blocked") return "blocked";
  if (
    params.access?.reason === "telegram_not_linked" ||
    params.access?.reason === "no_email" ||
    params.access?.reason === "provision_account"
  ) {
    return "need_link";
  }
  if (params.access?.reason === "email_not_verified") {
    return "need_verify";
  }
  if (
    params.requireSubscription !== false &&
    (params.access?.reason === "subscription_expired" ||
      params.access?.subscriptionAllowed === false)
  ) {
    return "subscription_expired";
  }
  if (params.access?.reason === "subscription_expired") {
    return "ready";
  }
  return "ready";
}
