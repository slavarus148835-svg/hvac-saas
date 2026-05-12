"use client";

import type React from "react";
import { memo, useCallback, useState } from "react";
import type { CalculatorRoomDraft, SelectedExtraServiceMap } from "@/lib/calculator";
import {
  formatCapacityBtu,
  formatRubles,
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
import {
  newQuickExtraId,
  type QuickCalculationExtra,
  type UserCustomService,
} from "@/lib/customServices";
import { tgHapticButtonTap } from "@/lib/telegramHaptic";

const BTU_OPTS = ["7", "9", "12", "18", "24", "30", "36"] as const;

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  marginBottom: 12,
  fontSize: 14,
  lineHeight: 1.5,
  color: "#334155",
  overflow: "hidden",
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 6,
  color: "#475569",
  lineHeight: 1.35,
  wordBreak: "break-word",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  fontSize: 16,
  marginBottom: 12,
  boxSizing: "border-box",
};

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginBottom: 10,
};

const chk: React.CSSProperties = { width: 22, height: 22 };

const btn: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "center",
  padding: "12px 14px",
  borderRadius: 12,
  border: "none",
  background: "#0f172a",
  color: "#fff",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
  boxSizing: "border-box",
};

const btnSecondary: React.CSSProperties = {
  ...btn,
  background: "#ffffff",
  color: "#0f172a",
  border: "2px solid #e2e8f0",
  marginTop: 8,
};

export type TgCalculatorRoomCardProps = {
  draft: CalculatorRoomDraft;
  expanded: boolean;
  roomSubtotal: number;
  collapsedModelLine: string;
  models: { id: string; name: string; price: number }[];
  customServices: UserCustomService[];
  giftRouteMeters: number;
  canRemove: boolean;
  modelPick: string;
  onModelPickChange: (v: string) => void;
  onAddPickedModel: () => void;
  onRemoveModelFromRoom: (modelId: string) => void;
  onToggle: () => void;
  onPatch: (patch: Partial<CalculatorRoomDraft>) => void;
  onDuplicate: () => void;
  onRemoveRoom: () => void;
};

