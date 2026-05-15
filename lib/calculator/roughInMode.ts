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

/** Подарочные метры трассы — только при монтаже кондиционера, не при «Закладка трасс». */
export function effectiveGiftRouteMeters(
  capacity: string,
  giftRouteMeters: number
): number {
  if (isCalculatorRoughInCapacity(capacity)) return 0;
  return Math.max(0, Math.floor(Number(giftRouteMeters) || 0));
}

export function calculatorRouteMetersFieldNote(
  capacity: string,
  giftRouteMeters: number
): string {
  if (isCalculatorRoughInCapacity(capacity)) {
    return "Можно ввести доли метра. Если больше 0 и меньше 1 м — в расчёт идёт 1 м; от 1 м — по факту. Вся трасса оплачивается полностью";
  }
  return `Можно ввести доли метра. Если больше 0 и меньше 1 м — в расчёт идёт 1 м; от 1 м — по факту. К оплате: метры минус «в подарок» (${giftRouteMeters} м из личного прайса)`;
}

export function calculatorRouteMetersFieldLabel(
  capacity: string,
  giftRouteMeters: number
): string {
  if (isCalculatorRoughInCapacity(capacity)) {
    return "Трасса, м, мин. 1 м";
  }
  return `Трасса, м, мин. 1 м (в подарок ${giftRouteMeters} м)`;
}

export function calculatorRouteMetersRoomNote(
  capacity: string,
  giftRouteMeters: number
): string {
  if (isCalculatorRoughInCapacity(capacity)) {
    return "Доли метра. (0;1) м → 1 м к оплате. Вся трасса оплачивается полностью";
  }
  return `Доли метра. (0;1) м → 1 м к оплате. Подарок: ${giftRouteMeters} м из прайса`;
}
