/** Типы Telegram WebApp (минимально нужные для Mini App). */
export type TelegramWebAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type TelegramWebApp = {
  initData: string;
  initDataUnsafe?: { user?: TelegramWebAppUser };
  ready: () => void;
  expand?: () => void;
  close?: () => void;
  version?: string;
  platform?: string;
};

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
