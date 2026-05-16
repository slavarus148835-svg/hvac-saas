import { getPartnerSiteOrigin } from "@/lib/partner/constants";
import { normalizePartnerManagerCode } from "@/lib/partner/partnerManagerCode";

export function resolveTelegramBotUsernameForLinks(): string {
  return String(
    process.env.TELEGRAM_BOT_USERNAME ||
      process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ||
      ""
  )
    .trim()
    .replace(/^@+/, "");
}

export function buildPartnerManagerWebUrl(
  code: string,
  origin?: string
): string {
  const base = (origin ?? getPartnerSiteOrigin()).replace(/\/+$/, "");
  const c = normalizePartnerManagerCode(code);
  return `${base}/?partner=${encodeURIComponent(c)}`;
}

export function buildPartnerManagerMiniAppUrl(
  code: string,
  botUsername?: string
): string | null {
  const bot = (botUsername ?? resolveTelegramBotUsernameForLinks()).trim();
  if (!bot) return null;
  const c = normalizePartnerManagerCode(code);
  return `https://t.me/${bot}/app?startapp=${encodeURIComponent(c)}`;
}

export function buildPartnerManagerLinksBlock(code: string): {
  webUrl: string;
  miniUrl: string | null;
  text: string;
} {
  const webUrl = buildPartnerManagerWebUrl(code);
  const miniUrl = buildPartnerManagerMiniAppUrl(code);
  const lines = ["🔗 Ваши ссылки", "", `Веб:`, webUrl];
  if (miniUrl) {
    lines.push("", "Mini App:", miniUrl);
  } else {
    lines.push("", "Mini App: задайте TELEGRAM_BOT_USERNAME на сервере.");
  }
  return { webUrl, miniUrl, text: lines.join("\n") };
}
