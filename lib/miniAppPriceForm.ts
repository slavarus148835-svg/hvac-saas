import {
  DEFAULT_CALCULATOR_PRICES,
  type CalculatorPriceList,
} from "@/lib/calculator";

export const MINI_APP_PRICE_FORM_KEYS = Object.keys(
  DEFAULT_CALCULATOR_PRICES
) as (keyof CalculatorPriceList)[];

export function calculatorPriceListToFormStrings(
  p: CalculatorPriceList
): Record<keyof CalculatorPriceList, string> {
  const o = {} as Record<keyof CalculatorPriceList, string>;
  for (const k of MINI_APP_PRICE_FORM_KEYS) {
    o[k] = String(Math.max(0, Math.floor(Number(p[k]) || 0)));
  }
  return o;
}

/** Безопасно разбирает частичный ввод цен с клиента (только известные ключи). */
export function normalizeMiniAppPricePayload(
  body: unknown
): Partial<CalculatorPriceList> {
  const out: Partial<CalculatorPriceList> = {};
  if (!body || typeof body !== "object") return out;
  const rec = body as Record<string, unknown>;
  const prices = rec.prices;
  const src =
    prices && typeof prices === "object" && !Array.isArray(prices)
      ? (prices as Record<string, unknown>)
      : rec;
  for (const k of MINI_APP_PRICE_FORM_KEYS) {
    if (!(k in src)) continue;
    const raw = src[k as string];
    let n = NaN;
    if (typeof raw === "number" && Number.isFinite(raw)) n = raw;
    else if (typeof raw === "string") {
      n = Number(String(raw).replace(/\s/g, "").replace(",", "."));
    }
    if (Number.isFinite(n)) {
      out[k] = Math.max(0, Math.floor(n));
    }
  }
  return out;
}

export function parseGiftRouteMetersInput(raw: unknown): number | null {
  if (raw === undefined) return null;
  let n = NaN;
  if (typeof raw === "number" && Number.isFinite(raw)) n = raw;
  else if (typeof raw === "string") {
    n = Number(String(raw).replace(/\D/g, ""));
  }
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(500, Math.floor(n)));
}
