export function formatRubles(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Number(n || 0)) + " ₽";
}
