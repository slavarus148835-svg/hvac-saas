"use client";

import type { CSSProperties } from "react";
import {
  TELEGRAM_CHANNEL_BUTTON_CAPTION,
  TELEGRAM_CHANNEL_BUTTON_LABEL,
  TELEGRAM_CHANNEL_URL,
} from "@/lib/aboutServiceContent";
import { openTelegramExternalLink } from "@/lib/openTelegramExternalLink";
import { tgHapticButtonTap } from "@/lib/telegramHaptic";

export type TelegramChannelCtaProps = {
  variant?: "web" | "miniapp";
};

const wrapMini: CSSProperties = {
  marginTop: 4,
};

const btnMini: CSSProperties = {
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
  cursor: "pointer",
  boxSizing: "border-box",
};

const captionMini: CSSProperties = {
  margin: "10px 0 0",
  fontSize: 13,
  lineHeight: 1.45,
  color: "#64748b",
  textAlign: "center",
};

export function TelegramChannelCta({ variant = "miniapp" }: TelegramChannelCtaProps) {
  if (variant !== "miniapp") return null;

  return (
    <div style={wrapMini}>
      <button
        type="button"
        style={btnMini}
        onClick={() => {
          tgHapticButtonTap();
          openTelegramExternalLink(TELEGRAM_CHANNEL_URL);
        }}
      >
        {TELEGRAM_CHANNEL_BUTTON_LABEL}
      </button>
      <p style={captionMini}>{TELEGRAM_CHANNEL_BUTTON_CAPTION}</p>
    </div>
  );
}
