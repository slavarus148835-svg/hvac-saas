export function formatRubles(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Number(n || 0)) + " ₽";
}

/** Только число с разделителями (без символа ₽) — для строк, где валюта добавляется отдельно. */
export function formatAmountRu(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Number(n || 0));
}
