"use client";

import type { CSSProperties } from "react";
import {
  ABOUT_SERVICE_EMAIL,
  ABOUT_SERVICE_LEGAL_LINES,
  ABOUT_SERVICE_PARAGRAPHS,
  ABOUT_SERVICE_TITLE,
  TELEGRAM_CHANNEL_URL,
} from "@/lib/aboutServiceContent";

export type AboutServiceContentProps = {
  variant?: "web" | "miniapp";
  /** Блок канала: на web — мягкая ссылка, на miniapp — не рендерится (CTA отдельно). */
  showWebChannelHint?: boolean;
};

const titleWeb: CSSProperties = {
  margin: "0 0 16px",
  fontSize: "28px",
  lineHeight: 1.15,
  color: "#111827",
};

const titleMini: CSSProperties = {
  margin: "0 0 12px",
  fontSize: 22,
  fontWeight: 800,
  lineHeight: 1.2,
  color: "#0f172a",
};

const sectionTitleWeb: CSSProperties = {
  margin: "22px 0 10px",
  fontSize: "18px",
  color: "#111827",
};

const sectionTitleMini: CSSProperties = {
  margin: "18px 0 8px",
  fontSize: 17,
  fontWeight: 700,
  color: "#0f172a",
};

const paraWeb: CSSProperties = {
  margin: "0 0 14px",
  fontSize: "15px",
  lineHeight: 1.55,
  color: "#374151",
  overflowWrap: "anywhere",
  whiteSpace: "pre-line",
};

const paraMini: CSSProperties = {
  margin: "0 0 12px",
  fontSize: 14,
  lineHeight: 1.55,
  color: "#334155",
  overflowWrap: "anywhere",
  whiteSpace: "pre-line",
};

const linkWeb: CSSProperties = {
  color: "#0369a1",
  textDecoration: "underline",
};

const linkMini: CSSProperties = {
  color: "#0369a1",
  fontWeight: 600,
  textDecoration: "underline",
};

const tgSoftBlock: CSSProperties = {
  marginTop: "8px",
  padding: "14px 16px",
  borderRadius: "14px",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
};

const tgSoftText: CSSProperties = {
  margin: 0,
  fontSize: "14px",
  lineHeight: 1.55,
  color: "#475569",
};

export function AboutServiceContent({
  variant = "web",
  showWebChannelHint = variant === "web",
}: AboutServiceContentProps) {
  const isMini = variant === "miniapp";
  const titleStyle = isMini ? titleMini : titleWeb;
  const sectionStyle = isMini ? sectionTitleMini : sectionTitleWeb;
  const paraStyle = isMini ? paraMini : paraWeb;
  const linkStyle = isMini ? linkMini : linkWeb;

  return (
    <>
      <h1 style={titleStyle}>{ABOUT_SERVICE_TITLE}</h1>

      {ABOUT_SERVICE_PARAGRAPHS.map((text) => (
        <p key={text.slice(0, 32)} style={paraStyle}>
          {text}
        </p>
      ))}

      <h2 style={sectionStyle}>Контакты</h2>
      <p style={paraStyle}>
        Email:{" "}
        <a href={`mailto:${ABOUT_SERVICE_EMAIL}`} style={linkStyle}>
          {ABOUT_SERVICE_EMAIL}
        </a>
      </p>

      <p style={paraStyle}>
        {ABOUT_SERVICE_LEGAL_LINES.map((line, i) => (
          <span key={line}>
            {i > 0 ? <br /> : null}
            {line}
          </span>
        ))}
      </p>

      {showWebChannelHint ? (
        <div style={tgSoftBlock}>
          <p style={tgSoftText}>
            Следи за обновлениями и полезной информацией:{" "}
            <a
              href={TELEGRAM_CHANNEL_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={linkStyle}
            >
              {TELEGRAM_CHANNEL_URL}
            </a>
          </p>
        </div>
      ) : null}
    </>
  );
}
