"use client";

import { useState, type CSSProperties } from "react";
import { tgHapticButtonTap, tgHapticNotification } from "@/lib/telegramHaptic";

const STEPS = [
  {
    title: "Считай монтаж за 1 минуту",
    body: "Быстрый расчёт стоимости кондиционера и дополнительных работ прямо в Telegram.",
  },
  {
    title: "Не забывай мелочи",
    body: "Трасса, штроба, дренаж, подъём и другие допы всегда под контролем.",
  },
  {
    title: "Отправляй клиенту готовую смету",
    body: "Аккуратный текст расчёта для WhatsApp и Telegram без ручного оформления.",
  },
] as const;

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 200,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding:
    "max(16px, env(safe-area-inset-top)) 16px max(20px, env(safe-area-inset-bottom))",
  boxSizing: "border-box",
  background: "linear-gradient(165deg, #0a0f1a 0%, #111827 50%, #0f172a 100%)",
};

const card: CSSProperties = {
  width: "100%",
  maxWidth: 400,
  borderRadius: 22,
  padding: "28px 22px 22px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(148,163,184,0.22)",
  boxShadow: "0 28px 80px rgba(0,0,0,0.45)",
  boxSizing: "border-box",
  animation: "tgOnboardingFadeIn 0.35s ease-out",
};

const titleStyle: CSSProperties = {
  margin: "0 0 12px",
  fontSize: "clamp(1.35rem, 5vw, 1.65rem)",
  fontWeight: 800,
  lineHeight: 1.25,
  letterSpacing: "-0.03em",
  color: "#f8fafc",
};

const bodyStyle: CSSProperties = {
  margin: "0 0 20px",
  fontSize: 16,
  lineHeight: 1.55,
  color: "#94a3b8",
};

const btnPrimary: CSSProperties = {
  width: "100%",
  padding: "15px 18px",
  borderRadius: 14,
  border: "none",
  background: "linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)",
  color: "#fff",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
  boxSizing: "border-box",
};

const btnGhost: CSSProperties = {
  width: "100%",
  padding: "12px 18px",
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "transparent",
  color: "#cbd5e1",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
  marginTop: 10,
  boxSizing: "border-box",
};

const dotsRow: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  gap: 8,
  marginBottom: 22,
};

type Props = {
  onComplete: () => void;
};

export function TgMiniAppOnboarding({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const isLast = step >= STEPS.length - 1;

  return (
    <>
      <style>{`
        @keyframes tgOnboardingFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={overlay} role="dialog" aria-modal="true" aria-label="Знакомство с HVAC-SaaS">
        <div style={card} key={step}>
          <div style={dotsRow}>
            {STEPS.map((_, i) => (
              <span
                key={i}
                style={{
                  width: i === step ? 22 : 8,
                  height: 8,
                  borderRadius: 999,
                  background: i === step ? "#38bdf8" : "rgba(148,163,184,0.35)",
                  transition: "width 0.25s ease, background 0.25s ease",
                }}
              />
            ))}
          </div>
          <h2 style={titleStyle}>{STEPS[step].title}</h2>
          <p style={bodyStyle}>{STEPS[step].body}</p>
          <p style={{ margin: "0 0 18px", fontSize: 13, color: "#64748b", textAlign: "center" }}>
            {step + 1} / {STEPS.length}
          </p>
          {isLast ? (
            <button
              type="button"
              style={btnPrimary}
              onClick={() => {
                tgHapticNotification("success");
                onComplete();
              }}
            >
              Начать расчёт
            </button>
          ) : (
            <button
              type="button"
              style={btnPrimary}
              onClick={() => {
                tgHapticButtonTap();
                setStep((s) => Math.min(s + 1, STEPS.length - 1));
              }}
            >
              Далее
            </button>
          )}
          {step > 0 ? (
            <button
              type="button"
              style={btnGhost}
              onClick={() => {
                tgHapticButtonTap();
                setStep((s) => Math.max(0, s - 1));
              }}
            >
              Назад
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
