import {
  getTelegramMiniAppManagerUrl,
  getWebManagerUrl,
} from "@/lib/telegramMiniAppLinks";

export { resolveTelegramBotUsernameForLinks } from "@/lib/telegramMiniAppLinks";

export function buildPartnerManagerWebUrl(
  code: string,
  origin?: string
): string {
  return getWebManagerUrl(code, origin);
}

export function buildPartnerManagerMiniAppUrl(
  code: string,
  _botUsername?: string
): string | null {
  void _botUsername;
  return getTelegramMiniAppManagerUrl(code);
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
