"use client";

import type React from "react";
import { useState } from "react";
import {
  newQuickExtraId,
  type UserCustomService,
} from "@/lib/customServices";
import type { CalculatorRoomDraft } from "@/lib/calculator/roomDraft";
import {
  formatCapacityBtu,
  MAX_CABLE_METERS,
  MAX_FLOORS,
  MAX_HOLES,
  MAX_MONEY,
  MAX_ROUTE_METERS,
  MAX_STROBA_METERS,
  sanitizeDecimalMetersString,
  sanitizeNonNegativeIntString,
  sanitizeNonNegativeMoneyString,
} from "@/lib/calculator";
import type { SelectedExtraServiceMap } from "@/lib/calculator/types";

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: 22,
  padding: 20,
  border: "1px solid #e5e7eb",
  boxShadow:
    "0 1px 2px rgba(15, 23, 42, 0.05), 0 4px 18px rgba(15, 23, 42, 0.06)",
  marginBottom: 20,
  boxSizing: "border-box",
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: "16px",
  fontSize: "18px",
  fontWeight: 800,
  color: "#0f172a",
  letterSpacing: "-0.02em",
};

const fieldLabelStyle: React.CSSProperties = {
  marginBottom: "8px",
  fontWeight: 700,
  fontSize: "15px",
  color: "#334155",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 48,
  padding: "14px 16px",
  borderRadius: 14,
  border: "1px solid #d1d5db",
  fontSize: 16,
  background: "#ffffff",
  boxSizing: "border-box",
  color: "#0f172a",
};

const smallTextStyle: React.CSSProperties = {
  marginTop: "8px",
  fontSize: "13px",
  color: "#64748b",
  lineHeight: 1.45,
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 14,
  border: "none",
  background: "#0f172a",
  color: "#ffffff",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  background: "#ffffff",
  color: "#0f172a",
  border: "2px solid #e5e7eb",
};

const deleteButtonStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "none",
  background: "#fee2e2",
  color: "#991b1b",
  fontWeight: 700,
  cursor: "pointer",
};

const checkboxRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "10px",
  marginBottom: "12px",
  fontSize: "15px",
  color: "#334155",
  lineHeight: 1.45,
};

const modelPickerRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: "10px",
  alignItems: "center",
};

const selectedModelsListStyle: React.CSSProperties = {
  marginTop: "12px",
  display: "flex",
  flexDirection: "column",
  gap: "10px",
};

const selectedModelRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  background: "#f8fafc",
};

const serviceRowStyle: React.CSSProperties = {
  display: "grid",
  gap: "12px",
  padding: "14px 0",
  borderTop: "1px solid #eef1f4",
};

const serviceHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "baseline",
};

const serviceControlsStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "12px",
  alignItems: "center",
};

const checkboxWrapStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  fontWeight: 600,
  fontSize: "14px",
  color: "#334155",
};

const qtyInputStyle: React.CSSProperties = {
  ...inputStyle,
  maxWidth: 120,
  minHeight: 44,
  marginBottom: 0,
};

const quickAddGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: "12px",
  alignItems: "start",
};

const quickExtraRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "center",
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  background: "#f8fafc",
};

