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

const statusBox: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: "14px 16px",
  marginBottom: 20,
  fontSize: 14,
  lineHeight: 1.5,
  color: "#334155",
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

export default function TgCabinetPage() {
  const [ready, setReady] = useState(false);
  const [inTelegram, setInTelegram] = useState<boolean | null>(null);
  const [detail, setDetail] = useState("");

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
        setDetail(
          [
            "Telegram WebApp активен",
            wa.version ? `SDK: ${wa.version}` : null,
            wa.platform ? `Платформа: ${wa.platform}` : null,
            wa.initData ? "initData получен" : null,
          ]
            .filter(Boolean)
            .join("\n")
        );
      } else {
        setInTelegram(false);
        setDetail(
          "Вне Telegram Mini App — откройте из бота для режима WebApp."
        );
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
        <h1 style={title}>Кабинет</h1>
        <div style={statusBox}>
          <strong>Подключение Telegram</strong>
          <br />
          <br />
          {!ready ? (
            "…"
          ) : (
            <>
              {inTelegram === true
                ? "Внутри Telegram WebApp: да"
                : inTelegram === false
                  ? "Внутри Telegram WebApp: нет"
                  : "Проверка…"}
              <br />
              <br />
              {detail}
            </>
          )}
        </div>
        <Link href="/dashboard" style={btn}>
          Открыть обычный кабинет
        </Link>
        <p
          style={{
            marginTop: 12,
            fontSize: 12,
            color: "#94a3b8",
            textAlign: "center",
          }}
        >
          В проекте кабинет — это /dashboard
        </p>
      </div>
    </>
  );
}
