"use client";

import type React from "react";
import {
  ROUGH_IN_HOLE_ARM_CONCRETE_LABEL,
  ROUGH_IN_HOLE_ARM_CONCRETE_PRICE_RUB,
  ROUGH_IN_HOLE_BRICK_LABEL,
  ROUGH_IN_HOLE_BRICK_PRICE_RUB,
} from "@/lib/calculator/roughInMode";
import { MAX_HOLES, sanitizeNonNegativeIntString } from "@/lib/calculator";

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

const noteWeb: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 400,
  color: "#64748b",
  marginTop: 4,
  marginBottom: 6,
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

export type CalculatorHoleFieldsSectionProps = {
  roughIn: boolean;
  baseWallType: "normal" | "arm";
  extraHolesNormal: string;
  extraHolesArm: string;
  roughInHolesBrick: string;
  roughInHolesArmConcrete: string;
  onPatch: (patch: {
    baseWallType?: "normal" | "arm";
    extraHolesNormal?: string;
    extraHolesArm?: string;
    roughInHolesBrick?: string;
    roughInHolesArmConcrete?: string;
  }) => void;
  variant?: "web" | "miniapp";
  /** Web: обёртка Label */
  renderWebField?: (props: {
    text: string;
    note?: string;
    children: React.ReactNode;
    fieldKey?: string;
    message?: React.ReactNode;
  }) => React.ReactNode;
};

function WebLabel({
  text,
  note,
  children,
  labelStyle,
  noteStyle,
}: {
  text: string;
  note?: string;
  children: React.ReactNode;
  labelStyle: React.CSSProperties;
  noteStyle: React.CSSProperties;
}) {
  return (
    <label style={labelStyle}>
      {text}
      {note ? <span style={noteStyle}>{note}</span> : null}
      {children}
    </label>
  );
}

