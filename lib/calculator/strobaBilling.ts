import { chargedMetersForBilling, parseDecimalMetersInput } from "@/lib/calculator/parse";
import { MAX_STROBA_METERS } from "@/lib/calculator/constants";
import type { CalculatorLineItem, CalculatorPriceList } from "@/lib/calculator/types";
function formatMetersQtyRu(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return "0";
  const x = Math.round(meters * 10) / 10;
  if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x));
  return String(x).replace(".", ",");
}

export type StrobaMaterialType = "none" | "brick" | "concrete";

export type StrobaGrooveInput = {
  strobaType: StrobaMaterialType;
  strobaMeters: string;
  strobaDrainType: StrobaMaterialType;
  strobaDrainMeters: string;
};

const MATERIAL_LABEL: Record<Exclude<StrobaMaterialType, "none">, string> = {
  brick: "кирпич/газоблок",
  concrete: "бетон",
};

export function strobaMaterialLabel(type: StrobaMaterialType): string {
  if (type === "none") return "";
  return MATERIAL_LABEL[type];
}

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

export function normalizeStrobaMaterialType(raw: unknown): StrobaMaterialType {
  return raw === "brick" || raw === "concrete" ? raw : "none";
}

export function strobaPricePerMeter(
  prices: CalculatorPriceList,
  kind: "main" | "drain",
  material: Exclude<StrobaMaterialType, "none">,
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

/**
 * Минимум 1 м на комнату по сумме метров всех штроб; распределение по типам пропорционально вводу.
 */
export function allocateChargedStrobaMeters(
  mainRaw: number,
  drainRaw: number
): { mainCharged: number; drainCharged: number; totalCharged: number } {
  const sumRaw = mainRaw + drainRaw;
  if (sumRaw <= 0) {
    return { mainCharged: 0, drainCharged: 0, totalCharged: 0 };
  }
  const totalCharged = chargedMetersForBilling(sumRaw);
  if (mainRaw <= 0) {
    return { mainCharged: 0, drainCharged: totalCharged, totalCharged };
  }
  if (drainRaw <= 0) {
    return { mainCharged: totalCharged, drainCharged: 0, totalCharged };
  }
  const mainCharged = Math.round((totalCharged * (mainRaw / sumRaw)) * 100) / 100;
  const drainCharged = Math.round((totalCharged - mainCharged) * 100) / 100;
  return { mainCharged, drainCharged, totalCharged };
}

const STROBA_MIN_NOTE =
  "Сумма штроб в комнате: меньше 1 м → в расчёт 1 м; от 1 м — по фактической сумме метров";

export function appendStrobaLineItems(
  items: CalculatorLineItem[],
  prices: CalculatorPriceList,
  input: StrobaGrooveInput,
  isBigCapacity: boolean,
  fmt: (n: number) => string
): void {
  const mainType = input.strobaType;
  const drainType = input.strobaDrainType;
  const mainRaw =
    mainType !== "none"
      ? parseDecimalMetersInput(input.strobaMeters, MAX_STROBA_METERS)
      : 0;
  const drainRaw =
    drainType !== "none"
      ? parseDecimalMetersInput(input.strobaDrainMeters, MAX_STROBA_METERS)
      : 0;

  const { mainCharged, drainCharged } = allocateChargedStrobaMeters(mainRaw, drainRaw);

  if (mainType !== "none" && mainCharged > 0) {
    const price = strobaPricePerMeter(prices, "main", mainType, isBigCapacity);
    const mLabel = formatMetersQtyRu(mainCharged);
    items.push({
      title: `Основная штроба, ${strobaMaterialLabel(mainType)} × ${mLabel} м`,
      amount: Math.round(mainCharged * price),
      note: `Цена за 1 м: ${fmt(price)}. ${STROBA_MIN_NOTE}`,
    });
  }

  if (drainType !== "none" && drainCharged > 0) {
    const price = strobaPricePerMeter(prices, "drain", drainType, isBigCapacity);
    const mLabel = formatMetersQtyRu(drainCharged);
    items.push({
      title: `Штроба под дренаж/кабель, ${strobaMaterialLabel(drainType)} × ${mLabel} м`,
      amount: Math.round(drainCharged * price),
      note: `Цена за 1 м: ${fmt(price)}. ${STROBA_MIN_NOTE}`,
    });
  }
}
