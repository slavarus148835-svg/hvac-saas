import type { QuickCalculationExtra } from "@/lib/customServices";
import type { CalculatorComputeInput, SelectedExtraServiceMap } from "./types";

/** Локальное состояние одной комнаты (без глобальных полей прайса). */
export type CalculatorRoomDraft = {
  id: string;
  roomName: string;
} & Omit<
  CalculatorComputeInput,
  "giftRouteMeters" | "acModels" | "pricelistCustomServices" | "percentDiscount"
>;

export function newRoomId(): string {
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createDefaultRoomDraft(roomLabel: string): CalculatorRoomDraft {
  return {
    id: newRoomId(),
    roomName: roomLabel,
    capacity: "12",
    mountType: "standard",
    routeMeters: "0",
    baseWallType: "normal",
    extraHolesNormal: "0",
    extraHolesArm: "0",
    carryToolFloors: "0",
    carryBlockCount: "0",
    manualDismantlingCost: "0",
    strobaType: "none",
    strobaMeters: "0",
    cable40Meters: "0",
    cable16Meters: "0",
    buyAcAndRouteFromUs: false,
    includeBrackets: false,
    includeGlass: false,
    includeTile: false,
    includeDrain: false,
    includePump: false,
    includeLadderConnection: false,
    selectedAcModelIds: [],
    selectedExtraServices: {},
    quickCalculationExtras: [],
  };
}

export function roomDraftToComputeInput(
  draft: CalculatorRoomDraft,
  ctx: Pick<CalculatorComputeInput, "giftRouteMeters" | "acModels" | "pricelistCustomServices">
): CalculatorComputeInput {
  const { id: _id, roomName: _name, ...rest } = draft;
  return {
    ...rest,
    giftRouteMeters: ctx.giftRouteMeters,
    acModels: ctx.acModels,
    pricelistCustomServices: ctx.pricelistCustomServices,
    percentDiscount: "0",
  };
}

/** Снимок «плоской» формы калькулятора → черновик комнаты. */
export function flatCalculatorStateToRoomDraft(params: {
  roomName: string;
  capacity: string;
  mountType: "standard" | "existing";
  routeMeters: string;
  baseWallType: "normal" | "arm";
  extraHolesNormal: string;
  extraHolesArm: string;
  carryToolFloors: string;
  carryBlockCount: string;
  manualDismantlingCost: string;
  strobaType: "none" | "brick" | "concrete";
  strobaMeters: string;
  cable40Meters: string;
  cable16Meters: string;
  buyAcAndRouteFromUs: boolean;
  includeBrackets: boolean;
  includeGlass: boolean;
  includeTile: boolean;
  includeDrain: boolean;
  includePump: boolean;
  includeLadderConnection: boolean;
  selectedAcModelIds: string[];
  selectedExtraServices: SelectedExtraServiceMap;
  quickCalculationExtras: QuickCalculationExtra[];
}): CalculatorRoomDraft {
  return {
    id: newRoomId(),
    roomName: params.roomName,
    capacity: params.capacity,
    mountType: params.mountType,
    routeMeters: params.routeMeters,
    baseWallType: params.baseWallType,
    extraHolesNormal: params.extraHolesNormal,
    extraHolesArm: params.extraHolesArm,
    carryToolFloors: params.carryToolFloors,
    carryBlockCount: params.carryBlockCount,
    manualDismantlingCost: params.manualDismantlingCost,
    strobaType: params.strobaType,
    strobaMeters: params.strobaMeters,
    cable40Meters: params.cable40Meters,
    cable16Meters: params.cable16Meters,
    buyAcAndRouteFromUs: params.buyAcAndRouteFromUs,
    includeBrackets: params.includeBrackets,
    includeGlass: params.includeGlass,
    includeTile: params.includeTile,
    includeDrain: params.includeDrain,
    includePump: params.includePump,
    includeLadderConnection: params.includeLadderConnection,
    selectedAcModelIds: [...params.selectedAcModelIds],
    selectedExtraServices: JSON.parse(JSON.stringify(params.selectedExtraServices)) as SelectedExtraServiceMap,
    quickCalculationExtras: params.quickCalculationExtras.map((x) => ({ ...x })),
  };
}

export function roomDraftToFlatState(
  draft: CalculatorRoomDraft
): Omit<CalculatorRoomDraft, "id" | "roomName"> {
  const { id: _i, roomName: _n, ...rest } = draft;
  return rest;
}

/** Восстановление черновика комнаты из Firestore (calculationHistory.rooms[]). */
export function roomDraftFromFirestoreEntry(entry: unknown): CalculatorRoomDraft | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const o = entry as Record<string, unknown>;
  const inp = o.input;
  if (!inp || typeof inp !== "object" || Array.isArray(inp)) return null;
  const input = inp as Record<string, unknown>;
  const id =
    typeof o.id === "string" && o.id.trim() ? String(o.id).trim() : newRoomId();
  const roomName =
    typeof o.roomName === "string" && o.roomName.trim()
      ? String(o.roomName).trim()
      : "Комната";
  return {
    id,
    roomName,
    capacity: typeof input.capacity === "string" ? input.capacity : "12",
    mountType: input.mountType === "existing" ? "existing" : "standard",
    routeMeters: typeof input.routeMeters === "string" ? input.routeMeters : "0",
    baseWallType: input.baseWallType === "arm" ? "arm" : "normal",
    extraHolesNormal:
      typeof input.extraHolesNormal === "string"
        ? input.extraHolesNormal
        : String(input.extraHolesNormal ?? "0"),
    extraHolesArm:
      typeof input.extraHolesArm === "string"
        ? input.extraHolesArm
        : String(input.extraHolesArm ?? "0"),
    carryToolFloors:
      typeof input.carryToolFloors === "string"
        ? input.carryToolFloors
        : String(input.carryToolFloors ?? "0"),
    carryBlockCount:
      typeof input.carryBlockCount === "string"
        ? input.carryBlockCount
        : String(input.carryBlockCount ?? "0"),
    manualDismantlingCost:
      typeof input.manualDismantlingCost === "string"
        ? input.manualDismantlingCost
        : String(input.manualDismantlingCost ?? "0"),
    strobaType:
      input.strobaType === "brick" || input.strobaType === "concrete" ? input.strobaType : "none",
    strobaMeters: typeof input.strobaMeters === "string" ? input.strobaMeters : "0",
    cable40Meters: typeof input.cable40Meters === "string" ? input.cable40Meters : "0",
    cable16Meters: typeof input.cable16Meters === "string" ? input.cable16Meters : "0",
    buyAcAndRouteFromUs: Boolean(input.buyAcAndRouteFromUs),
    includeBrackets: Boolean(input.includeBrackets),
    includeGlass: Boolean(input.includeGlass),
    includeTile: Boolean(input.includeTile),
    includeDrain: Boolean(input.includeDrain),
    includePump: Boolean(input.includePump),
    includeLadderConnection: Boolean(input.includeLadderConnection),
    selectedAcModelIds: Array.isArray(input.selectedAcModelIds)
      ? input.selectedAcModelIds.filter((x): x is string => typeof x === "string")
      : [],
    selectedExtraServices:
      input.selectedExtraServices &&
      typeof input.selectedExtraServices === "object" &&
      !Array.isArray(input.selectedExtraServices)
        ? (input.selectedExtraServices as SelectedExtraServiceMap)
        : {},
    quickCalculationExtras: Array.isArray(input.quickCalculationExtras)
      ? (input.quickCalculationExtras as QuickCalculationExtra[])
      : [],
  };
}
