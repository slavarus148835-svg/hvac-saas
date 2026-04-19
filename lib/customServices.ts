/**
 * Пользовательские услуги хранятся в `priceLists/{uid}` в поле `customServices`.
 */
export type UserCustomService = {
  id: string;
  name: string;
  price: number;
};

export function newCustomServiceId(): string {
  return `cs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function parseCustomServicesFromPriceDoc(raw: unknown): UserCustomService[] {
  if (!Array.isArray(raw)) return [];
  const out: UserCustomService[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const id = String(o.id ?? "").trim();
    const name = String(o.name ?? "").trim();
    const priceRaw = o.price;
    let price = NaN;
    if (typeof priceRaw === "number" && Number.isFinite(priceRaw)) price = priceRaw;
    else if (typeof priceRaw === "string" && priceRaw.trim())
      price = Number(priceRaw.replace(/\s/g, "").replace(",", "."));
    if (!id || !name || !Number.isFinite(price)) continue;
    out.push({ id, name, price: Math.max(0, Math.floor(price)) });
  }
  return out;
}

/** Быстрые строки только в текущем расчёте (не в прайсе). */
export type QuickCalculationExtra = {
  id: string;
  name: string;
  price: number;
};

export function newQuickExtraId(): string {
  return `qx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Строки из формы прайса (цена как string) → payload для Firestore. */
export function customServiceFormRowsToPayload(
  rows: { id: string; name: string; price: string }[]
): UserCustomService[] {
  return rows
    .map((row) => {
      const p = Math.max(0, Math.floor(Number(String(row.price || "").replace(/\D/g, "") || 0)));
      const name = String(row.name || "").trim();
      if (!name || !Number.isFinite(p) || p <= 0) return null;
      return { id: row.id, name, price: p };
    })
    .filter(Boolean) as UserCustomService[];
}
