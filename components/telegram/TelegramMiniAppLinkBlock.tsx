"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import { createTelegramWebLinkToken } from "@/lib/telegramWebLink";
import { openTelegramExternalLink } from "@/lib/openTelegramExternalLink";

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
};

export function TelegramMiniAppLinkBlock({ telegramUserId, telegramUsername }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const linked = Boolean(String(telegramUserId ?? "").replace(/\D/g, ""));

  const handleOpen = async () => {
    setMessage(null);
    if (linked) {
      const bot = String(process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "hvac_cash_bot").trim();
      openTelegramExternalLink(`https://t.me/${bot}/app`);
      return;
    }

    setLoading(true);
    try {
      const result = await createTelegramWebLinkToken();
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      openTelegramExternalLink(result.linkUrl);
      setMessage("Откройте Telegram и запустите мини-приложение из бота.");
    } finally {
      setLoading(false);
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
      <button
        type="button"
        onClick={() => void handleOpen()}
        disabled={loading}
        style={{
          width: "100%",
          padding: "12px 14px",
          borderRadius: 12,
          border: "none",
          background: "#0f172a",
          color: "#fff",
          fontWeight: 700,
          fontSize: 14,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading
          ? "Подготовка ссылки…"
          : linked
            ? "Открыть мини-приложение Telegram"
            : "Перейти в мини-приложение Telegram"}
      </button>
      {message ? (
        <p style={{ margin: "10px 0 0", fontSize: 13, color: "#64748b" }}>{message}</p>
      ) : null}
    </div>
  );
}
