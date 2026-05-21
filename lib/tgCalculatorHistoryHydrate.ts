import type { QuickCalculationExtra } from "@/lib/customServices";
import type { SelectedExtraServiceMap } from "@/lib/calculator";
import {
  CALCULATOR_BTU_ONLY_OPTIONS,
  CALCULATOR_ROUGH_IN_CAPACITY,
  normalizeRoughInRouteCapacity,
} from "@/lib/calculator/roughInMode";

/** Поля формы /tg/calculator, восстанавливаемые из calculationHistory. */
export type TgCalculatorHydratedFields = {
  capacity: string;
  roughInRouteCapacity: string;
  mountType: "standard" | "existing";
  routeMeters: string;
  baseWallType: "normal" | "arm";
  extraHolesNormal: string;
  extraHolesArm: string;
  roughInHolesBrick: string;
  roughInHolesArmConcrete: string;
  carryToolFloors: string;
  carryBlockCount: string;
  manualDismantlingCost: string;
  strobaType: "none" | "brick" | "concrete";
  strobaMeters: string;
  strobaDrainType: "none" | "brick" | "concrete";
  strobaDrainMeters: string;
  cable40Meters: string;
  cable16Meters: string;
  buyAcAndRouteFromUs: boolean;
  includeBrackets: boolean;
  includeGlass: boolean;
  includeTile: boolean;
  includeDrain: boolean;
  includePump: boolean;
  includeLadderConnection: boolean;
  percentDiscount: string;
  selectedAcModelIds: string[];
  selectedExtraServices: SelectedExtraServiceMap;
  quickCalculationExtras: QuickCalculationExtra[];
  clientName: string;
  clientContact: string;
};

export function hydrateTgCalculatorFromHistoryDoc(
  data: Record<string, unknown>
): Partial<TgCalculatorHydratedFields> {
  let capacity = typeof data.capacity === "string" ? data.capacity.trim() : "12";
  if (capacity === "7-9") capacity = "7";
  const allowedBtu = new Set<string>([...CALCULATOR_BTU_ONLY_OPTIONS, "7-9"]);
  if (capacity !== CALCULATOR_ROUGH_IN_CAPACITY && !allowedBtu.has(capacity)) {
    capacity = "12";
  }

  const mountType = data.mountType === "existing" ? "existing" : "standard";
  const baseWallType = data.baseWallType === "arm" ? "arm" : "normal";
  const strobaRaw = data.strobaType;
  const strobaType =
    strobaRaw === "brick" || strobaRaw === "concrete" ? strobaRaw : "none";

  const fromList = Array.isArray(data.selectedAcModelIds)
    ? (data.selectedAcModelIds as unknown[]).filter((x) => typeof x === "string")
    : [];
  const fromLegacy = data.selectedAcModelId ? [String(data.selectedAcModelId)] : [];
  let selectedAcModelIds = Array.from(
    new Set([...(fromList as string[]), ...fromLegacy])
  ) as string[];
  if (capacity === CALCULATOR_ROUGH_IN_CAPACITY) {
    selectedAcModelIds = [];
  }

  let selectedExtraServices: SelectedExtraServiceMap = {};
  if (data.selectedExtraServices && typeof data.selectedExtraServices === "object") {
    selectedExtraServices = data.selectedExtraServices as SelectedExtraServiceMap;
  }

  let quickCalculationExtras: QuickCalculationExtra[] = [];
  if (Array.isArray(data.quickCalculationExtras)) {
    quickCalculationExtras = data.quickCalculationExtras.filter(
      (x) =>
        x &&
        typeof x === "object" &&
        typeof (x as QuickCalculationExtra).id === "string" &&
        typeof (x as QuickCalculationExtra).name === "string" &&
        typeof (x as QuickCalculationExtra).price === "number"
    ) as QuickCalculationExtra[];
  }

  const roughInRouteCapacity = normalizeRoughInRouteCapacity(
    typeof data.roughInRouteCapacity === "string"
      ? data.roughInRouteCapacity
      : capacity === CALCULATOR_ROUGH_IN_CAPACITY
        ? "12"
        : capacity
  );

  return {
    capacity,
    roughInRouteCapacity,
    mountType,
    routeMeters: typeof data.routeMeters === "string" ? data.routeMeters : "0",
    baseWallType,
    extraHolesNormal: typeof data.extraHolesNormal === "string" ? data.extraHolesNormal : "0",
    extraHolesArm: typeof data.extraHolesArm === "string" ? data.extraHolesArm : "0",
    roughInHolesBrick: typeof data.roughInHolesBrick === "string" ? data.roughInHolesBrick : "0",
    roughInHolesArmConcrete:
      typeof data.roughInHolesArmConcrete === "string" ? data.roughInHolesArmConcrete : "0",
    carryToolFloors: typeof data.carryToolFloors === "string" ? data.carryToolFloors : "0",
    carryBlockCount: typeof data.carryBlockCount === "string" ? data.carryBlockCount : "0",
    manualDismantlingCost:
      typeof data.manualDismantlingCost === "string" ? data.manualDismantlingCost : "0",
    strobaType,
    strobaMeters: typeof data.strobaMeters === "string" ? data.strobaMeters : "0",
    strobaDrainType:
      data.strobaDrainType === "brick" || data.strobaDrainType === "concrete"
        ? data.strobaDrainType
        : "none",
    strobaDrainMeters:
      typeof data.strobaDrainMeters === "string" ? data.strobaDrainMeters : "0",
    cable40Meters: typeof data.cable40Meters === "string" ? data.cable40Meters : "0",
    cable16Meters: typeof data.cable16Meters === "string" ? data.cable16Meters : "0",
    buyAcAndRouteFromUs: Boolean(data.buyAcAndRouteFromUs),
    includeBrackets: Boolean(data.includeBrackets),
    includeGlass: Boolean(data.includeGlass),
    includeTile: Boolean(data.includeTile),
    includeDrain: Boolean(data.includeDrain),
    includePump: Boolean(data.includePump),
    includeLadderConnection: Boolean(data.includeLadderConnection),
    percentDiscount: typeof data.percentDiscount === "string" ? data.percentDiscount : "0",
    selectedAcModelIds,
    selectedExtraServices,
    quickCalculationExtras,
    clientName: typeof data.clientName === "string" ? data.clientName : "",
    clientContact: typeof data.clientContact === "string" ? data.clientContact : "",
  };
}