function Label({
  text,
  note,
  children,
}: {
  text: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={fieldLabelStyle}>{text}</div>
      {children}
      {note ? <div style={smallTextStyle}>{note}</div> : null}
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label style={checkboxRowStyle}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export type RoomFormBlockProps = {
  draft: CalculatorRoomDraft;
  roomIndex: number;
  totalRooms: number;
  acModels: { id: string; name: string; price: number }[];
  giftRouteMeters: number;
  pricelistCustomServices: UserCustomService[];
  fmt: (n: number) => string;
  onPatch: (patch: Partial<CalculatorRoomDraft>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
};

export function RoomFormBlock({
  draft,
  roomIndex,
  totalRooms,
  acModels,
  giftRouteMeters,
  pricelistCustomServices,
  fmt,
  onPatch,
  onRemove,
  onDuplicate,
}: RoomFormBlockProps) {
  const [modelPick, setModelPick] = useState("");
  const [quickName, setQuickName] = useState("");
  const [quickPrice, setQuickPrice] = useState("");

  function addSelectedModelToCalculation() {
    if (!modelPick || draft.selectedAcModelIds.includes(modelPick)) return;
    onPatch({ selectedAcModelIds: [...draft.selectedAcModelIds, modelPick] });
    setModelPick("");
  }

  function removeSelectedModelFromCalculation(id: string) {
    onPatch({ selectedAcModelIds: draft.selectedAcModelIds.filter((x) => x !== id) });
  }

  function handleQuickAdd() {
    const name = quickName.trim();
    const price = Math.max(0, Math.floor(Number(quickPrice.replace(/\D/g, "") || 0)));
    if (!name || !price) return;
    const capped = Math.min(MAX_MONEY, price);
    onPatch({
      quickCalculationExtras: [
        ...draft.quickCalculationExtras,
        { id: newQuickExtraId(), name, price: capped },
      ],
    });
    setQuickName("");
    setQuickPrice("");
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <h2 style={{ ...sectionTitle, flex: "1 1 200px", marginBottom: 0 }}>
          Комната {roomIndex + 1}
        </h2>
        <button type="button" style={secondaryButtonStyle} onClick={onDuplicate}>
          Дублировать комнату
        </button>
        <button
          type="button"
          style={deleteButtonStyle}
          onClick={onRemove}
          disabled={totalRooms <= 1}
        >
          Удалить
        </button>
      </div>

      <Label text="Название комнаты" note="Будет в тексте для клиента">
        <input
          value={draft.roomName}
          onChange={(e) => onPatch({ roomName: e.target.value })}
          placeholder="Например: Зал"
          style={inputStyle}
        />
      </Label>

      {acModels.length > 0 ? (
        <div style={{ marginBottom: 16 }}>
          <Label text="Модель кондиционера" note="Сначала выберите модель из прайса">
            <div className="calc-model-row" style={modelPickerRowStyle}>
              <select
                value={modelPick}
                onChange={(e) => setModelPick(e.target.value)}
                style={{ ...inputStyle, marginBottom: 0 }}
              >
                <option value="">Выберите модель</option>
                {acModels.map((m) => (
                  <option key={m.id} value={m.id} disabled={draft.selectedAcModelIds.includes(m.id)}>
                    {m.name} — {fmt(m.price)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addSelectedModelToCalculation}
                disabled={!modelPick}
                style={{ ...primaryButtonStyle, minWidth: 140 }}
              >
                В смету
              </button>
            </div>
          </Label>
          {draft.selectedAcModelIds.length > 0 ? (
            <div style={selectedModelsListStyle}>
              {draft.selectedAcModelIds.map((id) => {
                const model = acModels.find((m) => m.id === id);
                if (!model) return null;
                return (
                  <div key={id} style={selectedModelRowStyle}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{model.name}</div>
                      <div style={smallTextStyle}>{fmt(model.price)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeSelectedModelFromCalculation(id)}
                      style={{ ...deleteButtonStyle, width: "auto", minWidth: 110 }}
                    >
                      Удалить
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      <Label text="Мощность BTU" note="Если модель не выбрана — цена монтажа по типоразмеру">
        <select
          value={draft.capacity}
          onChange={(e) => onPatch({ capacity: e.target.value })}
          style={inputStyle}
        >
          {(["7", "9", "12", "18", "24", "30", "36"] as const).map((v) => (
            <option key={v} value={v}>
              {formatCapacityBtu(v)}
            </option>
          ))}
        </select>
      </Label>

      <Label text="Тип монтажа" note="На нашу трассу или на чужую трассу">
        <select
          value={draft.mountType}
          onChange={(e) => onPatch({ mountType: e.target.value as "standard" | "existing" })}
          style={inputStyle}
        >
          <option value="standard">На нашу трассу</option>
          <option value="existing">На чужую трассу</option>
        </select>
      </Label>

      <Label
        text="Трасса, м"
        note={`Доли метра. (0;1) м → 1 м к оплате. Подарок: ${giftRouteMeters} м из прайса`}
      >
        <input
          value={draft.routeMeters}
          onChange={(e) =>
            onPatch({ routeMeters: sanitizeDecimalMetersString(e.target.value, MAX_ROUTE_METERS) })
          }
          style={inputStyle}
          inputMode="decimal"
        />
      </Label>

      <Label text="Материал основного отверстия">
        <select
          value={draft.baseWallType}
          onChange={(e) => onPatch({ baseWallType: e.target.value as "normal" | "arm" })}
          style={inputStyle}
        >
          <option value="normal">Кирпич / газобетон / неармированный бетон</option>
          <option value="arm">Армированный бетон</option>
        </select>
      </Label>

      <Label text="Доп. отверстия обычные, шт.">
        <input
          value={draft.extraHolesNormal}
          onChange={(e) =>
            onPatch({
              extraHolesNormal: sanitizeNonNegativeIntString(e.target.value, MAX_HOLES) || "0",
            })
          }
          style={inputStyle}
          inputMode="numeric"
        />
      </Label>

      <Label text="Доп. отверстия армированные, шт.">
        <input
          value={draft.extraHolesArm}
          onChange={(e) =>
            onPatch({ extraHolesArm: sanitizeNonNegativeIntString(e.target.value, MAX_HOLES) || "0" })
          }
          style={inputStyle}
          inputMode="numeric"
        />
      </Label>

      <div style={{ fontWeight: 800, fontSize: 15, color: "#0f172a", margin: "16px 0 8px" }}>
        Штроба и кабель-каналы
      </div>

      <Label text="Штробление">
        <select
          value={draft.strobaType}
          onChange={(e) =>
            onPatch({ strobaType: e.target.value as "none" | "brick" | "concrete" })
          }
          style={inputStyle}
        >
          <option value="none">Без штробы</option>
          <option value="brick">Кирпич / газоблок / газобетон</option>
          <option value="concrete">Бетон</option>
        </select>
      </Label>

      <Label text="Штроба, м">
        <input
          value={draft.strobaMeters}
          onChange={(e) =>
            onPatch({
              strobaMeters: sanitizeDecimalMetersString(e.target.value, MAX_STROBA_METERS),
            })
          }
          style={inputStyle}
          inputMode="decimal"
        />
      </Label>

      <Label text="Кабель-канал 40×40, м">
        <input
          value={draft.cable40Meters}
          onChange={(e) =>
            onPatch({
              cable40Meters: sanitizeDecimalMetersString(e.target.value, MAX_CABLE_METERS),
            })
          }
          style={inputStyle}
          inputMode="decimal"
        />
      </Label>

      <Label text="Кабель-канал 16×16, м">
        <input
          value={draft.cable16Meters}
          onChange={(e) =>
            onPatch({
              cable16Meters: sanitizeDecimalMetersString(e.target.value, MAX_CABLE_METERS),
            })
          }
          style={inputStyle}
          inputMode="decimal"
        />
      </Label>

      <Check label="Резка фасадной плитки" checked={draft.includeTile} onChange={(v) => onPatch({ includeTile: v })} />
      <Check label="Дренаж в водосток" checked={draft.includeDrain} onChange={(v) => onPatch({ includeDrain: v })} />
      <Check label="Монтаж дренажной помпы" checked={draft.includePump} onChange={(v) => onPatch({ includePump: v })} />
      <Check
        label="Подключение внешнего блока на лестнице"
        checked={draft.includeLadderConnection}
        onChange={(v) => onPatch({ includeLadderConnection: v })}
      />
      <Check label="Кронштейны и крепежи" checked={draft.includeBrackets} onChange={(v) => onPatch({ includeBrackets: v })} />
      <Check label="Стеклопакет (работы)" checked={draft.includeGlass} onChange={(v) => onPatch({ includeGlass: v })} />

      <div style={{ fontWeight: 800, fontSize: 15, color: "#0f172a", margin: "16px 0 8px" }}>Подъём и демонтаж</div>

      <Label text="Подъём инструмента (начиная с 3 этажа)">
        <input
          value={draft.carryToolFloors}
          onChange={(e) =>
            onPatch({
              carryToolFloors: sanitizeNonNegativeIntString(e.target.value, MAX_FLOORS) || "0",
            })
          }
          style={inputStyle}
          inputMode="numeric"
        />
      </Label>

      <Check
        label="Подъём внешнего блока на плече по лестнице"
        checked={Number(draft.carryBlockCount || 0) > 0}
        onChange={(v) => onPatch({ carryBlockCount: v ? "1" : "0" })}
      />

      <Label text="Демонтаж, ₽">
        <input
          value={draft.manualDismantlingCost}
          onChange={(e) =>
            onPatch({
              manualDismantlingCost: sanitizeNonNegativeMoneyString(e.target.value, MAX_MONEY) || "0",
            })
          }
          style={inputStyle}
          inputMode="numeric"
        />
      </Label>

      <Check
        label="Клиент покупает кондиционер и трассу у вас (1000 ₽)"
        checked={draft.buyAcAndRouteFromUs}
        onChange={(v) => onPatch({ buyAcAndRouteFromUs: v })}
      />

      <h3 style={{ ...sectionTitle, fontSize: 17, marginTop: 24 }}>Свои услуги из прайса</h3>
      {pricelistCustomServices.length === 0 ? (
        <p style={{ margin: 0 }}>В прайсе пока нет своих услуг.</p>
      ) : (
        pricelistCustomServices.map((service) => {
          const state = draft.selectedExtraServices[service.id] || { checked: false, qty: "1" };
          return (
            <div key={service.id} style={serviceRowStyle}>
              <div style={serviceHeaderStyle}>
                <div style={{ fontWeight: 700, wordBreak: "break-word" }}>{service.name}</div>
                <div style={smallTextStyle}>{fmt(service.price)} за ед.</div>
              </div>
              <div style={serviceControlsStyle}>
                <label style={checkboxWrapStyle}>
                  <input
                    type="checkbox"
                    checked={state.checked}
                    onChange={(e) => {
                      const next: SelectedExtraServiceMap = {
                        ...draft.selectedExtraServices,
                        [service.id]: {
                          ...state,
                          checked: e.target.checked,
                          qty: state.qty || "1",
                        },
                      };
                      onPatch({ selectedExtraServices: next });
                    }}
                  />
                  <span>В расчёт</span>
                </label>
                {state.checked ? (
                  <input
                    value={state.qty}
                    onChange={(e) => {
                      const qty = sanitizeNonNegativeIntString(e.target.value, 999) || "1";
                      onPatch({
                        selectedExtraServices: {
                          ...draft.selectedExtraServices,
                          [service.id]: { ...state, checked: true, qty },
                        },
                      });
                    }}
                    style={qtyInputStyle}
                    inputMode="numeric"
                  />
                ) : null}
              </div>
            </div>
          );
        })
      )}

      <h3 style={{ ...sectionTitle, fontSize: 17, marginTop: 24 }}>Быстрые услуги</h3>
      <div style={quickAddGridStyle}>
        <input
          value={quickName}
          onChange={(e) => setQuickName(e.target.value)}
          placeholder="Название услуги"
          style={inputStyle}
        />
        <input
          value={quickPrice}
          onChange={(e) =>
            setQuickPrice(sanitizeNonNegativeMoneyString(e.target.value, MAX_MONEY))
          }
          placeholder="Цена, ₽"
          style={inputStyle}
          inputMode="numeric"
        />
        <button type="button" onClick={handleQuickAdd} style={secondaryButtonStyle}>
          Добавить в расчёт
        </button>
      </div>
      {draft.quickCalculationExtras.length > 0 ? (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          {draft.quickCalculationExtras.map((line) => (
            <div key={line.id} style={quickExtraRowStyle}>
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <div style={{ fontWeight: 600, wordBreak: "break-word", color: "#0f172a" }}>{line.name}</div>
                <div style={smallTextStyle}>{fmt(line.price)}</div>
              </div>
              <button
                type="button"
                onClick={() =>
                  onPatch({
                    quickCalculationExtras: draft.quickCalculationExtras.filter((x) => x.id !== line.id),
                  })
                }
                style={deleteButtonStyle}
              >
                Убрать
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
