/** Должно совпадать с `TRIAL_DAYS` в `lib/trialSubscription.ts`. */
export const PARTNER_TRIAL_DAYS = 15;

/** Партнёрский блок показывается за N дней до конца «триала от первого расчёта». */
export const PARTNER_REVEAL_DAYS_BEFORE_TRIAL_END = 3;

export const PARTNER_COMMISSION_PERCENT = 30;

export const PARTNER_REFERRAL_STORAGE_KEY = "hvac_partner_ref_code";

export const PARTNER_COMMISSIONS_COLLECTION = "partnerCommissions";
export const PARTNER_REFERRALS_COLLECTION = "partnerReferrals";

const DEFAULT_PUBLIC_ORIGIN = "https://hvac-saas-lovat.vercel.app";

export function getPartnerSiteOrigin(): string {
  const fromEnv = String(
    process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || ""
  ).trim();
  if (fromEnv) {
    try {
      return new URL(fromEnv).origin;
    } catch {
      return DEFAULT_PUBLIC_ORIGIN;
    }
  }
  return DEFAULT_PUBLIC_ORIGIN;
}
