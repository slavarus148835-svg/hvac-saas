"use client";

import { CALCULATOR_ROUGH_IN_LABEL_RU } from "@/lib/calculator/roughInMode";

const TRACE_ONLY_NOTE = "Отдельный режим без монтажа кондиционера";

export type CalculatorTraceOnlyModeCardProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  variant?: "web" | "miniapp";
};

export function CalculatorTraceOnlyModeCard({
  checked,
  onCheckedChange,
  variant = "web",
}: CalculatorTraceOnlyModeCardProps) {
  if (variant === "miniapp") {
    return (
      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          padding: "14px 16px",
          marginBottom: 16,
          background: checked ? "#f0f9ff" : "#f8fafc",
          border: `1px solid ${checked ? "#7dd3fc" : "#e2e8f0"}`,
          borderRadius: 14,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          style={{ width: 24, height: 24, flexShrink: 0, marginTop: 2 }}
        />
        <span>
          <span
            style={{
              display: "block",
              fontWeight: 700,
              fontSize: 15,
              color: "#0f172a",
              marginBottom: 4,
            }}
          >
            {CALCULATOR_ROUGH_IN_LABEL_RU}
          </span>
          <span style={{ display: "block", fontSize: 13, color: "#64748b", lineHeight: 1.4 }}>
            {TRACE_ONLY_NOTE}
          </span>
        </span>
      </label>
    );
  }

  return (
    <div
      style={{
        padding: "14px 16px",
        marginBottom: 16,
        background: checked ? "#f0f9ff" : "#f8fafc",
        border: `1px solid ${checked ? "#7dd3fc" : "#e2e8f0"}`,
        borderRadius: 12,
      }}
    >
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0 }}
        />
        <span style={{ fontSize: 15, color: "#334155", lineHeight: 1.45 }}>
          <strong>{CALCULATOR_ROUGH_IN_LABEL_RU}</strong>
          <br />
          <span style={{ fontSize: 13, color: "#64748b" }}>{TRACE_ONLY_NOTE}</span>
        </span>
      </label>
    </div>
  );
}
