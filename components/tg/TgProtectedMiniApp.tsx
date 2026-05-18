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
};

/**
 * Обёртка для защищённых страниц Mini App (/tg/calculator, history, …).
 * Показывает gate (link / verify), пока нет verified email.
 */
export function TgProtectedMiniApp({ children, onReady }: Props) {
  const access = useTgMiniAppAccess({ enabled: true, requireTelegram: true });

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
        onLinked={() => {
          access.refresh();
        }}
      />
    </>
  );
}
