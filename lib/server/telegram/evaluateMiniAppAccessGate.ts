import { isEmailVerificationSatisfied } from "@/lib/emailVerificationSatisfied";
import { isStatsExcludedTelegramProvisionUid } from "@/lib/server/statsExcludeTelegramProvisionUid";

export type MiniAppAccessGateReason =
  | "ok"
  | "blocked"
  | "no_email"
  | "email_not_verified"
  | "telegram_not_linked"
  | "provision_account";

export type MiniAppAccessGateResult = {
  allowed: boolean;
  reason: MiniAppAccessGateReason;
  emailVerifiedByCode: boolean;
  hasEmail: boolean;
  hasTelegramLinked: boolean;
};

export function evaluateMiniAppAccessGate(
  uid: string,
  data: Record<string, unknown> | null | undefined
): MiniAppAccessGateResult {
  const empty: MiniAppAccessGateResult = {
    allowed: false,
    reason: "no_email",
    emailVerifiedByCode: false,
    hasEmail: false,
    hasTelegramLinked: false,
  };

  if (!data) return empty;

  if (data.blocked === true) {
    return {
      allowed: false,
      reason: "blocked",
      emailVerifiedByCode: data.emailVerifiedByCode === true,
      hasEmail: Boolean(String(data.email ?? "").trim()),
      hasTelegramLinked: hasTelegramKeys(data),
    };
  }

  if (isStatsExcludedTelegramProvisionUid(uid)) {
    return {
      allowed: false,
      reason: "provision_account",
      emailVerifiedByCode: false,
      hasEmail: false,
      hasTelegramLinked: hasTelegramKeys(data),
    };
  }

  const email = typeof data.email === "string" ? data.email.trim() : "";
  const hasEmail = Boolean(email && email.includes("@"));
  const hasTelegramLinked = hasTelegramKeys(data);
  const emailVerifiedByCode = isEmailVerificationSatisfied(data);

  if (!hasTelegramLinked) {
    return {
      allowed: false,
      reason: "telegram_not_linked",
      emailVerifiedByCode,
      hasEmail,
      hasTelegramLinked: false,
    };
  }

  if (!hasEmail) {
    return {
      allowed: false,
      reason: "no_email",
      emailVerifiedByCode,
      hasEmail: false,
      hasTelegramLinked: true,
    };
  }

  if (!isEmailVerificationSatisfied(data)) {
    return {
      allowed: false,
      reason: "email_not_verified",
      emailVerifiedByCode: false,
      hasEmail: true,
      hasTelegramLinked: true,
    };
  }

  return {
    allowed: true,
    reason: "ok",
    emailVerifiedByCode: true,
    hasEmail: true,
    hasTelegramLinked: true,
  };
}

function hasTelegramKeys(data: Record<string, unknown>): boolean {
  const tgId = String(data.telegramUserId ?? data.telegramId ?? "").replace(/\D/g, "");
  return tgId.length > 0;
}
