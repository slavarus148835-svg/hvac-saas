import type { TelegramMiniAppProfile } from "@/lib/telegramMiniAppAuth";

export type MiniAppAccessGateReason =
  | "ok"
  | "blocked"
  | "no_email"
  | "email_not_verified"
  | "telegram_not_linked"
  | "provision_account";

export type MiniAppAccessStatus = {
  allowed: boolean;
  reason: MiniAppAccessGateReason;
  emailVerifiedByCode: boolean;
};

export function accessStatusFromApi(raw: unknown): MiniAppAccessStatus | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const reason = o.accessGate ?? o.reason;
  const allowed = o.accessAllowed === true || reason === "ok";
  if (typeof reason !== "string") return null;
  return {
    allowed,
    reason: reason as MiniAppAccessGateReason,
    emailVerifiedByCode: o.emailVerifiedByCode === true,
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
  | "ready";

export function resolveTgProtectedPhase(params: {
  hasInitData: boolean;
  profile: TelegramMiniAppProfile | null;
  access: MiniAppAccessStatus | null;
  pendingRegistration: boolean;
  errorMessage?: string | null;
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
  if (params.access?.reason === "email_not_verified" || !params.access?.allowed) {
    return "need_verify";
  }
  return "ready";
}
