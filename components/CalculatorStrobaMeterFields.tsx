"use client";

import type { StrobaMetersFields } from "@/lib/calculator/strobaFields";
import { MAX_STROBA_METERS } from "@/lib/calculator/constants";
import { bindZeroReplacingNumericInput } from "@/lib/calculator/numericInput";
import { sanitizeDecimalMetersString } from "@/lib/calculator/parse";

const STROBA_MIN_NOTE =
  "Мин. 1 м на комнату по сумме всех штроб (основная + дренаж/кабель)";

type Patch = Partial<StrobaMetersFields>;

export type CalculatorStrobaMeterFieldsProps = {
  values: StrobaMetersFields;
  onPatch: (patch: Patch) => void;
  variant: "web" | "miniapp";
  /** Web: FieldMessage для полей (опционально). */
  fieldErrors?: Partial<Record<keyof StrobaMetersFields, string>>;
  fieldWarnings?: Partial<Record<keyof StrobaMetersFields, string>>;
  onMetersFieldChange?: (
    key: keyof StrobaMetersFields,
    value: string,
    setLocal: (v: string) => void
  ) => void;
};

const webInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  fontSize: 16,
  marginBottom: 12,
  boxSizing: "border-box",
};

const miniInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  fontSize: 16,
  marginBottom: 12,
  boxSizing: "border-box",
};

const sectionTitleWeb: React.CSSProperties = {
  fontWeight: 800,
  fontSize: 15,
  color: "#0f172a",
  margin: "16px 0 8px",
};

const labelMini: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 700,
  color: "#334155",
  marginBottom: 6,
  marginTop: 4,
};

function strobaMetersInputProps(
  key: keyof StrobaMetersFields,
  values: StrobaMetersFields,
  onPatch: (p: Patch) => void,
  onMetersFieldChange?: CalculatorStrobaMeterFieldsProps["onMetersFieldChange"]
) {
  const apply = (v: string) =>
    onPatch({ [key]: sanitizeDecimalMetersString(v, MAX_STROBA_METERS) || "0" });
  const bind = bindZeroReplacingNumericInput({
    value: values[key],
    onChange: (v) => {
      if (onMetersFieldChange) {
        onMetersFieldChange(key, v, apply);
      } else {
        apply(v);
      }
    },
    sanitize: (raw) => sanitizeDecimalMetersString(raw, MAX_STROBA_METERS, values[key]) || "0",
    isDecimal: true,
  });
  return { value: values[key], inputMode: "decimal" as const, ...bind };
}

export function CalculatorStrobaMeterFields({
  values,
  onPatch,
  variant,
  fieldErrors,
  fieldWarnings,
  onMetersFieldChange,
}: CalculatorStrobaMeterFieldsProps) {
  const inputStyle = variant === "web" ? webInputStyle : miniInputStyle;

  const fields: {
    key: keyof StrobaMetersFields;
    label: string;
  }[] = [
    { key: "strobaConcreteMeters", label: "Основная штроба, бетон, м" },
    { key: "strobaBrickMeters", label: "Основная штроба, кирпич/газоблок, м" },
    { key: "strobaDrainConcreteMeters", label: "Штроба под дренаж/кабель, бетон, м" },
    { key: "strobaDrainBrickMeters", label: "Штроба под дренаж/кабель, кирпич/газоблок, м" },
  ];

  if (variant === "web") {
    return (
      <>
        <div style={sectionTitleWeb}>Штробы и кабель-каналы</div>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#64748b" }}>{STROBA_MIN_NOTE}</p>
        {fields.map(({ key, label }) => (
          <div key={key} style={{ marginBottom: 4 }}>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: 14 }}>
              {label}
            </label>
            <input
              style={inputStyle}
              {...strobaMetersInputProps(key, values, onPatch, onMetersFieldChange)}
            />
            {fieldErrors?.[key] ? (
              <p style={{ color: "#b91c1c", fontSize: 12, margin: "0 0 8px" }}>{fieldErrors[key]}</p>
            ) : null}
            {fieldWarnings?.[key] ? (
              <p style={{ color: "#b45309", fontSize: 12, margin: "0 0 8px" }}>{fieldWarnings[key]}</p>
            ) : null}
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      <div style={{ fontWeight: 800, fontSize: 15, color: "#0f172a", margin: "16px 0 8px" }}>
        Штробы и кабель-каналы
      </div>
      <p style={{ margin: "0 0 10px", fontSize: 12, color: "#64748b", lineHeight: 1.4 }}>
        {STROBA_MIN_NOTE}
      </p>
      {fields.map(({ key, label }) => (
        <span key={key}>
          <span style={labelMini}>{label}</span>
          <input
            style={inputStyle}
            placeholder="0"
            {...strobaMetersInputProps(key, values, onPatch, onMetersFieldChange)}
          />
        </span>
      ))}
    </>
  );
}
