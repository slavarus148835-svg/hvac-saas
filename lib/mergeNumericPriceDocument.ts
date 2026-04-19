/**
 * Безопасно подмешивает числовые поля прайса из Firestore в дефолты (старые/битые типы не ломают UI).
 */
export function mergeNumericPriceDocument<T extends Record<string, number>>(
  data: Record<string, unknown> | undefined,
  defaults: T
): T {
  const out = { ...defaults };
  if (!data || typeof data !== "object") return out;
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const raw = data[String(key)];
    let n = NaN;
    if (typeof raw === "number" && Number.isFinite(raw)) n = raw;
    else if (typeof raw === "string" && raw.trim()) {
      n = Number(raw.replace(/\s/g, "").replace(",", "."));
    }
    if (Number.isFinite(n)) {
      (out as Record<string, number>)[String(key)] = Math.max(0, Math.floor(n));
    }
  }
  return out;
}