function TgCalculatorRoomCardInner(props: TgCalculatorRoomCardProps) {
  const {
    draft,
    expanded,
    roomSubtotal,
    collapsedModelLine,
    models,
    customServices,
    giftRouteMeters,
    canRemove,
    modelPick,
    onModelPickChange,
    onAddPickedModel,
    onRemoveModelFromRoom,
    onToggle,
    onPatch,
    onDuplicate,
    onRemoveRoom,
  } = props;

  const [qName, setQName] = useState("");
  const [qPrice, setQPrice] = useState("");

  function addQuick() {
    tgHapticButtonTap();
    const name = qName.trim();
    const price = Math.max(0, Math.floor(Number(qPrice.replace(/\D/g, "") || 0)));
    if (!name || !price) return;
    onPatch({
      quickCalculationExtras: [
        ...draft.quickCalculationExtras,
        { id: newQuickExtraId(), name, price: Math.min(MAX_MONEY, price) },
      ],
    });
    setQName("");
    setQPrice("");
  }

  return (
    <div style={card}>
      <button
        type="button"
        onClick={() => {
          tgHapticButtonTap();
          onToggle();
        }}
        style={{
          width: "100%",
          border: "none",
          background: expanded ? "#f1f5f9" : "#fff",
          padding: "14px 16px",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 16, color: "#0f172a", marginBottom: 4 }}>
          {draft.roomName.trim() || "Комната"}
        </div>
        {!expanded ? (
          <>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 6 }}>{collapsedModelLine}</div>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#0f172a" }}>
              Итог: {formatRubles(roomSubtotal)}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: "#64748b" }}>Нажмите, чтобы свернуть</div>
        )}
      </button>

      {expanded ? (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid #e2e8f0" }}>
          <span style={{ ...label, marginTop: 14 }}>Название комнаты</span>
          <input
            style={input}
            value={draft.roomName}
            onChange={(e) => onPatch({ roomName: e.target.value })}
            placeholder="Например: Зал"
          />

          <span style={label}>Модель кондиционера</span>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <select
              style={{ ...input, flex: 1, marginBottom: 0 }}
              value={modelPick}
              onChange={(e) => onModelPickChange(e.target.value)}
              disabled={models.length === 0}
            >
              <option value="">Выберите</option>
              {models.map((m) => (
                <option key={m.id} value={m.id} disabled={draft.selectedAcModelIds.includes(m.id)}>
                  {m.name} — {formatRubles(m.price)}
                </option>
              ))}
            </select>
            <button
              type="button"
              style={{ ...btn, width: "auto", padding: "12px 16px", marginBottom: 0 }}
              onClick={() => {
                tgHapticButtonTap();
                onAddPickedModel();
              }}
              disabled={!modelPick}
            >
              +
            </button>
          </div>
          {draft.selectedAcModelIds.length > 0 ? (
            <div style={{ marginBottom: 12 }}>
              {draft.selectedAcModelIds.map((id) => {
                const m = models.find((x) => x.id === id);
                if (!m) return null;
                return (
                  <div
                    key={id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ fontSize: 14 }}>
                      {m.name} — {formatRubles(m.price)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        tgHapticButtonTap();
                        onRemoveModelFromRoom(id);
                      }}
                      style={{
                        background: "#fee2e2",
                        color: "#991b1b",
                        border: "none",
                        borderRadius: 8,
                        padding: "8px 12px",
                        fontWeight: 600,
                      }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}

          <span style={label}>Мощность BTU</span>
          <select
            style={input}
            value={draft.capacity}
            onChange={(e) => onPatch({ capacity: e.target.value })}
          >
            {BTU_OPTS.map((v) => (
              <option key={v} value={v}>
                {formatCapacityBtu(v)}
              </option>
            ))}
          </select>

          <span style={label}>Тип монтажа</span>
          <select
            style={input}
            value={draft.mountType}
            onChange={(e) => onPatch({ mountType: e.target.value as "standard" | "existing" })}
          >
            <option value="standard">На нашу трассу</option>
            <option value="existing">На чужую трассу</option>
          </select>

          <span style={label}>Трасса, м, мин. 1 м (в подарок {giftRouteMeters} м)</span>
          <input
            style={input}
            inputMode="decimal"
            value={draft.routeMeters}
            onChange={(e) =>
              onPatch({
                routeMeters: sanitizeDecimalMetersString(e.target.value, MAX_ROUTE_METERS),
              })
            }
          />

          <span style={label}>Основное отверстие</span>
          <select
            style={input}
            value={draft.baseWallType}
            onChange={(e) => onPatch({ baseWallType: e.target.value as "normal" | "arm" })}
          >
            <option value="normal">Кирпич / газобетон / неарм. бетон</option>
            <option value="arm">Армированный бетон</option>
          </select>

          <span style={label}>Доп. отверстия обычные</span>
          <input
            style={input}
            inputMode="numeric"
            value={draft.extraHolesNormal}
            onChange={(e) =>
              onPatch({
                extraHolesNormal: sanitizeNonNegativeIntString(e.target.value, MAX_HOLES) || "0",
              })
            }
          />

          <span style={label}>Доп. отверстия арм. бетон</span>
          <input
            style={input}
            inputMode="numeric"
            value={draft.extraHolesArm}
            onChange={(e) =>
              onPatch({
                extraHolesArm: sanitizeNonNegativeIntString(e.target.value, MAX_HOLES) || "0",
              })
            }
          />

          <span style={label}>Штроба, м, мин. 1 м</span>
          <select
            style={input}
            value={draft.strobaType}
            onChange={(e) =>
              onPatch({ strobaType: e.target.value as "none" | "brick" | "concrete" })
            }
          >
            <option value="none">Нет</option>
            <option value="brick">Кирпич</option>
            <option value="concrete">Бетон</option>
          </select>
          <input
            style={input}
            inputMode="decimal"
            placeholder="Метры штробления"
            value={draft.strobaMeters}
            onChange={(e) =>
              onPatch({
                strobaMeters: sanitizeDecimalMetersString(e.target.value, MAX_STROBA_METERS),
              })
            }
          />

          <span style={label}>Кабель-канал 40×40, м, мин. 1 м</span>
          <input
            style={input}
            inputMode="decimal"
            value={draft.cable40Meters}
            onChange={(e) =>
              onPatch({
                cable40Meters: sanitizeDecimalMetersString(e.target.value, MAX_CABLE_METERS),
              })
            }
          />

          <span style={label}>Кабель-канал 16×16, м, мин. 1 м</span>
          <input
            style={input}
            inputMode="decimal"
            value={draft.cable16Meters}
            onChange={(e) =>
              onPatch({
                cable16Meters: sanitizeDecimalMetersString(e.target.value, MAX_CABLE_METERS),
              })
            }
          />

          <span style={label}>Подъём инструмента (начиная с 3 этажа)</span>
          <input
            style={input}
            inputMode="numeric"
            value={draft.carryToolFloors}
            onChange={(e) =>
              onPatch({
                carryToolFloors: sanitizeNonNegativeIntString(e.target.value, MAX_FLOORS) || "0",
              })
            }
          />

          <span style={label}>Демонтаж вручную, ₽</span>
          <input
            style={input}
            inputMode="numeric"
            value={draft.manualDismantlingCost}
            onChange={(e) =>
              onPatch({
                manualDismantlingCost:
                  sanitizeNonNegativeMoneyString(e.target.value, MAX_MONEY) || "0",
              })
            }
          />

          {(
            [
              [
                "Подъём кондиционера на плече по лестнице",
                Number(draft.carryBlockCount || 0) > 0,
                (v: boolean) => onPatch({ carryBlockCount: v ? "1" : "0" }),
              ],
              ["Кронштейны", draft.includeBrackets, (v: boolean) => onPatch({ includeBrackets: v })],
              ["Демонтаж и монтаж стеклопакета", draft.includeGlass, (v: boolean) => onPatch({ includeGlass: v })],
              [
                "Демонтаж, резка и монтаж фасадной плитки",
                draft.includeTile,
                (v: boolean) => onPatch({ includeTile: v }),
              ],
              ["Монтаж дренажа в водосток", draft.includeDrain, (v: boolean) => onPatch({ includeDrain: v })],
              [
                "Установка и подключение дренажной помпы",
                draft.includePump,
                (v: boolean) => onPatch({ includePump: v }),
              ],
              [
                "Подключение внешнего блока на лестнице",
                draft.includeLadderConnection,
                (v: boolean) => onPatch({ includeLadderConnection: v }),
              ],
            ] as const
          ).map(([t, v, set]) => (
            <label key={t} style={row}>
              <input type="checkbox" style={chk} checked={v} onChange={(e) => set(e.target.checked)} />
              <span>{t}</span>
            </label>
          ))}

          <label style={row}>
            <input
              type="checkbox"
              style={chk}
              checked={draft.buyAcAndRouteFromUs}
              onChange={(e) => onPatch({ buyAcAndRouteFromUs: e.target.checked })}
            />
            <span>Скидка при покупке кондиционера и трассы у нас (−1000 ₽)</span>
          </label>

          {customServices.length > 0 ? (
            <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: 12 }}>
              <span style={label}>Услуги из прайса</span>
              {customServices.map((s) => {
                const st = draft.selectedExtraServices[s.id] ?? { checked: false, qty: "1" };
                return (
                  <div key={s.id} style={{ marginBottom: 10 }}>
                    <label style={row}>
                      <input
                        type="checkbox"
                        style={chk}
                        checked={st.checked}
                        onChange={(e) => {
                          const next: SelectedExtraServiceMap = {
                            ...draft.selectedExtraServices,
                            [s.id]: { ...st, checked: e.target.checked, qty: st.qty || "1" },
                          };
                          onPatch({ selectedExtraServices: next });
                        }}
                      />
                      <span>
                        {s.name} ({formatRubles(s.price)})
                      </span>
                    </label>
                    {st.checked ? (
                      <input
                        style={{ ...input, marginBottom: 0 }}
                        inputMode="numeric"
                        placeholder="Кол-во"
                        value={st.qty}
                        onChange={(e) => {
                          const qty = sanitizeNonNegativeIntString(e.target.value, 999) || "1";
                          onPatch({
                            selectedExtraServices: {
                              ...draft.selectedExtraServices,
                              [s.id]: { ...st, checked: true, qty },
                            },
                          });
                        }}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          <span style={label}>Быстрая услуга</span>
          <input
            style={input}
            placeholder="Название"
            value={qName}
            onChange={(e) => setQName(e.target.value)}
          />
          <input
            style={input}
            placeholder="Цена, ₽"
            inputMode="numeric"
            value={qPrice}
            onChange={(e) =>
              setQPrice(sanitizeNonNegativeMoneyString(e.target.value, MAX_MONEY))
            }
          />
          <button type="button" style={btnSecondary} onClick={addQuick}>
            Добавить услугу
          </button>
          {draft.quickCalculationExtras.length > 0 ? (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {draft.quickCalculationExtras.map((line: QuickCalculationExtra) => (
                <div
                  key={line.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "10px 12px",
                    background: "#f8fafc",
                    borderRadius: 10,
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{line.name}</div>
                    <div style={{ fontSize: 13, color: "#64748b" }}>{formatRubles(line.price)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      tgHapticButtonTap();
                      onPatch({
                        quickCalculationExtras: draft.quickCalculationExtras.filter(
                          (x) => x.id !== line.id
                        ),
                      });
                    }}
                    style={{
                      background: "#fee2e2",
                      color: "#991b1b",
                      border: "none",
                      borderRadius: 8,
                      padding: "8px 12px",
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                  >
                    Убрать
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTop: "1px solid #e2e8f0",
              fontWeight: 800,
              fontSize: 16,
              color: "#0f172a",
            }}
          >
            Итого по комнате: {formatRubles(roomSubtotal)}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              type="button"
              style={{ ...btnSecondary, flex: 1, marginTop: 0 }}
              onClick={() => {
                tgHapticButtonTap();
                onDuplicate();
              }}
            >
              Дублировать комнату
            </button>
            <button
              type="button"
              style={{
                ...btnSecondary,
                flex: 1,
                marginTop: 0,
                color: "#991b1b",
                borderColor: "#fecaca",
                opacity: canRemove ? 1 : 0.45,
              }}
              disabled={!canRemove}
              onClick={() => {
                tgHapticButtonTap();
                onRemoveRoom();
              }}
            >
              Удалить
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export const TgCalculatorRoomCard = memo(TgCalculatorRoomCardInner);

export type TgCalculatorRoomCardBoundProps = Omit<TgCalculatorRoomCardProps, "onPatch"> & {
  onPatchRoom: (roomId: string, patch: Partial<CalculatorRoomDraft>) => void;
};

/** Стабильный onPatch для memo: не меняется между ререндерами других комнат. */
export const TgCalculatorRoomCardBound = memo(function TgCalculatorRoomCardBound(
  props: TgCalculatorRoomCardBoundProps
) {
  const { onPatchRoom, draft, ...rest } = props;
  const onPatch = useCallback(
    (patch: Partial<CalculatorRoomDraft>) => onPatchRoom(draft.id, patch),
    [draft.id, onPatchRoom]
  );
  return <TgCalculatorRoomCard draft={draft} onPatch={onPatch} {...rest} />;
});
