import type { QuickCalculationExtra, UserCustomService } from "@/lib/customServices";

/** Числовой прайс калькулятора (совпадает с полями в priceLists и дефолтами). */
export type CalculatorPriceList = {
  standard_7: number;
  standard_9: number;
  standard_12: number;
  standard_18: number;
  standard_24: number;
  standard_30: number;
  standard_36: number;

  existing_7: number;
  existing_9: number;
  existing_12: number;
  existing_18: number;
  existing_24: number;
  existing_30: number;
  existing_36: number;

  route_7: number;
  route_9: number;
  route_12: number;
  route_18: number;
  route_24: number;
  route_30: number;
  route_36: number;

  baseArmConcreteSurcharge: number;
  extraHoleNormal: number;
  extraHoleArm: number;

  stroba_brick_small: number;
  stroba_brick_big: number;
  stroba_concrete_small: number;
  stroba_concrete_big: number;

  cable40: number;
  cable16: number;

  bracketsAndFasteners: number;
  dismantlingOldUnit: number;
  glassUnitWork: number;
  facadeTileCut: number;
  drainageToGutter: number;
  drainPumpInstall: number;
  outdoorConnectionLadder: number;
  floorCarryTools: number;
  outdoorBlockCarry: number;
};

export type SelectedExtraServiceMap = Record<
  string,
  {
    checked: boolean;
    qty: string;
  }
>;

export type CalculatorLineItem = {
  title: string;
  amount: number;
  note?: string;
};

export type CalculatorComputeInput = {
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
  percentDiscount: string;
  giftRouteMeters: number;
  acModels: { id: string; name: string; price: number }[];
  selectedAcModelIds: string[];
  pricelistCustomServices: UserCustomService[];
  selectedExtraServices: SelectedExtraServiceMap;
  quickCalculationExtras: QuickCalculationExtra[];
};

export type CalculatorRoomInput = {
  id: string;
  roomName: string;
  input: CalculatorComputeInput;
};

export type MultiRoomComputeRoomResult = {
  id: string;
  roomName: string;
  items: CalculatorLineItem[];
  subtotal: number;
};

export type MultiRoomComputeResult = {
  rooms: MultiRoomComputeRoomResult[];
  /** Сумма по комнатам до глобальной скидки %. */
  totalBeforeGlobalDiscount: number;
  discountByPercent: number;
  percentDiscountNum: number;
  total: number;
  /** Плоский список для экрана (все позиции комнат подряд). */
  flatItems: CalculatorLineItem[];
  autoClientText: string;
};

export type CalculatorComputeResult = {
  items: CalculatorLineItem[];
  total: number;
  autoClientText: string;
};
