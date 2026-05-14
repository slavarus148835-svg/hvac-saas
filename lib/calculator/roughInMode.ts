/** Режим «Закладка трасс»: только трасса/штроба и пр., без базового монтажа блока. */

export const CALCULATOR_ROUGH_IN_CAPACITY = "rough_in";

export const CALCULATOR_ROUGH_IN_LABEL_RU = "Закладка трасс";

export const CALCULATOR_BTU_ONLY_OPTIONS = ["7", "9", "12", "18", "24", "30", "36"] as const;

export type CalculatorBtuDigitCapacity = (typeof CALCULATOR_BTU_ONLY_OPTIONS)[number];

/** Порядок в селекторе мощности: сначала закладка, затем типоразмеры BTU. */
export const CALCULATOR_CAPACITY_SELECT_OPTIONS: readonly (
  | typeof CALCULATOR_ROUGH_IN_CAPACITY
  | CalculatorBtuDigitCapacity
)[] = [CALCULATOR_ROUGH_IN_CAPACITY, ...CALCULATOR_BTU_ONLY_OPTIONS];

export function isCalculatorRoughInCapacity(capacity: string): boolean {
  return String(capacity ?? "").trim() === CALCULATOR_ROUGH_IN_CAPACITY;
}
