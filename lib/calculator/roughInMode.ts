/** Режим «Закладка трасс»: только трасса/штроба и пр., без базового монтажа блока. */

export const CALCULATOR_ROUGH_IN_CAPACITY = "rough_in";

export const CALCULATOR_ROUGH_IN_LABEL_RU = "Закладка трасс";

/** Отверстия только в режиме «Закладка трасс» (фиксированные цены, не из прайса). */
export const ROUGH_IN_HOLE_BRICK_LABEL = "Отверстие кирпич/пеноблок";
export const ROUGH_IN_HOLE_ARM_CONCRETE_LABEL = "Армированный бетон/монолит";
export const ROUGH_IN_HOLE_BRICK_PRICE_RUB = 1000;
export const ROUGH_IN_HOLE_ARM_CONCRETE_PRICE_RUB = 5000;

export const CALCULATOR_BTU_ONLY_OPTIONS = ["7", "9", "12", "18", "24", "30", "36"] as const;

export type CalculatorBtuDigitCapacity = (typeof CALCULATOR_BTU_ONLY_OPTIONS)[number];

/** Типоразмеры BTU в селекторе (без «Закладка трасс» — отдельный переключатель в UI). */
export const CALCULATOR_CAPACITY_SELECT_OPTIONS: readonly CalculatorBtuDigitCapacity[] =
  CALCULATOR_BTU_ONLY_OPTIONS;

/** Строки клиентского текста: заголовок «Закладка трасс» без суммы (см. clientQuoteStandard). */
export function clientQuoteItemsWithRoughInHeader(
  capacity: string,
  items: { title: string; amount: number }[]
): { title: string; amount: number }[] {
  if (!isCalculatorRoughInCapacity(capacity)) return items;
  if (items.some((i) => i.title === CALCULATOR_ROUGH_IN_LABEL_RU)) return items;
  return [{ title: CALCULATOR_ROUGH_IN_LABEL_RU, amount: 0 }, ...items];
}

export function isCalculatorRoughInCapacity(capacity: string): boolean {
  return String(capacity ?? "").trim() === CALCULATOR_ROUGH_IN_CAPACITY;
}

const ALLOWED_ROUGH_IN_ROUTE = new Set<string>(CALCULATOR_BTU_ONLY_OPTIONS);

/** Нормализация типоразмера трассы в режиме закладки (fallback «12»). */
export function normalizeRoughInRouteCapacity(raw: string | undefined): CalculatorBtuDigitCapacity {
  const k = String(raw ?? "").trim();
  if (k === "7-9") return "7";
  if (ALLOWED_ROUGH_IN_ROUTE.has(k)) return k as CalculatorBtuDigitCapacity;
  return "12";
}

/** Ключ прайса route_* / штроба: при rough_in — из roughInRouteCapacity, иначе из capacity монтажа. */
export function routeCapacityTierKeyForPricelist(input: {
  capacity: string;
  roughInRouteCapacity: string;
}): string {
  if (isCalculatorRoughInCapacity(input.capacity)) {
    return normalizeRoughInRouteCapacity(input.roughInRouteCapacity);
  }
  const cap = String(input.capacity ?? "").trim();
  if (cap === "7-9") return "7";
  return ALLOWED_ROUGH_IN_ROUTE.has(cap) ? cap : "12";
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
