"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { AboutServiceContent } from "@/components/about/AboutServiceContent";
import { TelegramChannelCta } from "@/components/about/TelegramChannelCta";
import TgMiniAppNav from "@/app/tg/components/TgMiniAppNav";
import { prepareTelegramMiniAppShell, waitForTelegramWebApp } from "@/lib/telegramMiniApp";

const page: React.CSSProperties = {
  minHeight: "100dvh",
  padding:
    "max(12px, env(safe-area-inset-top)) 16px calc(32px + env(safe-area-inset-bottom))",
  maxWidth: 440,
  margin: "0 auto",
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  background: "#f8fafc",
  color: "#0f172a",
  boxSizing: "border-box",
};

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: "16px 18px",
  marginBottom: 14,
  boxSizing: "border-box",
};

export default function TgAboutPage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const wa = await waitForTelegramWebApp({
        intervalMs: 200,
        maxAttempts: 10,
      });
      if (cancelled) return;
      if (wa) prepareTelegramMiniAppShell(wa);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
        onLoad={() => prepareTelegramMiniAppShell(window.Telegram?.WebApp ?? null)}
      />
      <div style={page}>
        {ready ? <TgMiniAppNav /> : null}
        <div style={card}>
          <AboutServiceContent variant="miniapp" showWebChannelHint={false} />
        </div>
        <TelegramChannelCta variant="miniapp" />
      </div>
    </>
  );
}
