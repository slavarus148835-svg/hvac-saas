"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";
import { getTelegramWebApp, isTelegramMiniApp } from "@/lib/telegramMiniApp";

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

export default function TgCalculatorPage() {
  useEffect(() => {
    const wa = getTelegramWebApp();
    try {
      wa?.ready();
    } catch {
      /* */
    }
  }, []);

  const [line, setLine] = useState("…");
  useEffect(() => {
    setLine(
      isTelegramMiniApp()
        ? "Telegram Mini App подключён"
        : "Откройте из Telegram для полного режима Mini App"
    );
  }, []);

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
      />
      <div style={page}>
        <h1 style={title}>Калькулятор монтажника</h1>
        <p style={text}>{line}</p>
        <Link href="/calculator" style={btn}>
          Открыть обычный калькулятор
        </Link>
      </div>
    </>
  );
}
