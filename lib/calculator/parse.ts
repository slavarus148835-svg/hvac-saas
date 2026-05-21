import {
  MAX_BLOCKS,
  MAX_CABLE_METERS,
  MAX_FLOORS,
  MAX_HOLES,
  MAX_MONEY,
  MAX_STROBA_METERS,
} from "./constants";
import type {
  CalculatorComputeInput,
  SelectedExtraServiceMap,
} from "./types";
import {
  CALCULATOR_BTU_ONLY_OPTIONS,
  CALCULATOR_ROUGH_IN_CAPACITY,
  effectiveSelectedAcModelIds,
  isCalculatorRoughInCapacity,
  normalizeRoughInRouteCapacity,
} from "./roughInMode";

export function sanitizeNonNegativeIntString(raw: string, max: number) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  const n = Number(digits);
  if (!Number.isFinite(n)) return "";
  return String(Math.min(Math.max(0, Math.trunc(n)), max));
}

export function sanitizeNonNegativeMoneyString(raw: string, max: number) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  const n = Number(digits);
  if (!Number.isFinite(n)) return "";
  return String(Math.min(Math.max(0, Math.trunc(n)), max));
}

/** Парсинг метража (трасса, штроба): цифры и одна точка/запятая, верхняя граница max. */
export function parseDecimalMetersInput(raw: string, max: number): number {
  const t = String(raw ?? "")
    .trim()
    .replace(",", ".")
    .replace(/[^\d.]/g, "");
  if (!t || t === ".") return 0;
  const firstDot = t.indexOf(".");
  const cleaned =
    firstDot === -1 ? t : t.slice(0, firstDot + 1) + t.slice(firstDot + 1).replace(/\./g, "");
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}

export function sanitizeDecimalMetersString(raw: string, max: number): string {
  const t = String(raw ?? "")
    .trim()
    .replace(",", ".")
    .replace(/[^\d.]/g, "");
  if (!t) return "";
  const firstDot = t.indexOf(".");
  const cleaned =
    firstDot === -1 ? t : t.slice(0, firstDot + 1) + t.slice(firstDot + 1).replace(/\./g, "");
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return cleaned === "." ? "0." : cleaned;
  if (n > max) return String(max);
  return cleaned;
}

/**
 * Метры (трасса, штроба) в расчёт: 0 → 0; (0,1) → 1; ≥ 1 → фактические метры (без округления вверх до целого).
 */
export function chargedMetersForBilling(meters: number): number {
  if (meters <= 0) return 0;
  if (meters < 1) return 1;
  return meters;
}

export function chargedFloorsFromSecond(value: number) {
  return value >= 2 ? value - 1 : 0;
}

export function capacityKey(value: string) {
  if (value === "7-9") return "7";
  return value;
}

/** Ключ типоразмера для цен монтажа (не для rough_in). */
export function calculatorCapacityTierKeyForPricelist(capacity: string): string {
  return capacityKey(capacity);
}

export function minOneMeter(value: number) {
  return value > 0 ? Math.max(1, value) : 0;
}

