import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

const page: CSSProperties = {
  minHeight: "100dvh",
  padding:
    "max(20px, env(safe-area-inset-top)) 20px max(32px, env(safe-area-inset-bottom))",
  background: "linear-gradient(165deg, #0a0f1a 0%, #111827 45%, #0f172a 100%)",
  color: "#e2e8f0",
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  boxSizing: "border-box",
};

const inner: CSSProperties = {
  maxWidth: 560,
  margin: "0 auto",
};

const card: CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 18,
  padding: "24px 22px",
  boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
};

const h1: CSSProperties = {
  margin: "0 0 20px",
  fontSize: "clamp(1.5rem, 5vw, 1.85rem)",
  fontWeight: 800,
  letterSpacing: "-0.03em",
  lineHeight: 1.2,
  color: "#f8fafc",
};

export const tgLegalP: CSSProperties = {
  margin: "0 0 14px",
  fontSize: 15,
  lineHeight: 1.65,
  color: "#cbd5e1",
};

export const tgLegalList: CSSProperties = {
  margin: "0 0 16px",
  paddingLeft: 20,
  color: "#cbd5e1",
  fontSize: 15,
  lineHeight: 1.65,
};

export const tgLegalContact: CSSProperties = {
  marginTop: 20,
  paddingTop: 16,
  borderTop: "1px solid rgba(148,163,184,0.2)",
  fontSize: 15,
  color: "#e2e8f0",
};

const backLink: CSSProperties = {
  display: "inline-block",
  marginBottom: 18,
  fontSize: 14,
  fontWeight: 600,
  color: "#94a3b8",
  textDecoration: "none",
};

type Props = {
  title: string;
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
};

export function TgLegalPageLayout({
  title,
  children,
  backHref = "/tg",
  backLabel = "← Назад в Mini App",
}: Props) {
  return (
    <div style={page}>
      <div style={inner}>
        <Link href={backHref} style={backLink}>
          {backLabel}
        </Link>
        <article style={card}>
          <h1 style={h1}>{title}</h1>
          {children}
        </article>
      </div>
    </div>
  );
}
