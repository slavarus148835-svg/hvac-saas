import { chargedMetersForBilling, parseDecimalMetersInput } from "@/lib/calculator/parse";
import { MAX_STROBA_METERS } from "@/lib/calculator/constants";
import type { StrobaMetersFields } from "@/lib/calculator/strobaFields";
import type { CalculatorLineItem, CalculatorPriceList } from "@/lib/calculator/types";

function formatMetersQtyRu(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return "0";
  const x = Math.round(meters * 10) / 10;
  if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x));
  return String(x).replace(".", ",");
}

export type StrobaMaterial = "brick" | "concrete";

export type StrobaGrooveInput = StrobaMetersFields;

const MATERIAL_LABEL: Record<StrobaMaterial, string> = {
  brick: "кирпич/газоблок",
  concrete: "бетон",
};

const DRAIN_STROBA_LABEL_PLACEHOLDER = "\uE000DRAIN_STROBA\uE001";

/** Старые подписи в смете / истории / share: «Штроба» → «Основная штроба» (кроме дренажной). */
export function normalizeLegacyStrobaLabelsInQuoteText(text: string): string {
  let s = String(text || "");
  s = s.replace(/Штробление/g, "Основная штроба");
  s = s.replace(/Штроба под дренаж\/кабель/g, DRAIN_STROBA_LABEL_PLACEHOLDER);
  s = s.replace(/Штроба/g, "Основная штроба");
  s = s.replaceAll(DRAIN_STROBA_LABEL_PLACEHOLDER, "Штроба под дренаж/кабель");
  return s;
}

export function normalizeLegacyStrobaLineItemTitle(title: string): string {
  return normalizeLegacyStrobaLabelsInQuoteText(title);
}

export function strobaMaterialLabel(material: StrobaMaterial): string {
  return MATERIAL_LABEL[material];
}

export function strobaPricePerMeter(
  prices: CalculatorPriceList,
  kind: "main" | "drain",
  material: StrobaMaterial,
  isBigCapacity: boolean
): number {
  if (kind === "main") {
    if (material === "brick") {
      return isBigCapacity ? prices.stroba_brick_big : prices.stroba_brick_small;
    }
    return isBigCapacity ? prices.stroba_concrete_big : prices.stroba_concrete_small;
  }
  if (material === "brick") {
    return isBigCapacity ? prices.stroba_drain_brick_big : prices.stroba_drain_brick_small;
  }
  return isBigCapacity ? prices.stroba_drain_concrete_big : prices.stroba_drain_concrete_small;
}

type StrobaBillingLane = {
  kind: "main" | "drain";
  material: StrobaMaterial;
  raw: number;
};

/**
 * Минимум 1 м на комнату по сумме всех заполненных полей;
 * заряд распределяется пропорционально raw по каждому полю.
 */
export function allocateChargedStrobaMetersByLanes(
  lanes: StrobaBillingLane[]
): { lanes: (StrobaBillingLane & { charged: number })[]; totalCharged: number } {
  const active = lanes.filter((l) => l.raw > 0);
  if (active.length === 0) {
    return { lanes: [], totalCharged: 0 };
  }
  const sumRaw = active.reduce((s, l) => s + l.raw, 0);
  const totalCharged = chargedMetersForBilling(sumRaw);
  const chargedList = active.map((l) =>
    Math.round((totalCharged * (l.raw / sumRaw)) * 100) / 100
  );
  let drift = Math.round((totalCharged - chargedList.reduce((s, c) => s + c, 0)) * 100) / 100;
  for (let i = chargedList.length - 1; i >= 0 && Math.abs(drift) > 1e-9; i--) {
    chargedList[i] = Math.round((chargedList[i] + drift) * 100) / 100;
    drift = Math.round((totalCharged - chargedList.reduce((s, c) => s + c, 0)) * 100) / 100;
  }
  const lanesOut = active.map((l, i) => ({ ...l, charged: chargedList[i] ?? 0 }));
  return { lanes: lanesOut, totalCharged };
}

const STROBA_MIN_NOTE =
  "Сумма штроб в комнате: меньше 1 м → в расчёт 1 м; от 1 м — по фактической сумме метров";

function parseStrobaLanes(input: StrobaGrooveInput): StrobaBillingLane[] {
  return [
    {
      kind: "main",
      material: "concrete",
      raw: parseDecimalMetersInput(input.strobaConcreteMeters, MAX_STROBA_METERS),
    },
    {
      kind: "main",
      material: "brick",
      raw: parseDecimalMetersInput(input.strobaBrickMeters, MAX_STROBA_METERS),
    },
    {
      kind: "drain",
      material: "concrete",
      raw: parseDecimalMetersInput(input.strobaDrainConcreteMeters, MAX_STROBA_METERS),
    },
    {
      kind: "drain",
      material: "brick",
      raw: parseDecimalMetersInput(input.strobaDrainBrickMeters, MAX_STROBA_METERS),
    },
  ];
}

export function appendStrobaLineItems(
  items: CalculatorLineItem[],
  prices: CalculatorPriceList,
  input: StrobaGrooveInput,
  isBigCapacity: boolean,
  fmt: (n: number) => string
): void {
  const { lanes } = allocateChargedStrobaMetersByLanes(parseStrobaLanes(input));

  for (const lane of lanes) {
    if (lane.charged <= 0) continue;
    const price = strobaPricePerMeter(prices, lane.kind, lane.material, isBigCapacity);
    const mLabel = formatMetersQtyRu(lane.charged);
    const prefix =
      lane.kind === "main" ? "Основная штроба" : "Штроба под дренаж/кабель";
    items.push({
      title: `${prefix}, ${strobaMaterialLabel(lane.material)} × ${mLabel} м`,
      amount: Math.round(lane.charged * price),
      note: `Цена за 1 м: ${fmt(price)}. ${STROBA_MIN_NOTE}`,
    });
  }
}
