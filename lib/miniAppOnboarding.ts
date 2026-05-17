import { getMiniAppSessionToken } from "@/lib/telegramMiniAppSession";

/** Предпочтительный ключ (ТЗ). */
export const MINI_APP_ONBOARDING_LS_KEY = "miniAppOnboardingCompleted";

/** Legacy-ключ из раннего onboarding в калькуляторе. */
const LEGACY_ONBOARDING_LS_KEY = "hvac_tg_onboarding_seen";

export function isMiniAppOnboardingCompletedLocally(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (localStorage.getItem(MINI_APP_ONBOARDING_LS_KEY) === "true") return true;
    if (localStorage.getItem(LEGACY_ONBOARDING_LS_KEY) === "1") return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function setMiniAppOnboardingCompletedLocally(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MINI_APP_ONBOARDING_LS_KEY, "true");
    localStorage.setItem(LEGACY_ONBOARDING_LS_KEY, "1");
  } catch {
    /* ignore */
  }
}

export async function fetchMiniAppOnboardingCompletedRemote(): Promise<boolean | null> {
  const token = getMiniAppSessionToken();
  if (!token) return null;
  try {
    const res = await fetch("/api/telegram/miniapp-onboarding", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { completed?: boolean };
    return data.completed === true;
  } catch {
    return null;
  }
}

export async function persistMiniAppOnboardingCompletedRemote(): Promise<void> {
  const token = getMiniAppSessionToken();
  if (!token) return;
  try {
    await fetch("/api/telegram/miniapp-onboarding", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    /* Firestore недоступен — не блокируем Mini App */
  }
}

/** Нужно ли показать store onboarding (только Mini App flow). */
export async function shouldShowMiniAppStoreOnboarding(): Promise<boolean> {
  if (isMiniAppOnboardingCompletedLocally()) return false;

  const remote = await fetchMiniAppOnboardingCompletedRemote();
  if (remote === true) {
    setMiniAppOnboardingCompletedLocally();
    return false;
  }

  return true;
}

export async function completeMiniAppStoreOnboarding(): Promise<void> {
  setMiniAppOnboardingCompletedLocally();
  await persistMiniAppOnboardingCompletedRemote();
}
