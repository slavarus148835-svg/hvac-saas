import { getTelegramWebApp } from "@/lib/telegramMiniApp";

/** Открывает t.me / внешнюю ссылку внутри Telegram Mini App или в браузере. */
export function openTelegramExternalLink(url: string) {
  if (typeof window === "undefined") return;
  const trimmed = url.trim();
  if (!trimmed) return;

  const wa = getTelegramWebApp();
  const isTelegramHost =
    /^https?:\/\/(t\.me|telegram\.me)\//i.test(trimmed) || trimmed.startsWith("tg://");

  try {
    if (isTelegramHost && wa?.openTelegramLink) {
      wa.openTelegramLink(trimmed);
      return;
    }
  } catch {
    /* */
  }

  try {
    if (wa?.openLink) {
      wa.openLink(trimmed);
      return;
    }
  } catch {
    /* */
  }

  window.open(trimmed, "_blank", "noopener,noreferrer");
}
