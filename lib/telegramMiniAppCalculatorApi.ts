import type { CalculatorPriceList } from "@/lib/calculator";
import type { UserCustomService } from "@/lib/customServices";
import { getMiniAppSessionToken } from "@/lib/telegramMiniAppSession";

export type MiniAppCalculatorContextResponse = {
  ok: true;
  prices: CalculatorPriceList;
  giftRouteMeters: number;
  models: { id: string; name: string; price: number }[];
  customServices: UserCustomService[];
};

export async function fetchMiniAppCalculatorContext(): Promise<
  MiniAppCalculatorContextResponse | { ok: false; error: string; status?: number }
> {
  const token = getMiniAppSessionToken();
  if (!token) {
    return { ok: false, error: "Нет сессии Mini App." };
  }
  try {
    const res = await fetch("/api/telegram/miniapp-calculator-context", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok || data.ok !== true) {
      return {
        ok: false,
        error: "Не удалось загрузить прайс.",
        status: res.status,
      };
    }
    return {
      ok: true,
      prices: data.prices as CalculatorPriceList,
      giftRouteMeters: Number(data.giftRouteMeters) || 1,
      models: Array.isArray(data.models) ? (data.models as MiniAppCalculatorContextResponse["models"]) : [],
      customServices: Array.isArray(data.customServices)
        ? (data.customServices as UserCustomService[])
        : [],
    };
  } catch {
    return { ok: false, error: "Нет соединения с сервером." };
  }
}

export type MiniAppHistoryListItem = {
  id: string;
  createdAt: string;
  clientName: string;
  total: number;
  mountType: "standard" | "existing";
  capacity: string;
};

export async function fetchMiniAppHistoryList(): Promise<
  | { ok: true; items: MiniAppHistoryListItem[] }
  | { ok: false; error: string }
> {
  const token = getMiniAppSessionToken();
  if (!token) return { ok: false, error: "Нет сессии." };
  try {
    const res = await fetch("/api/telegram/miniapp-history", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok || data.ok !== true) {
      return { ok: false, error: "Не удалось загрузить историю." };
    }
    return {
      ok: true,
      items: Array.isArray(data.items) ? (data.items as MiniAppHistoryListItem[]) : [],
    };
  } catch {
    return { ok: false, error: "Нет соединения." };
  }
}

export async function fetchMiniAppHistoryDocument(
  historyId: string
): Promise<{ ok: true; doc: Record<string, unknown> } | { ok: false; error: string }> {
  const token = getMiniAppSessionToken();
  if (!token) return { ok: false, error: "Нет сессии." };
  try {
    const res = await fetch(
      `/api/telegram/miniapp-history?historyId=${encodeURIComponent(historyId)}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok || data.ok !== true) {
      return { ok: false, error: "Не удалось открыть расчёт." };
    }
    const doc = data.doc;
    if (!doc || typeof doc !== "object") {
      return { ok: false, error: "Пустой ответ." };
    }
    return { ok: true, doc: doc as Record<string, unknown> };
  } catch {
    return { ok: false, error: "Нет соединения." };
  }
}

export async function saveMiniAppCalculation(
  payload: Record<string, unknown>
): Promise<{ ok: true; id: string; total: number } | { ok: false; error: string }> {
  const token = getMiniAppSessionToken();
  if (!token) {
    return { ok: false, error: "Нет сессии Mini App." };
  }
  try {
    const res = await fetch("/api/telegram/miniapp-calculation-save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok || data.ok !== true) {
      return { ok: false, error: "Не удалось сохранить расчёт." };
    }
    return {
      ok: true,
      id: String(data.id ?? ""),
      total: Number(data.total) || 0,
    };
  } catch {
    return { ok: false, error: "Нет соединения с сервером." };
  }
}
