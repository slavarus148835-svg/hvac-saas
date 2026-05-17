export const TG_CHANNEL_PROMO_DISMISSED_KEY = "hvac_tg_channel_promo_dismissed";

export function isTgChannelPromoDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(TG_CHANNEL_PROMO_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissTgChannelPromo(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TG_CHANNEL_PROMO_DISMISSED_KEY, "1");
  } catch {
    /* */
  }
}
