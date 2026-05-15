"use client";

import type React from "react";
import {
  CALCULATOR_BTU_ONLY_OPTIONS,
  normalizeRoughInRouteCapacity,
} from "@/lib/calculator/roughInMode";
import { formatCapacityBtu } from "@/lib/calculator/capacityDisplay";

const labelWeb: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 6,
  color: "#475569",
};

const labelMini: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 6,
  color: "#475569",
  lineHeight: 1.35,
};

const inputWeb: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  fontSize: 16,
  marginBottom: 12,
  boxSizing: "border-box",
};

const inputMini: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  fontSize: 16,
  marginBottom: 12,
  boxSizing: "border-box",
};

export type CalculatorRoughInRouteCapacitySelectProps = {
  value: string;
  onChange: (value: string) => void;
  variant?: "web" | "miniapp";
};

/** Селектор типа трассы только для режима «Закладка трасс». */
export function CalculatorRoughInRouteCapacitySelect({
  value,
  onChange,
  variant = "web",
}: CalculatorRoughInRouteCapacitySelectProps) {
  const safe = normalizeRoughInRouteCapacity(value);
  const labelStyle = variant === "miniapp" ? labelMini : labelWeb;
  const inputStyle = variant === "miniapp" ? inputMini : inputWeb;

  if (variant === "web") {
    return (
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>
          Трасса под кондиционер
          <select
            value={safe}
            onChange={(e) => onChange(e.target.value)}
            style={{ ...inputStyle, marginTop: 6, marginBottom: 0 }}
          >
            {CALCULATOR_BTU_ONLY_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {formatCapacityBtu(v)}
              </option>
            ))}
          </select>
        </label>
        <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.4 }}>
          Влияет только на цену трассы за метр, без монтажа блока.
        </p>
      </div>
    );
  }

  return (
    <>
      <span style={labelStyle}>Трасса под кондиционер</span>
      <select
        style={inputStyle}
        value={safe}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Трасса под кондиционер"
      >
        {CALCULATOR_BTU_ONLY_OPTIONS.map((v) => (
          <option key={v} value={v}>
            {formatCapacityBtu(v)}
          </option>
        ))}
      </select>
    </>
  );
}
