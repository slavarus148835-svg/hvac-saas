export const HVAC_SESSION_ID_KEY = "hvac_session_id";
export const HVAC_DEVICE_ID_KEY = "hvac_device_id";

export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(HVAC_DEVICE_ID_KEY);
    if (existing && existing.length > 8) return existing;
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2, 16)}`;
    localStorage.setItem(HVAC_DEVICE_ID_KEY, id);
    return id;
  } catch {
    return `dev_${Date.now()}`;
  }
}

export function generateSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
}

export function setLocalSessionId(id: string): void {
  try {
    localStorage.setItem(HVAC_SESSION_ID_KEY, id);
  } catch {
    /* ignore */
  }
}

export function getLocalSessionId(): string | null {
  try {
    return localStorage.getItem(HVAC_SESSION_ID_KEY);
  } catch {
    return null;
  }
}
