import {
  readPartnerReferralCodeFromSession,
  readPartnerReferralFirstTouchMsFromSession,
} from "@/lib/partner/clientPartnerReferralStorage";
import { getMiniAppSessionToken } from "@/lib/telegramMiniAppSession";

const SESSION_ATTACHED_PREFIX = "hvac_b2b_partner_attached:";

function sessionAttachedKey(uid: string): string {
  return `${SESSION_ATTACHED_PREFIX}${uid}`;
}

/**
 * Отправляет partner code на сервер только если в текущей сессии есть referral intent
 * (start_param Mini App или ?partner= на web в этой вкладке).
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

  const code = readPartnerReferralCodeFromSession();
  if (!code) return;

  const firstTouchMs = readPartnerReferralFirstTouchMsFromSession();

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
      body: JSON.stringify({ code, source, firstTouchMs, referralIntent: true }),
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
