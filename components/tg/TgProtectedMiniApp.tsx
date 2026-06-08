"use client";

import type { ReactNode } from "react";
import Script from "next/script";
import type { TelegramMiniAppProfile } from "@/lib/telegramMiniAppAuth";
import { TgMiniAppGateShell } from "@/components/tg/TgMiniAppGateShell";
import { useTgMiniAppAccess } from "@/lib/useTgMiniAppAccess";
import { prepareTelegramMiniAppShell } from "@/lib/telegramMiniApp";

type Props = {
  children: ReactNode;
  onReady?: (profile: TelegramMiniAppProfile) => void;
  /** false для /tg/cabinet — кабинет без подписки, сервисы с assertMiniAppServiceAccess. */
  requireSubscription?: boolean;
};

/**
 * Обёртка для защищённых страниц Mini App (/tg/calculator, history, …).
 */
export function TgProtectedMiniApp({
  children,
  onReady,
  requireSubscription = true,
}: Props) {
  const access = useTgMiniAppAccess({
    enabled: true,
    requireTelegram: true,
    requireSubscription,
  });

  if (access.phase === "ready" && access.profile) {
    onReady?.(access.profile);
    return (
      <>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="afterInteractive"
          onLoad={() => prepareTelegramMiniAppShell(window.Telegram?.WebApp ?? null)}
        />
        {children}
      </>
    );
  }

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
        onLoad={() => prepareTelegramMiniAppShell(window.Telegram?.WebApp ?? null)}
      />
      <TgMiniAppGateShell
        phase={access.phase}
        initData={access.initData}
        profile={access.profile}
        errorMessage={access.errorMessage}
        onRetryLogin={() => access.refresh()}
        onEmailVerified={() => access.refresh()}
        onLinked={() => {
          access.refresh();
        }}
      />
    </>
  );
}
