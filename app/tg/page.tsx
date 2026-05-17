"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { useEffect, useState, type CSSProperties } from "react";
import { TgMiniAppGateShell } from "@/components/tg/TgMiniAppGateShell";
import { TgMiniAppOnboarding } from "@/components/tg/TgMiniAppOnboarding";
import { TgMiniAppLegalFooter } from "@/components/tg/TgMiniAppLegalFooter";
import {
  completeMiniAppStoreOnboarding,
  shouldShowMiniAppStoreOnboarding,
} from "@/lib/miniAppOnboarding";
import { useTgMiniAppAccess } from "@/lib/useTgMiniAppAccess";
import { prepareTelegramMiniAppShell, waitForTelegramWebApp } from "@/lib/telegramMiniApp";

const page: CSSProperties = {
  minHeight: "100dvh",
  padding: "20px 16px max(32px, env(safe-area-inset-bottom))",
  maxWidth: 440,
  margin: "0 auto",
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  background: "#f8fafc",
  color: "#0f172a",
  boxSizing: "border-box",
};

const title: CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  margin: "0 0 8px",
  letterSpacing: "-0.02em",
};

const sub: CSSProperties = {
  fontSize: 15,
  color: "#64748b",
  margin: "0 0 20px",
  lineHeight: 1.5,
};

const btn: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "center",
  padding: "16px 18px",
  borderRadius: 14,
  border: "none",
  background: "#0f172a",
  color: "#fff",
  fontSize: 17,
  fontWeight: 700,
  textDecoration: "none",
  cursor: "pointer",
  boxSizing: "border-box",
};

const btnSecondary: CSSProperties = {
  ...btn,
  background: "#ffffff",
  color: "#0f172a",
  border: "2px solid #e2e8f0",
  marginTop: 12,
};

/**
 * Точка входа Mini App: gate (link / verify) → onboarding → калькулятор.
 */
export default function TgMiniAppHomePage() {
  const router = useRouter();
  const [inBrowser, setInBrowser] = useState<boolean | null>(null);
  const access = useTgMiniAppAccess({ enabled: inBrowser === false, requireTelegram: true });
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const wa = await waitForTelegramWebApp({ intervalMs: 200, maxAttempts: 12 });
      if (cancelled) return;
      setInBrowser(!wa);
      if (wa) prepareTelegramMiniAppShell(wa);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (inBrowser !== false || access.phase !== "ready") {
      setOnboardingChecked(false);
      setShowOnboarding(false);
      return;
    }
    if (onboardingChecked) return;
    let cancelled = false;
    void shouldShowMiniAppStoreOnboarding().then((show) => {
      if (cancelled) return;
      setOnboardingChecked(true);
      if (show) setShowOnboarding(true);
      else router.replace("/tg/calculator");
    });
    return () => {
      cancelled = true;
    };
  }, [inBrowser, access.phase, onboardingChecked, router]);

  if (inBrowser === null || (inBrowser === false && access.phase === "loading")) {
    return (
      <>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="afterInteractive"
          onLoad={() => prepareTelegramMiniAppShell(window.Telegram?.WebApp ?? null)}
        />
        <div style={{ ...page, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: 16 }}>Проверка аккаунта…</p>
        </div>
      </>
    );
  }

  if (inBrowser) {
    return (
      <>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="afterInteractive"
          onLoad={() => prepareTelegramMiniAppShell(window.Telegram?.WebApp ?? null)}
        />
        <div style={page}>
          <h1 style={title}>HVAC SaaS</h1>
          <p style={sub}>
            Слой Mini App для Telegram. Внутри Telegram после входа открывается калькулятор.
          </p>
          <Link href="/tg/calculator" style={btn}>
            Калькулятор Mini App
          </Link>
          <Link href="/tg/history" style={btnSecondary}>
            История расчётов
          </Link>
          <Link href="/tg/cabinet" style={btnSecondary}>
            Кабинет (Mini App)
          </Link>
          <TgMiniAppLegalFooter />
        </div>
      </>
    );
  }

  if (showOnboarding) {
    return (
      <>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="afterInteractive"
          onLoad={() => prepareTelegramMiniAppShell(window.Telegram?.WebApp ?? null)}
        />
        <TgMiniAppOnboarding
          onComplete={() => {
            void completeMiniAppStoreOnboarding().then(() => {
              router.replace("/tg/calculator");
            });
          }}
        />
      </>
    );
  }

  if (access.phase === "ready" && onboardingChecked && !showOnboarding) {
    return (
      <div style={{ ...page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ margin: 0, color: "#64748b", fontSize: 16 }}>Открываем калькулятор…</p>
      </div>
    );
  }

  if (access.phase !== "ready") {
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
          onLinked={() => access.refresh()}
        />
        <div style={{ maxWidth: 440, margin: "0 auto", padding: "0 16px 24px" }}>
          <TgMiniAppLegalFooter />
        </div>
      </>
    );
  }

  return null;
}