/** Сырые поля формы → нормализованный ввод для расчёта (границы как в основном калькуляторе). */
export function normalizeCalculatorComputeInput(
  raw: Partial<CalculatorComputeInputLoose>
): CalculatorComputeInput {
  const rawCap = typeof raw.capacity === "string" ? raw.capacity.trim() : "12";
  const allowedBtu = new Set<string>([...CALCULATOR_BTU_ONLY_OPTIONS, "7-9"]);
  const capacity =
    rawCap === CALCULATOR_ROUGH_IN_CAPACITY
      ? CALCULATOR_ROUGH_IN_CAPACITY
      : allowedBtu.has(rawCap)
        ? rawCap
        : "12";
  const mountType = raw.mountType === "existing" ? "existing" : "standard";
  const routeMeters = typeof raw.routeMeters === "string" ? raw.routeMeters : "0";
  const baseWallType = raw.baseWallType === "arm" ? "arm" : "normal";
  const extraHolesNormal =
    typeof raw.extraHolesNormal === "string"
      ? raw.extraHolesNormal
      : String(raw.extraHolesNormal ?? "0");
  const extraHolesArm =
    typeof raw.extraHolesArm === "string"
      ? raw.extraHolesArm
      : String(raw.extraHolesArm ?? "0");
  const roughInHolesBrick =
    typeof raw.roughInHolesBrick === "string"
      ? raw.roughInHolesBrick
      : String(raw.roughInHolesBrick ?? "0");
  const roughInHolesArmConcrete =
    typeof raw.roughInHolesArmConcrete === "string"
      ? raw.roughInHolesArmConcrete
      : String(raw.roughInHolesArmConcrete ?? "0");
  const carryToolFloors =
    typeof raw.carryToolFloors === "string"
      ? raw.carryToolFloors
      : String(raw.carryToolFloors ?? "0");
  const carryBlockCount =
    typeof raw.carryBlockCount === "string"
      ? raw.carryBlockCount
      : String(raw.carryBlockCount ?? "0");
  const manualDismantlingCost =
    typeof raw.manualDismantlingCost === "string"
      ? raw.manualDismantlingCost
      : String(raw.manualDismantlingCost ?? "0");
  const strobaType =
    raw.strobaType === "brick" || raw.strobaType === "concrete"
      ? raw.strobaType
      : "none";
  const strobaMeters = typeof raw.strobaMeters === "string" ? raw.strobaMeters : "0";
  const strobaDrainType =
    raw.strobaDrainType === "brick" || raw.strobaDrainType === "concrete"
      ? raw.strobaDrainType
      : "none";
  const strobaDrainMeters =
    typeof raw.strobaDrainMeters === "string" ? raw.strobaDrainMeters : "0";
  const cable40Meters = typeof raw.cable40Meters === "string" ? raw.cable40Meters : "0";
  const cable16Meters = typeof raw.cable16Meters === "string" ? raw.cable16Meters : "0";
  const percentDiscount =
    typeof raw.percentDiscount === "string" ? raw.percentDiscount : "0";

  const roughInRouteRaw =
    typeof raw.roughInRouteCapacity === "string"
      ? raw.roughInRouteCapacity
      : typeof raw.routeCapacity === "string"
        ? raw.routeCapacity
        : "12";

  return {
    capacity,
    roughInRouteCapacity: normalizeRoughInRouteCapacity(
      typeof roughInRouteRaw === "string" ? roughInRouteRaw : "12"
    ),
    mountType,
    routeMeters,
    baseWallType,
    extraHolesNormal: sanitizeNonNegativeIntString(extraHolesNormal, MAX_HOLES) || "0",
    extraHolesArm: sanitizeNonNegativeIntString(extraHolesArm, MAX_HOLES) || "0",
    roughInHolesBrick: sanitizeNonNegativeIntString(roughInHolesBrick, MAX_HOLES) || "0",
    roughInHolesArmConcrete:
      sanitizeNonNegativeIntString(roughInHolesArmConcrete, MAX_HOLES) || "0",
    carryToolFloors: sanitizeNonNegativeIntString(carryToolFloors, MAX_FLOORS) || "0",
    carryBlockCount: sanitizeNonNegativeIntString(carryBlockCount, MAX_BLOCKS) || "0",
    manualDismantlingCost:
      sanitizeNonNegativeMoneyString(manualDismantlingCost, MAX_MONEY) || "0",
    strobaType,
    strobaMeters: sanitizeDecimalMetersString(strobaMeters, MAX_STROBA_METERS) || "0",
    strobaDrainType,
    strobaDrainMeters:
      sanitizeDecimalMetersString(strobaDrainMeters, MAX_STROBA_METERS) || "0",
    cable40Meters: sanitizeDecimalMetersString(cable40Meters, MAX_CABLE_METERS) || "0",
    cable16Meters: sanitizeDecimalMetersString(cable16Meters, MAX_CABLE_METERS) || "0",
    buyAcAndRouteFromUs: Boolean(raw.buyAcAndRouteFromUs),
    includeBrackets: Boolean(raw.includeBrackets),
    includeGlass: Boolean(raw.includeGlass),
    includeTile: Boolean(raw.includeTile),
    includeDrain: Boolean(raw.includeDrain),
    includePump: Boolean(raw.includePump),
    includeLadderConnection: Boolean(raw.includeLadderConnection),
    percentDiscount: sanitizeNonNegativeIntString(percentDiscount, 100) || "0",
    giftRouteMeters: Math.max(0, Math.floor(Number(raw.giftRouteMeters) || 0)),
    acModels: Array.isArray(raw.acModels) ? raw.acModels : [],
    selectedAcModelIds: effectiveSelectedAcModelIds(
      capacity,
      Array.isArray(raw.selectedAcModelIds)
        ? raw.selectedAcModelIds.filter((x) => typeof x === "string")
        : typeof raw.selectedAcModelId === "string" && raw.selectedAcModelId
          ? [raw.selectedAcModelId]
          : []
    ),
    pricelistCustomServices: Array.isArray(raw.pricelistCustomServices)
      ? raw.pricelistCustomServices
      : [],
    selectedExtraServices:
      raw.selectedExtraServices && typeof raw.selectedExtraServices === "object"
        ? (raw.selectedExtraServices as SelectedExtraServiceMap)
        : {},
    quickCalculationExtras: Array.isArray(raw.quickCalculationExtras)
      ? raw.quickCalculationExtras
      : [],
  };
}

type CalculatorComputeInputLoose = {
  capacity?: unknown;
  roughInRouteCapacity?: unknown;
  routeCapacity?: unknown;
  mountType?: unknown;
  routeMeters?: unknown;
  baseWallType?: unknown;
  extraHolesNormal?: unknown;
  extraHolesArm?: unknown;
  roughInHolesBrick?: unknown;
  roughInHolesArmConcrete?: unknown;
  carryToolFloors?: unknown;
  carryBlockCount?: unknown;
  manualDismantlingCost?: unknown;
  strobaType?: unknown;
  strobaMeters?: unknown;
  strobaDrainType?: unknown;
  strobaDrainMeters?: unknown;
  cable40Meters?: unknown;
  cable16Meters?: unknown;
  buyAcAndRouteFromUs?: unknown;
  includeBrackets?: unknown;
  includeGlass?: unknown;
  includeTile?: unknown;
  includeDrain?: unknown;
  includePump?: unknown;
  includeLadderConnection?: unknown;
  percentDiscount?: unknown;
  giftRouteMeters?: unknown;
  acModels?: unknown;
  selectedAcModelIds?: unknown;
  selectedAcModelId?: unknown;
  pricelistCustomServices?: unknown;
  selectedExtraServices?: unknown;
  quickCalculationExtras?: unknown;
};
