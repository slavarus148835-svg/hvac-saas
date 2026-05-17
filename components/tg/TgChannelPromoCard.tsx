"use client";

import { useCallback, useState, type CSSProperties } from "react";
import { openTelegramChannel } from "@/lib/telegram/openTelegramChannel";
import { dismissTgChannelPromo, isTgChannelPromoDismissed } from "@/lib/tgChannelPromo";
import { tgHapticButtonTap } from "@/lib/telegramHaptic";

export type TgChannelPromoCardProps = {
  /** В кабинете карточка всегда видна, без «Скрыть». */
  alwaysVisible?: boolean;
  onDismiss?: () => void;
  style?: CSSProperties;
};

const card: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e8edf2",
  borderRadius: 21,
  padding: "18px 18px 16px",
  marginBottom: 16,
  boxShadow: "0 10px 28px rgba(15, 23, 42, 0.06)",
  boxSizing: "border-box",
  maxWidth: "100%",
};

const titleStyle: CSSProperties = {
  margin: "0 0 10px",
  fontSize: 17,
  fontWeight: 800,
  color: "#0f172a",
  letterSpacing: "-0.02em",
  lineHeight: 1.3,
};

const textStyle: CSSProperties = {
  margin: "0 0 14px",
  fontSize: 14,
  lineHeight: 1.55,
  color: "#475569",
};

const btnPrimary: CSSProperties = {
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
  cursor: "pointer",
  boxSizing: "border-box",
};

const btnGhost: CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 10,
  padding: "10px 12px",
  borderRadius: 12,
  border: "none",
  background: "transparent",
  color: "#64748b",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

export function TgChannelPromoCard({
  alwaysVisible = false,
  onDismiss,
  style,
}: TgChannelPromoCardProps) {
  const [hidden, setHidden] = useState(() => !alwaysVisible && isTgChannelPromoDismissed());

  const handleOpen = useCallback(() => {
    tgHapticButtonTap();
    openTelegramChannel();
  }, []);

  const handleDismiss = useCallback(() => {
    tgHapticButtonTap();
    dismissTgChannelPromo();
    setHidden(true);
    onDismiss?.();
  }, [onDismiss]);

  if (hidden) return null;

  return (
    <div style={{ ...card, ...style }} role="region" aria-label="Канал HVAC-SaaS">
      <h2 style={titleStyle}>🔥 Канал для монтажников</h2>
      <p style={textStyle}>
        В Telegram-канале показываю обновления HVAC-SaaS, фишки для расчётов, идеи для повышения
        среднего чека и практические подсказки для монтажников кондиционеров.
      </p>
      <p style={{ ...textStyle, marginBottom: 16 }}>
        Подпишись, чтобы не пропускать новые функции и полезные разборы.
      </p>
      <button type="button" style={btnPrimary} onClick={handleOpen}>
        🔥 Перейти в канал
      </button>
      {!alwaysVisible ? (
        <button type="button" style={btnGhost} onClick={handleDismiss}>
          Скрыть
        </button>
      ) : null}
    </div>
  );
}
