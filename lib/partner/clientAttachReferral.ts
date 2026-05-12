import { PARTNER_REFERRAL_STORAGE_KEY } from "@/lib/partner/constants";

const SESSION_ATTACHED_PREFIX = "hvac_partner_ref_attached:";

function sessionAttachedKey(uid: string): string {
  return `${SESSION_ATTACHED_PREFIX}${uid}`;
}

/**
 * Однократно (на сессию) отправляет сохранённый ?ref= на сервер после входа/регистрации.
 */
export async function tryAttachReferralFromStorage(
  uid: string,
  getIdToken: () => Promise<string>
): Promise<void> {
  if (typeof window === "undefined" || !uid) return;
  try {
    if (sessionStorage.getItem(sessionAttachedKey(uid)) === "1") return;
  } catch {
    /* ignore */
  }

  let code = "";
  try {
    code = String(localStorage.getItem(PARTNER_REFERRAL_STORAGE_KEY) || "").trim();
  } catch {
    return;
  }
  if (!code) return;

  try {
    const token = await getIdToken();
    const res = await fetch("/api/partner/attach-referral", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ code }),
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
