export const HVAC_TG_PENDING_REGISTRATION_SESSION_KEY = "hvac_tg_pending_registration_session_id";

export function savePendingRegistrationSessionId(sessionId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HVAC_TG_PENDING_REGISTRATION_SESSION_KEY, sessionId.trim());
  } catch {
    /* */
  }
}

export function getPendingRegistrationSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(HVAC_TG_PENDING_REGISTRATION_SESSION_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function clearPendingRegistrationSessionId(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(HVAC_TG_PENDING_REGISTRATION_SESSION_KEY);
  } catch {
    /* */
  }
}
