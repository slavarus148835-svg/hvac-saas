import { getTelegramWebApp } from "@/lib/telegramMiniApp";

type HapticStyle = "light" | "medium" | "heavy" | "rigid" | "soft";

export function tgHapticImpact(style: HapticStyle = "light") {
  try {
    const h = getTelegramWebApp()?.HapticFeedback;
    h?.impactOccurred?.(style);
  } catch {
    /* */
  }
}

export function tgHapticNotification(type: "error" | "success" | "warning") {
  try {
    const h = getTelegramWebApp()?.HapticFeedback;
    h?.notificationOccurred?.(type);
  } catch {
    /* */
  }
}

export function tgHapticButtonTap() {
  tgHapticImpact("light");
}
