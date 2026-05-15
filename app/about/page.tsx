"use client";

import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { AboutServiceContent } from "@/components/about/AboutServiceContent";
import { withAuthGuard } from "@/lib/withAuthGuard";

function AboutPage() {
  const router = useRouter();

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <button type="button" onClick={() => router.push("/dashboard")} style={backButtonStyle}>
          Назад в кабинет
        </button>

        <AboutServiceContent variant="web" showWebChannelHint />
      </div>
    </div>
  );
}

export default withAuthGuard(AboutPage);

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#f4f6f8",
  padding: "12px clamp(12px, 4vw, 20px) 32px",
  maxWidth: "720px",
  margin: "0 auto",
  boxSizing: "border-box",
};

const cardStyle: CSSProperties = {
  background: "#ffffff",
  borderRadius: "20px",
  padding: "clamp(16px, 4vw, 24px)",
  boxShadow: "0 10px 28px rgba(0,0,0,0.06)",
  maxWidth: "100%",
  boxSizing: "border-box",
};

const backButtonStyle: CSSProperties = {
  marginBottom: "18px",
  padding: "10px 14px",
  borderRadius: "14px",
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
};
