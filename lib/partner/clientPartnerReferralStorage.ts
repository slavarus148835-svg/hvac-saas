import {
  PARTNER_MANAGER_FIRST_TOUCH_MS_KEY,
  PARTNER_MANAGER_SESSION_CODE_KEY,
  PARTNER_MANAGER_SESSION_TOUCH_MS_KEY,
  PARTNER_MANAGER_STORAGE_KEY,
} from "@/lib/partner/b2bConstants";

/** Удаляет сохранённый partner code (localStorage + sessionStorage). */
export function clearPartnerReferralStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(PARTNER_MANAGER_STORAGE_KEY);
    localStorage.removeItem(PARTNER_MANAGER_FIRST_TOUCH_MS_KEY);
    sessionStorage.removeItem(PARTNER_MANAGER_SESSION_CODE_KEY);
    sessionStorage.removeItem(PARTNER_MANAGER_SESSION_TOUCH_MS_KEY);
  } catch {
    /* ignore */
  }
}

/** Partner code только из текущей сессии (referral intent в этом заходе). */
export function readPartnerReferralCodeFromSession(): string {
  if (typeof window === "undefined") return "";
  try {
    return String(sessionStorage.getItem(PARTNER_MANAGER_SESSION_CODE_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function readPartnerReferralFirstTouchMsFromSession(): number | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = sessionStorage.getItem(PARTNER_MANAGER_SESSION_TOUCH_MS_KEY);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  } catch {
    /* */
  }
  return undefined;
}

/** Сохранить partner code только для текущей сессии браузера / Mini App. */
export function savePartnerReferralCodeForSession(code: string): void {
  if (typeof window === "undefined" || !code) return;
  try {
    sessionStorage.setItem(PARTNER_MANAGER_SESSION_CODE_KEY, code);
    sessionStorage.setItem(PARTNER_MANAGER_SESSION_TOUCH_MS_KEY, String(Date.now()));
    localStorage.removeItem(PARTNER_MANAGER_STORAGE_KEY);
    localStorage.removeItem(PARTNER_MANAGER_FIRST_TOUCH_MS_KEY);
  } catch {
    /* ignore */
  }
}
