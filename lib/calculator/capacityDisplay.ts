/**
 * Отображение мощности для UI и клиентских текстов.
 * Типоразмеры: "7" | "9" | … | "36" (и "7-9" в старых данных), плюс rough_in — «Закладка трасс».
 */

import {
  CALCULATOR_ROUGH_IN_LABEL_RU,
  isCalculatorRoughInCapacity,
} from "./roughInMode";

const TYPICAL_KW_TO_BTU: Record<string, number> = {
  "7": 7000,
  "9": 9000,
  "12": 12000,
  "18": 18000,
  "24": 24000,
  "30": 30000,
  "36": 36000,
};

export function capacityToBtuNumber(capacity: string): number {
  const k = String(capacity ?? "").trim();
  if (isCalculatorRoughInCapacity(k)) return NaN;
  if (!k || k === "—") return 12000;
  if (k === "7-9") return 7000;
  const mapped = TYPICAL_KW_TO_BTU[k];
  if (mapped != null) return mapped;
  const onlyDigits = k.replace(/\D/g, "");
  const n = Number(onlyDigits);
  if (!Number.isFinite(n) || n <= 0) return 12000;
  if (n >= 1000) return Math.round(n);
  return TYPICAL_KW_TO_BTU[String(n)] ?? n * 1000;
}

export function formatCapacityBtu(capacity: string): string {
  const k = String(capacity ?? "").trim();
  if (!k || k === "—") return "—";
  if (isCalculatorRoughInCapacity(k)) return CALCULATOR_ROUGH_IN_LABEL_RU;
  return `${capacityToBtuNumber(k)} BTU`;
}

/** Синоним для подписей в UI («7000 BTU»). */
export function formatCapacityLabel(capacity: string): string {
  return formatCapacityBtu(capacity);
}
