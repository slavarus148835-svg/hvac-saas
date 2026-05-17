"use client";

import type { CSSProperties, MouseEvent } from "react";
import { getTelegramMiniAppUrl } from "@/lib/telegramMiniAppLinks";

type Props = {
  telegramUserId?: string | null;
  telegramUsername?: string | null;
};

const cardStyle: CSSProperties = {
  marginTop: 20,
  padding: 16,
  borderRadius: 14,
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
  position: "relative",
  zIndex: 2,
};

const linkButtonStyle: CSSProperties = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  padding: "12px 14px",
  borderRadius: 12,
  border: "none",
  background: "#0f172a",
  color: "#fff",
  fontWeight: 700,
  fontSize: 14,
  textAlign: "center",
  textDecoration: "none",
  cursor: "pointer",
  pointerEvents: "auto",
  position: "relative",
  zIndex: 2,
};

const MINI_APP_HINT =
  "Откроется Telegram и запустится мини-приложение HVAC Калькулятор.";

function openMiniAppFallback(url: string) {
  if (typeof window === "undefined") return;
  window.location.href = url;
}

export function TelegramMiniAppLinkBlock({ telegramUserId, telegramUsername }: Props) {
  const miniAppUrl = getTelegramMiniAppUrl();
  const linked = Boolean(String(telegramUserId ?? "").replace(/\D/g, ""));

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const touchOrMobile =
      /iPhone|iPad|iPod|Android/i.test(ua) ||
      (typeof window !== "undefined" && "ontouchstart" in window);

    if (touchOrMobile) {
      e.preventDefault();
      openMiniAppFallback(miniAppUrl);
    }
  };

  return (
    <div style={cardStyle}>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Мини-приложение Telegram</div>
      {linked ? (
        <p style={{ margin: "0 0 12px", color: "#16a34a", fontSize: 14 }}>
          Telegram привязан
          {telegramUsername ? ` (@${String(telegramUsername).replace(/^@/, "")})` : ""}
        </p>
      ) : (
        <p style={{ margin: "0 0 12px", color: "#64748b", fontSize: 14, lineHeight: 1.45 }}>
          Привяжите Telegram, чтобы быстро открывать калькулятор прямо из бота.
        </p>
      )}
      <a
        href={miniAppUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        style={linkButtonStyle}
      >
        {linked ? "Открыть мини-приложение Telegram" : "Перейти в мини-приложение Telegram"}
      </a>
      <p style={{ margin: "10px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.45 }}>
        {MINI_APP_HINT}
      </p>
    </div>
  );
}
