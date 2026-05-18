export type MiniAppLaunchDeliveryChannel = "telegram" | "email";

export const MAX_MINIAPP_LAUNCH_RETRY_COUNT = 2;

export type MiniAppLaunchErrorCode =
  | "bot_blocked"
  | "chat_not_found"
  | "forbidden"
  | "rate_limited"
  | "smtp_timeout"
  | "socket_close"
  | "invalid_email"
  | "smtp_rejected"
  | "telegram_send_failed"
  | "email_send_failed"
  | "missing_telegram_chat_id"
  | "missing_email"
  | "email_sender_not_configured"
  | "unknown";

const TELEGRAM_PERMANENT = new Set<MiniAppLaunchErrorCode>([
  "bot_blocked",
  "forbidden",
  "chat_not_found",
]);

const EMAIL_PERMANENT = new Set<MiniAppLaunchErrorCode>([
  "invalid_email",
  "smtp_rejected",
]);

const RETRYABLE = new Set<MiniAppLaunchErrorCode>([
  "smtp_timeout",
  "socket_close",
  "rate_limited",
  "telegram_send_failed",
  "email_send_failed",
]);

export function normalizeRetryCount(value: unknown): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function classifyTelegramError(raw: string): MiniAppLaunchErrorCode {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("bot was blocked") || s.includes("blocked by the user")) return "bot_blocked";
  if (s.includes("chat not found") || s.includes("chat_id is empty")) return "chat_not_found";
  if (s.includes("forbidden")) return "forbidden";
  if (s.includes("too many requests") || s.includes("retry after") || s.includes("rate limit")) {
    return "rate_limited";
  }
  if (s.includes("timeout") || s.includes("timed out")) return "smtp_timeout";
  return "telegram_send_failed";
}

export function classifyEmailError(raw: string): MiniAppLaunchErrorCode {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("socket close") || s.includes("socket_close")) return "socket_close";
  if (s.includes("timeout") || s.includes("timed out") || s === "etimedout") return "smtp_timeout";
  if (
    s.includes("invalid") &&
    (s.includes("email") || s.includes("recipient") || s.includes("address"))
  ) {
    return "invalid_email";
  }
  if (
    s.includes("rejected") ||
    s.includes("550") ||
    s.includes("554") ||
    s.includes("mailbox")
  ) {
    return "smtp_rejected";
  }
  if (s === "send_failed" || s.includes("send_failed")) return "socket_close";
  return "email_send_failed";
}

export function classifyDeliveryError(
  raw: string,
  channel: MiniAppLaunchDeliveryChannel
): MiniAppLaunchErrorCode {
  if (channel === "telegram") return classifyTelegramError(raw);
  return classifyEmailError(raw);
}

export function isPermanentErrorCode(
  code: MiniAppLaunchErrorCode,
  channel: MiniAppLaunchDeliveryChannel
): boolean {
  if (channel === "telegram") return TELEGRAM_PERMANENT.has(code);
  return EMAIL_PERMANENT.has(code);
}

export function isRetryableErrorCode(code: MiniAppLaunchErrorCode): boolean {
  return RETRYABLE.has(code);
}

export type DeliveryQueueDecision = "exclude" | "retryable";

export function evaluateDeliveryForQueue(params: {
  status: string;
  retryCount: number;
  lastErrorCode: string | null;
  error: string | null;
  channel: MiniAppLaunchDeliveryChannel | null;
}): DeliveryQueueDecision {
  const status = String(params.status ?? "");
  if (status === "sent" || status === "skipped" || status === "pending") return "exclude";

  if (status !== "failed") return "exclude";

  const retryCount = normalizeRetryCount(params.retryCount);
  if (retryCount > MAX_MINIAPP_LAUNCH_RETRY_COUNT) return "exclude";

  const channel = params.channel ?? "telegram";
  const code =
    (params.lastErrorCode as MiniAppLaunchErrorCode | null) ||
    classifyDeliveryError(String(params.error ?? ""), channel);

  if (isPermanentErrorCode(code, channel)) return "exclude";
  if (isRetryableErrorCode(code) && retryCount <= MAX_MINIAPP_LAUNCH_RETRY_COUNT) {
    return "retryable";
  }

  return "exclude";
}

export const TRANSIENT_CLEANUP_ERROR_CODES = new Set<MiniAppLaunchErrorCode>([
  "socket_close",
  "smtp_timeout",
  "email_send_failed",
  "telegram_send_failed",
]);
