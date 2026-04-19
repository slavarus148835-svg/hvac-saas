const DEFAULT_AFTER_LOGIN = "/dashboard";

const AUTH_ONLY_PATHS = new Set([
  "/login",
  "/register",
  "/verify-email-code",
]);

/**
 * Разрешён только относительный путь того же сайта (после логина).
 */
export function getSafePostLoginPath(raw: string | null | undefined): string {
  if (raw == null || typeof raw !== "string") return DEFAULT_AFTER_LOGIN;
  let decoded = raw.trim();
  try {
    decoded = decodeURIComponent(decoded).trim();
  } catch {
    return DEFAULT_AFTER_LOGIN;
  }
  if (!decoded.startsWith("/")) return DEFAULT_AFTER_LOGIN;
  if (decoded.startsWith("//")) return DEFAULT_AFTER_LOGIN;
  if (decoded.includes("://")) return DEFAULT_AFTER_LOGIN;
  const pathOnly = decoded.split("?")[0] ?? "";
  if (pathOnly === "/verify-email") {
    return "/verify-email-code";
  }
  if (decoded.toLowerCase().startsWith("/api")) return DEFAULT_AFTER_LOGIN;
  if (decoded.length > 512) return DEFAULT_AFTER_LOGIN;
  if (decoded === "/") return DEFAULT_AFTER_LOGIN;
  if (AUTH_ONLY_PATHS.has(decoded)) return DEFAULT_AFTER_LOGIN;
  return decoded || DEFAULT_AFTER_LOGIN;
}

export function buildLoginRedirectUrl(nextPathname: string): string {
  const safe = getSafePostLoginPath(nextPathname);
  return `/login?next=${encodeURIComponent(safe)}`;
}
