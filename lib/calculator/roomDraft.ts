import type { QuickCalculationExtra } from "@/lib/customServices";
import type { CalculatorComputeInput, SelectedExtraServiceMap } from "@/lib/calculator/types";

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
