import { TELEGRAM_CHANNEL_URL } from "@/lib/aboutServiceContent";
import { getTelegramWebApp } from "@/lib/telegramMiniApp";

/** Публичный канал HVAC-SaaS для монтажников. */
export const HVAC_SAAS_TELEGRAM_CHANNEL_URL = TELEGRAM_CHANNEL_URL;

/**
 * Открывает канал https://t.me/hvac_saas внутри Mini App или в браузере.
 */
export function openTelegramChannel(url: string = HVAC_SAAS_TELEGRAM_CHANNEL_URL): void {
  if (typeof window === "undefined") return;
  const trimmed = url.trim();
  if (!trimmed) return;

  const wa = getTelegramWebApp();
  try {
    if (wa?.openTelegramLink) {
      wa.openTelegramLink(trimmed);
      return;
    }
  } catch {
    /* */
  }

  window.location.href = trimmed;
}
