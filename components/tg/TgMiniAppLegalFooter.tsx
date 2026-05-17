"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { tgHapticButtonTap } from "@/lib/telegramHaptic";

const wrap: CSSProperties = {
  marginTop: 20,
  paddingTop: 14,
  borderTop: "1px solid rgba(148,163,184,0.15)",
  display: "flex",
  flexWrap: "wrap",
  gap: "10px 16px",
  justifyContent: "center",
};

const link: CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  textDecoration: "none",
  fontWeight: 500,
};

type Props = {
  variant?: "light" | "dark";
};

export function TgMiniAppLegalFooter({ variant = "light" }: Props) {
  const color = variant === "dark" ? "#94a3b8" : "#64748b";
  return (
    <footer style={wrap} aria-label="Правовая информация">
      <Link
        href="/privacy"
        style={{ ...link, color }}
        onClick={() => tgHapticButtonTap()}
      >
        Политика конфиденциальности
      </Link>
      <Link
        href="/terms"
        style={{ ...link, color }}
        onClick={() => tgHapticButtonTap()}
      >
        Пользовательское соглашение
      </Link>
    </footer>
  );
}
