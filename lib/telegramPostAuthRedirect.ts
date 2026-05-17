import { isTelegramMiniApp } from "@/lib/telegramMiniApp";
import { getSafePostLoginPath } from "@/lib/safeRedirect";

/** Куда вернуть пользователя после регистрации / verify из Telegram-сценария. */
export const DEFAULT_TELEGRAM_POST_AUTH_RETURN = "/tg/calculator";

export const TG_POST_AUTH_RETURN_STORAGE_KEY = "hvac_tg_post_auth_return_to";
export const TG_POST_AUTH_FLOW_FLAG_KEY = "hvac_tg_post_auth_flow";

export const TG_REGISTER_PATH = "/tg/register";

const AUTH_ONLY_PATHS = new Set([
  "/login",
  "/register",
  TG_REGISTER_PATH,
  "/verify-email-code",
]);

/** Безопасный путь возврата только внутри Mini App (`/tg`, `/tg/...`). */
export function getSafeTelegramPostAuthReturnPath(
  raw: string | null | undefined
): string {
  if (raw == null || typeof raw !== "string") return DEFAULT_TELEGRAM_POST_AUTH_RETURN;
  let decoded = raw.trim();
  try {
    decoded = decodeURIComponent(decoded).trim();
  } catch {
    return DEFAULT_TELEGRAM_POST_AUTH_RETURN;
  }
  if (!decoded.startsWith("/")) return DEFAULT_TELEGRAM_POST_AUTH_RETURN;
  if (decoded.startsWith("//")) return DEFAULT_TELEGRAM_POST_AUTH_RETURN;
  if (decoded.includes("://")) return DEFAULT_TELEGRAM_POST_AUTH_RETURN;
  const pathOnly = decoded.split("?")[0] ?? "";
  if (pathOnly !== "/tg" && !pathOnly.startsWith("/tg/")) {
    return DEFAULT_TELEGRAM_POST_AUTH_RETURN;
  }
  if (AUTH_ONLY_PATHS.has(pathOnly)) return DEFAULT_TELEGRAM_POST_AUTH_RETURN;
  if (decoded.length > 512) return DEFAULT_TELEGRAM_POST_AUTH_RETURN;
  return decoded || DEFAULT_TELEGRAM_POST_AUTH_RETURN;
}

export function isTelegramMiniAppReturnPath(path: string): boolean {
  const pathOnly = String(path || "").split("?")[0] ?? "";
  return pathOnly === "/tg" || pathOnly.startsWith("/tg/");
}

export function markTelegramPostAuthFlow(returnTo?: string): void {
  if (typeof window === "undefined") return;
  try {
    const fromLocation =
      typeof window.location?.pathname === "string" &&
      isTelegramMiniAppReturnPath(window.location.pathname)
        ? `${window.location.pathname}${window.location.search || ""}`
        : "";
    const path = getSafeTelegramPostAuthReturnPath(
      returnTo || fromLocation || DEFAULT_TELEGRAM_POST_AUTH_RETURN
    );
    sessionStorage.setItem(TG_POST_AUTH_FLOW_FLAG_KEY, "1");
    sessionStorage.setItem(TG_POST_AUTH_RETURN_STORAGE_KEY, path);
  } catch {
    /* ignore */
  }
}

export function clearTelegramPostAuthFlow(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(TG_POST_AUTH_FLOW_FLAG_KEY);
    sessionStorage.removeItem(TG_POST_AUTH_RETURN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function readStoredTelegramReturnPath(): string | null {
  if (typeof window === "undefined") return null;
  try {
    if (sessionStorage.getItem(TG_POST_AUTH_FLOW_FLAG_KEY) !== "1") return null;
    const raw = sessionStorage.getItem(TG_POST_AUTH_RETURN_STORAGE_KEY);
    if (!raw?.trim()) return null;
    return getSafeTelegramPostAuthReturnPath(raw);
  } catch {
    return null;
  }
}

export function buildVerifyEmailCodePathForPostAuth(): string {
  const base = "/verify-email-code?from=register";
  const stored = readStoredTelegramReturnPath();
  if (stored) {
    return `${base}&returnTo=${encodeURIComponent(stored)}`;
  }
  if (typeof window !== "undefined" && isTelegramMiniApp()) {
    return `${base}&returnTo=${encodeURIComponent(DEFAULT_TELEGRAM_POST_AUTH_RETURN)}`;
  }
  return base;
}

/**
 * Куда отправить пользователя после успешной регистрации / подтверждения email.
 */
export function resolvePostAuthRedirectPath(params?: {
  nextParam?: string | null;
  returnToParam?: string | null;
  registrationSource?: string | null;
}): string {
  const returnToParam = params?.returnToParam ?? null;
  if (returnToParam) {
    const safe = getSafeTelegramPostAuthReturnPath(returnToParam);
    clearTelegramPostAuthFlow();
    return safe;
  }

  const stored = readStoredTelegramReturnPath();
  if (stored) {
    clearTelegramPostAuthFlow();
    return stored;
  }

  const nextParam = params?.nextParam ?? null;
  if (nextParam) {
    const nextSafe = getSafePostLoginPath(nextParam);
    if (isTelegramMiniAppReturnPath(nextSafe)) {
      clearTelegramPostAuthFlow();
      return nextSafe;
    }
  }

  if (params?.registrationSource === "telegram_mini_app") {
    clearTelegramPostAuthFlow();
    return DEFAULT_TELEGRAM_POST_AUTH_RETURN;
  }

  if (typeof window !== "undefined" && isTelegramMiniApp()) {
    clearTelegramPostAuthFlow();
    return DEFAULT_TELEGRAM_POST_AUTH_RETURN;
  }

  return getSafePostLoginPath(nextParam);
}
