import {
  PARTNER_MANAGER_FIRST_TOUCH_MS_KEY,
  PARTNER_MANAGER_STORAGE_KEY,
} from "@/lib/partner/b2bConstants";
import { getMiniAppSessionToken } from "@/lib/telegramMiniAppSession";

const SESSION_ATTACHED_PREFIX = "hvac_b2b_partner_attached:";

function sessionAttachedKey(uid: string): string {
  return `${SESSION_ATTACHED_PREFIX}${uid}`;
}

/**
 * Однократно отправляет сохранённый B2B partner code на сервер (не трогает ?ref= / рефералку).
 */
export async function tryAttachPartnerManagerFromStorage(
  uid: string,
  getIdToken: () => Promise<string>,
  source: "web" | "telegram_miniapp" = "web"
): Promise<void> {
  if (typeof window === "undefined" || !uid) return;
  try {
    if (sessionStorage.getItem(sessionAttachedKey(uid)) === "1") return;
  } catch {
    /* ignore */
  }

  let code = "";
  try {
    code = String(localStorage.getItem(PARTNER_MANAGER_STORAGE_KEY) || "").trim();
  } catch {
    return;
  }
  if (!code) return;

  let firstTouchMs: number | undefined;
  try {
    const raw = localStorage.getItem(PARTNER_MANAGER_FIRST_TOUCH_MS_KEY);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > 0) firstTouchMs = Math.floor(n);
  } catch {
    /* */
  }

  let token: string | null = null;
  try {
    const m = getMiniAppSessionToken();
    if (m?.trim()) token = m.trim();
  } catch {
    /* */
  }
  if (!token) {
    try {
      token = await getIdToken();
    } catch {
      return;
    }
  }
  if (!token) return;

  try {
    const res = await fetch("/api/partner-manager/attach", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ code, source, firstTouchMs }),
      cache: "no-store",
    });
    if (res.ok) {
      try {
        sessionStorage.setItem(sessionAttachedKey(uid), "1");
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}
