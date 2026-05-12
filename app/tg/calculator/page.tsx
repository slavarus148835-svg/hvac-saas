"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";
import { waitForTelegramWebApp } from "@/lib/telegramMiniApp";

const page: React.CSSProperties = {
  minHeight: "100vh",
  padding: "20px 16px 32px",
  maxWidth: 440,
  margin: "0 auto",
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  background: "#f8fafc",
  color: "#0f172a",
  boxSizing: "border-box",
};

const title: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  margin: "0 0 12px",
};

const text: React.CSSProperties = {
  fontSize: 15,
  color: "#475569",
  lineHeight: 1.55,
  margin: "0 0 20px",
};

const btn: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "center",
  padding: "14px 16px",
  borderRadius: 14,
  border: "none",
  background: "#0f172a",
  color: "#fff",
  fontSize: 16,
  fontWeight: 700,
  textDecoration: "none",
  boxSizing: "border-box",
};

const tgLine: React.CSSProperties = {
  fontSize: 13,
  color: "#64748b",
  margin: "0 0 8px",
};

export default function TgCalculatorPage() {
  const [ready, setReady] = useState(false);
  const [inTelegram, setInTelegram] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const wa = await waitForTelegramWebApp({
        intervalMs: 200,
        maxAttempts: 10,
      });
      if (cancelled) return;

      if (wa) {
        try {
          wa.ready();
        } catch {
          /* */
        }
        setInTelegram(true);
      } else {
        setInTelegram(false);
      }
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
        onLoad={() => {
          const wa = window.Telegram?.WebApp;
          if (wa) {
            try {
              wa.ready();
            } catch {
              /* */
            }
          }
        }}
      />
      <div style={page}>
        <h1 style={title}>Калькулятор монтажника</h1>
        {!ready ? (
          <p style={text}>Проверка окружения…</p>
        ) : (
          <>
            <p style={tgLine}>
              {inTelegram === true
                ? "Внутри Telegram WebApp: да"
                : inTelegram === false
                  ? "Внутри Telegram WebApp: нет"
                  : "Проверка…"}
            </p>
            <p style={text}>
              {inTelegram
                ? "Telegram Mini App подключён"
                : "Откройте из Telegram для полного режима Mini App"}
            </p>
          </>
        )}
        <Link href="/calculator" style={btn}>
          Открыть обычный калькулятор
        </Link>
      </div>
    </>
  );
}
