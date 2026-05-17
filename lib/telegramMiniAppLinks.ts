import {
  isValidPartnerManagerCode,
  normalizePartnerManagerCode,
} from "@/lib/partner/partnerManagerCode";

/** Публичный username бота (без @). */
export const TELEGRAM_BOT_USERNAME = "Hvac_cash_bot";

/** Direct link Mini App из BotFather / Main App. */
export const TELEGRAM_MINI_APP_PUBLIC_URL = `https://t.me/${TELEGRAM_BOT_USERNAME}/app`;

export const DEFAULT_WEB_APP_PUBLIC_URL = "https://hvac-saas-lovat.vercel.app";

/** Query-параметр B2B-менеджера на сайте (см. PartnerManagerParamCapture). */
export const WEB_PARTNER_QUERY_PARAM = "partner";

/** Публичный origin веб-приложения (без trailing slash). */
export function getWebAppPublicOrigin(): string {
  const fromEnv = String(
    process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_VERCEL_URL ||
      ""
  ).trim();
  if (fromEnv) {
    try {
      const withProto = /^https?:\/\//i.test(fromEnv) ? fromEnv : `https://${fromEnv}`;
      return new URL(withProto).origin;
    } catch {
      return DEFAULT_WEB_APP_PUBLIC_URL;
    }
  }
  return DEFAULT_WEB_APP_PUBLIC_URL;
}

/** Алиас для документации и импортов: `NEXT_PUBLIC_APP_URL` или production default. */
export function getWebAppPublicUrl(): string {
  return getWebAppPublicOrigin();
}

export function resolveTelegramBotUsernameForLinks(): string {
  return String(
    process.env.TELEGRAM_BOT_USERNAME ||
      process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ||
      TELEGRAM_BOT_USERNAME
  )
    .trim()
    .replace(/^@+/, "");
}

/**
 * Безопасный startapp payload: латиница, цифры, _ и -.
 * Без пробелов, кириллицы, email и прочих PII.
 */
export function sanitizeStartappPayload(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 64);
}

/** Публичная ссылка на Mini App без startapp. */
export function getTelegramMiniAppUrl(): string {
  return TELEGRAM_MINI_APP_PUBLIC_URL;
}

/** Mini App с startapp (partner code, link_*, login_* и т.д.). */
export function buildTelegramMiniAppUrlWithStartapp(payload: string): string | null {
  const bot = resolveTelegramBotUsernameForLinks();
  if (!bot) return null;
  const safe = sanitizeStartappPayload(payload);
  if (!safe) return getTelegramMiniAppUrl();
  return `https://t.me/${bot}/app?startapp=${encodeURIComponent(safe)}`;
}

/** B2B: Mini App с partner code в startapp. */
export function getTelegramMiniAppManagerUrl(managerCode: string): string | null {
  const code = normalizePartnerManagerCode(managerCode);
  if (!isValidPartnerManagerCode(code)) return null;
  return buildTelegramMiniAppUrlWithStartapp(code);
}

/** B2B: веб-регистрация с закреплением менеджера (`?partner=`). */
export function getWebManagerUrl(managerCode: string, origin?: string): string {
  const base = (origin ?? getWebAppPublicOrigin()).replace(/\/+$/, "");
  const code = normalizePartnerManagerCode(managerCode);
  return `${base}/register?${WEB_PARTNER_QUERY_PARAM}=${encodeURIComponent(code)}`;
}
