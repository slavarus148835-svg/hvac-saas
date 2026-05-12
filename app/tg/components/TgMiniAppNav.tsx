"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";
import { tgHapticButtonTap } from "@/lib/telegramHaptic";

const ITEMS = [
  { href: "/tg/calculator", label: "Калькулятор" },
  { href: "/tg/history", label: "История" },
  { href: "/tg/price", label: "Прайс" },
  { href: "/tg/models", label: "Модели" },
  { href: "/tg/cabinet", label: "Кабинет" },
] as const;

const wrap: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginBottom: 14,
};

const basePill: CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  fontSize: 14,
  fontWeight: 700,
  textDecoration: "none",
  border: "1px solid #e2e8f0",
  background: "#fff",
  color: "#334155",
  boxSizing: "border-box",
};

const activePill: CSSProperties = {
  ...basePill,
  background: "#0f172a",
  color: "#fff",
  borderColor: "#0f172a",
};

export default function TgMiniAppNav() {
  const pathname = usePathname();

  return (
    <nav style={wrap} aria-label="Разделы Mini App">
      {ITEMS.map((it) => {
        const active = pathname === it.href || pathname?.startsWith(`${it.href}/`);
        return (
          <Link
            key={it.href}
            href={it.href}
            prefetch
            style={active ? activePill : basePill}
            onClick={() => tgHapticButtonTap()}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
