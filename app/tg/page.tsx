"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { useEffect, useState, type CSSProperties } from "react";
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
 * Сервисная страница /tg в обычном браузере.
 * В Telegram Mini App сразу редирект на /tg/calculator (главный экран Mini App).
 */
export default function TgMiniAppHomePage() {
  const router = useRouter();
  const [phase, setPhase] = useState<"checking" | "telegram" | "browser">("checking");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const wa = await waitForTelegramWebApp({
        intervalMs: 200,
        maxAttempts: 12,
      });
      if (cancelled) return;
      if (wa) {
        prepareTelegramMiniAppShell(wa);
        setPhase("telegram");
        router.replace("/tg/calculator");
        return;
      }
      setPhase("browser");
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
        onLoad={() => prepareTelegramMiniAppShell(window.Telegram?.WebApp ?? null)}
      />
      {phase === "checking" || phase === "telegram" ? (
        <div style={{ ...page, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: 16 }}>Открываем калькулятор…</p>
        </div>
      ) : (
        <div style={page}>
          <h1 style={title}>HVAC SaaS</h1>
          <p style={sub}>
            Слой Mini App для Telegram. Внутри Telegram приложение открывается сразу в калькуляторе.
            Здесь — веб-версия справки.
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
        </div>
      )}
    </>
  );
}