export function CalculatorHoleFieldsSection({
  roughIn,
  baseWallType,
  extraHolesNormal,
  extraHolesArm,
  roughInHolesBrick,
  roughInHolesArmConcrete,
  onPatch,
  variant = "web",
  renderWebField,
}: CalculatorHoleFieldsSectionProps) {
  const isMini = variant === "miniapp";
  const labelStyle = isMini ? labelMini : labelWeb;
  const inputStyle = isMini ? inputMini : inputWeb;
  const noteStyle = noteWeb;

  const brickNote = `${ROUGH_IN_HOLE_BRICK_PRICE_RUB.toLocaleString("ru-RU")} ₽ за штуку`;
  const armNote = `${ROUGH_IN_HOLE_ARM_CONCRETE_PRICE_RUB.toLocaleString("ru-RU")} ₽ за штуку`;

  if (roughIn) {
    const brickField = (
      <>
        {isMini ? (
          <span style={labelStyle}>{ROUGH_IN_HOLE_BRICK_LABEL}</span>
        ) : null}
        {!isMini && renderWebField ? (
          renderWebField({
            text: ROUGH_IN_HOLE_BRICK_LABEL,
            note: brickNote,
            fieldKey: "roughInHolesBrick",
            children: (
              <input
                value={roughInHolesBrick}
                onChange={(e) =>
                  onPatch({
                    roughInHolesBrick:
                      sanitizeNonNegativeIntString(e.target.value, MAX_HOLES) || "0",
                  })
                }
                style={inputStyle}
                inputMode="numeric"
              />
            ),
          })
        ) : (
          <>
            {isMini ? (
              <p style={{ margin: "0 0 6px", fontSize: 12, color: "#64748b" }}>{brickNote}</p>
            ) : null}
            <input
              style={inputStyle}
              inputMode="numeric"
              value={roughInHolesBrick}
              aria-label={ROUGH_IN_HOLE_BRICK_LABEL}
              onChange={(e) =>
                onPatch({
                  roughInHolesBrick:
                    sanitizeNonNegativeIntString(e.target.value, MAX_HOLES) || "0",
                })
              }
            />
          </>
        )}
      </>
    );

    const armField = (
      <>
        {isMini ? (
          <span style={labelStyle}>{ROUGH_IN_HOLE_ARM_CONCRETE_LABEL}</span>
        ) : null}
        {!isMini && renderWebField ? (
          renderWebField({
            text: ROUGH_IN_HOLE_ARM_CONCRETE_LABEL,
            note: armNote,
            fieldKey: "roughInHolesArmConcrete",
            children: (
              <input
                value={roughInHolesArmConcrete}
                onChange={(e) =>
                  onPatch({
                    roughInHolesArmConcrete:
                      sanitizeNonNegativeIntString(e.target.value, MAX_HOLES) || "0",
                  })
                }
                style={inputStyle}
                inputMode="numeric"
              />
            ),
          })
        ) : (
          <>
            {isMini ? (
              <p style={{ margin: "0 0 6px", fontSize: 12, color: "#64748b" }}>{armNote}</p>
            ) : null}
            <input
              style={inputStyle}
              inputMode="numeric"
              value={roughInHolesArmConcrete}
              aria-label={ROUGH_IN_HOLE_ARM_CONCRETE_LABEL}
              onChange={(e) =>
                onPatch({
                  roughInHolesArmConcrete:
                    sanitizeNonNegativeIntString(e.target.value, MAX_HOLES) || "0",
                })
              }
            />
          </>
        )}
      </>
    );

    if (isMini) {
      return (
        <>
          {brickField}
          {armField}
        </>
      );
    }

    if (renderWebField) {
      return (
        <>
          {brickField}
          {armField}
        </>
      );
    }

    return (
      <>
        <WebLabel text={ROUGH_IN_HOLE_BRICK_LABEL} note={brickNote} labelStyle={labelStyle} noteStyle={noteStyle}>
          <input
            value={roughInHolesBrick}
            onChange={(e) =>
              onPatch({
                roughInHolesBrick:
                  sanitizeNonNegativeIntString(e.target.value, MAX_HOLES) || "0",
              })
            }
            style={inputStyle}
            inputMode="numeric"
          />
        </WebLabel>
        <WebLabel
          text={ROUGH_IN_HOLE_ARM_CONCRETE_LABEL}
          note={armNote}
          labelStyle={labelStyle}
          noteStyle={noteStyle}
        >
          <input
            value={roughInHolesArmConcrete}
            onChange={(e) =>
              onPatch({
                roughInHolesArmConcrete:
                  sanitizeNonNegativeIntString(e.target.value, MAX_HOLES) || "0",
              })
            }
            style={inputStyle}
            inputMode="numeric"
          />
        </WebLabel>
      </>
    );
  }

  const mountMain = isMini ? (
    <>
      <span style={labelStyle}>Основное отверстие</span>
      <select
        style={inputStyle}
        value={baseWallType}
        onChange={(e) => onPatch({ baseWallType: e.target.value as "normal" | "arm" })}
      >
        <option value="normal">Кирпич / газобетон / неарм. бетон</option>
        <option value="arm">Армированный бетон</option>
      </select>
    </>
  ) : renderWebField ? (
    renderWebField({
      text: "Материал основного отверстия",
      note: "Влияет на доплату за армированный бетон в итоге",
      children: (
        <select
          value={baseWallType}
          onChange={(e) => onPatch({ baseWallType: e.target.value as "normal" | "arm" })}
          style={inputStyle}
        >
          <option value="normal">Кирпич / газобетон / неармированный бетон</option>
          <option value="arm">Армированный бетон</option>
        </select>
      ),
    })
  ) : (
    <WebLabel
      text="Материал основного отверстия"
      note="Влияет на доплату за армированный бетон в итоге"
      labelStyle={labelStyle}
      noteStyle={noteStyle}
    >
      <select
        value={baseWallType}
        onChange={(e) => onPatch({ baseWallType: e.target.value as "normal" | "arm" })}
        style={inputStyle}
      >
        <option value="normal">Кирпич / газобетон / неармированный бетон</option>
        <option value="arm">Армированный бетон</option>
      </select>
    </WebLabel>
  );

  const extraNormal = isMini ? (
    <>
      <span style={labelStyle}>Доп. отверстия обычные</span>
      <input
        style={inputStyle}
        inputMode="numeric"
        value={extraHolesNormal}
        onChange={(e) =>
          onPatch({
            extraHolesNormal: sanitizeNonNegativeIntString(e.target.value, MAX_HOLES) || "0",
          })
        }
      />
    </>
  ) : renderWebField ? (
    renderWebField({
      text: "Доп. отверстия обычные, шт.",
      note: "Количество дополнительных отверстий",
      fieldKey: "extraHolesNormal",
      children: (
        <input
          value={extraHolesNormal}
          onChange={(e) =>
            onPatch({
              extraHolesNormal: sanitizeNonNegativeIntString(e.target.value, MAX_HOLES) || "0",
            })
          }
          style={inputStyle}
          inputMode="numeric"
        />
      ),
    })
  ) : null;

  const extraArm = isMini ? (
    <>
      <span style={labelStyle}>Доп. отверстия арм. бетон</span>
      <input
        style={inputStyle}
        inputMode="numeric"
        value={extraHolesArm}
        onChange={(e) =>
          onPatch({
            extraHolesArm: sanitizeNonNegativeIntString(e.target.value, MAX_HOLES) || "0",
          })
        }
      />
    </>
  ) : renderWebField ? (
    renderWebField({
      text: "Доп. отверстия армированные, шт.",
      note: "Количество отверстий в армированном бетоне",
      fieldKey: "extraHolesArm",
      children: (
        <input
          value={extraHolesArm}
          onChange={(e) =>
            onPatch({
              extraHolesArm: sanitizeNonNegativeIntString(e.target.value, MAX_HOLES) || "0",
            })
          }
          style={inputStyle}
          inputMode="numeric"
        />
      ),
    })
  ) : null;

  return (
    <>
      {mountMain}
      {extraNormal}
      {extraArm}
    </>
  );
}
