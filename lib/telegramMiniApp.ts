/** Типы Telegram WebApp (минимально нужные для Mini App). */
export type TelegramWebAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type TelegramHapticFeedback = {
  impactOccurred?: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
  notificationOccurred?: (type: "error" | "success" | "warning") => void;
  selectionChanged?: () => void;
};

export type TelegramWebApp = {
  initData: string;
  initDataUnsafe?: { user?: TelegramWebAppUser };
  ready: () => void;
  expand?: () => void;
  close?: () => void;
  version?: string;
  platform?: string;
  HapticFeedback?: TelegramHapticFeedback;
  /** Inline-режим бота; если недоступен — используйте buildTelegramShareUrl. */
  switchInlineQuery?: (query: string, chatTypes?: string[]) => void;
  openTelegramLink?: (url: string) => void;
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
};

export function prepareTelegramMiniAppShell(wa: TelegramWebApp | null) {
  if (!wa) return;
  try {
    wa.ready();
  } catch {
    /* */
  }
  try {
    wa.expand?.();
  } catch {
    /* */
  }
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

export function getTelegramInitData(): string {
  const wa = getTelegramWebApp();
  return typeof wa?.initData === "string" ? wa.initData : "";
}

export function isTelegramMiniApp(): boolean {
  return Boolean(getTelegramWebApp());
}

const DEFAULT_WAIT_INTERVAL_MS = 200;
const DEFAULT_WAIT_MAX_ATTEMPTS = 10;

/**
 * Ждёт появления `window.Telegram.WebApp` после загрузки telegram-web-app.js.
 * Первая проверка сразу, далее каждые `intervalMs`, не более `maxAttempts` попыток.
 */
export function waitForTelegramWebApp(options?: {
  intervalMs?: number;
  maxAttempts?: number;
}): Promise<TelegramWebApp | null> {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }
  const intervalMs = options?.intervalMs ?? DEFAULT_WAIT_INTERVAL_MS;
  const maxAttempts = options?.maxAttempts ?? DEFAULT_WAIT_MAX_ATTEMPTS;

  return new Promise((resolve) => {
    let attempt = 0;
    const run = () => {
      attempt += 1;
      const wa = window.Telegram?.WebApp ?? null;
      if (wa) {
        resolve(wa);
        return;
      }
      if (attempt >= maxAttempts) {
        resolve(null);
        return;
      }
      window.setTimeout(run, intervalMs);
    };
    run();
  });
}
