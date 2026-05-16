/** Нейтральный B2B partner code: 6–8 символов, a-z и 0–9. */

export const PARTNER_CODE_MIN_LEN = 6;
export const PARTNER_CODE_MAX_LEN = 8;

const FORBIDDEN_SUBSTRINGS = ["partner"] as const;

export function normalizePartnerManagerCode(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function isValidPartnerManagerCode(raw: string): boolean {
  const code = normalizePartnerManagerCode(raw);
  if (code.length < PARTNER_CODE_MIN_LEN || code.length > PARTNER_CODE_MAX_LEN) {
    return false;
  }
  return !FORBIDDEN_SUBSTRINGS.some((w) => code.includes(w));
}

/**
 * Извлекает partner code из Telegram Mini App start_param (без префикса partner_).
 * Не пересекается с login_, link_, mpend_.
 */
export function extractPartnerCodeFromMiniAppStartParam(startParam: string): string | null {
  const sp = String(startParam ?? "").trim();
  if (!sp) return null;

  const lower = sp.toLowerCase();
  if (
    lower.startsWith("login_") ||
    lower.startsWith("link_") ||
    lower.startsWith("mpend_")
  ) {
    return null;
  }

  const code = normalizePartnerManagerCode(sp);
  return isValidPartnerManagerCode(code) ? code : null;
}
