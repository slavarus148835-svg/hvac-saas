import type { CalculatorPriceList } from "@/lib/calculator";
import type { UserCustomService } from "@/lib/customServices";
import { getMiniAppSessionToken } from "@/lib/telegramMiniAppSession";

export type MiniAppCalculatorTextSettings = {
  quoteFooterTemplate: string;
  guaranteeText: string;
  masterContact: string;
};

export type MiniAppCalculatorContextResponse = {
  ok: true;
  prices: CalculatorPriceList;
  giftRouteMeters: number;
  models: { id: string; name: string; price: number }[];
  customServices: UserCustomService[];
  textSettings: MiniAppCalculatorTextSettings;
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
    const rawTs = data.textSettings;
    const textSettings: MiniAppCalculatorTextSettings =
      rawTs && typeof rawTs === "object" && !Array.isArray(rawTs)
        ? {
            quoteFooterTemplate: String(
              (rawTs as Record<string, unknown>).quoteFooterTemplate ?? ""
            ),
            guaranteeText: String((rawTs as Record<string, unknown>).guaranteeText ?? ""),
            masterContact: String((rawTs as Record<string, unknown>).masterContact ?? ""),
          }
        : { quoteFooterTemplate: "", guaranteeText: "", masterContact: "" };
    return {
      ok: true,
      prices: data.prices as CalculatorPriceList,
      giftRouteMeters: Number(data.giftRouteMeters) || 1,
      models: Array.isArray(data.models) ? (data.models as MiniAppCalculatorContextResponse["models"]) : [],
      customServices: Array.isArray(data.customServices)
        ? (data.customServices as UserCustomService[])
        : [],
      textSettings,
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
  roomCount?: number;
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

export type MiniAppPriceFormApi = {
  ok: true;
  form: Record<string, string>;
  giftRouteMeters: number;
  hasSavedPriceList: boolean;
};

export async function fetchMiniAppPriceForm(): Promise<
  MiniAppPriceFormApi | { ok: false; error: string }
> {
  const token = getMiniAppSessionToken();
  if (!token) return { ok: false, error: "Нет сессии." };
  try {
    const res = await fetch("/api/telegram/miniapp-price", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok || data.ok !== true) {
      return { ok: false, error: "Не удалось загрузить прайс." };
    }
    const form = data.form;
    return {
      ok: true,
      form:
        form && typeof form === "object" && !Array.isArray(form)
          ? (form as Record<string, string>)
          : {},
      giftRouteMeters: Number(data.giftRouteMeters) || 1,
      hasSavedPriceList: data.hasSavedPriceList === true,
    };
  } catch {
    return { ok: false, error: "Нет соединения." };
  }
}

export async function saveMiniAppPriceForm(payload: {
  prices: Record<string, number | string>;
  giftRouteMeters?: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = getMiniAppSessionToken();
  if (!token) return { ok: false, error: "Нет сессии." };
  try {
    const res = await fetch("/api/telegram/miniapp-price", {
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
      return { ok: false, error: "Не удалось сохранить прайс." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Нет соединения." };
  }
}

export type MiniAppModelRow = {
  id: string;
  name: string;
  price: number;
  capacityKw: string;
  comment: string;
};

export async function fetchMiniAppModels(): Promise<
  { ok: true; models: MiniAppModelRow[] } | { ok: false; error: string }
> {
  const token = getMiniAppSessionToken();
  if (!token) return { ok: false, error: "Нет сессии." };
  try {
    const res = await fetch("/api/telegram/miniapp-models", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok || data.ok !== true) {
      return { ok: false, error: "Не удалось загрузить модели." };
    }
    return {
      ok: true,
      models: Array.isArray(data.models) ? (data.models as MiniAppModelRow[]) : [],
    };
  } catch {
    return { ok: false, error: "Нет соединения." };
  }
}

export async function createMiniAppModel(body: {
  name: string;
  price: number;
  capacityKw?: string;
  comment?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const token = getMiniAppSessionToken();
  if (!token) return { ok: false, error: "Нет сессии." };
  try {
    const res = await fetch("/api/telegram/miniapp-models", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok || data.ok !== true) {
      return { ok: false, error: "Не удалось добавить модель." };
    }
    return { ok: true, id: String(data.id ?? "") };
  } catch {
    return { ok: false, error: "Нет соединения." };
  }
}

export async function updateMiniAppModel(
  body: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = getMiniAppSessionToken();
  if (!token) return { ok: false, error: "Нет сессии." };
  try {
    const res = await fetch("/api/telegram/miniapp-models", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok || data.ok !== true) {
      return { ok: false, error: "Не удалось сохранить модель." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Нет соединения." };
  }
}

export async function deleteMiniAppModel(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = getMiniAppSessionToken();
  if (!token) return { ok: false, error: "Нет сессии." };
  try {
    const res = await fetch(`/api/telegram/miniapp-models?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok || data.ok !== true) {
      return { ok: false, error: "Не удалось удалить модель." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Нет соединения." };
  }
}

export type MiniAppSettingsApi = {
  ok: true;
  giftRouteMeters: number;
  quoteFooterTemplate: string;
  guaranteeText: string;
  masterContact: string;
};

export async function fetchMiniAppSettings(): Promise<
  MiniAppSettingsApi | { ok: false; error: string }
> {
  const token = getMiniAppSessionToken();
  if (!token) return { ok: false, error: "Нет сессии." };
  try {
    const res = await fetch("/api/telegram/miniapp-settings", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok || data.ok !== true) {
      return { ok: false, error: "Не удалось загрузить настройки." };
    }
    return {
      ok: true,
      giftRouteMeters: Number(data.giftRouteMeters) || 1,
      quoteFooterTemplate: String(data.quoteFooterTemplate ?? ""),
      guaranteeText: String(data.guaranteeText ?? ""),
      masterContact: String(data.masterContact ?? ""),
    };
  } catch {
    return { ok: false, error: "Нет соединения." };
  }
}

export async function patchMiniAppSettings(payload: {
  giftRouteMeters?: number;
  quoteFooterTemplate?: string;
  guaranteeText?: string;
  masterContact?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = getMiniAppSessionToken();
  if (!token) return { ok: false, error: "Нет сессии." };
  try {
    const res = await fetch("/api/telegram/miniapp-settings", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok || data.ok !== true) {
      return { ok: false, error: "Не удалось сохранить настройки." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Нет соединения." };
  }
}

export type MiniAppMeAccount = {
  trialEndsAt: string | null;
  paidAt: string | null;
  subscriptionStatus: string | null;
};

export async function fetchMiniAppMeAccount(): Promise<
  { ok: true; account: MiniAppMeAccount } | { ok: false; error: string }
> {
  const token = getMiniAppSessionToken();
  if (!token) return { ok: false, error: "Нет сессии." };
  try {
    const res = await fetch("/api/telegram/miniapp-me", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok || data.ok !== true) {
      return { ok: false, error: "Не удалось загрузить профиль." };
    }
    const p = data.profile;
    const pr = p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
    return {
      ok: true,
      account: {
        trialEndsAt: typeof pr.trialEndsAt === "string" ? pr.trialEndsAt : null,
        paidAt: typeof pr.paidAt === "string" ? pr.paidAt : null,
        subscriptionStatus:
          typeof pr.subscriptionStatus === "string" ? pr.subscriptionStatus : null,
      },
    };
  } catch {
    return { ok: false, error: "Нет соединения." };
  }
}
