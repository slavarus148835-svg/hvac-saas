import type { TelegramMiniAppProfile } from "@/lib/telegramMiniAppAuth";
import { mapMiniAppBootstrapError } from "@/lib/telegramMiniAppBootstrapErrors";
import {
  clearPendingRegistrationSessionId,
  savePendingRegistrationSessionId,
} from "@/lib/telegramMiniAppPending";
export const HVAC_TG_MINIAPP_SESSION_STORAGE_KEY = "hvac_tg_miniapp_session";

function mapApiProfile(raw: unknown): TelegramMiniAppProfile | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  return {
    uid: typeof o.uid === "string" ? o.uid : undefined,
    email:
      typeof o.email === "string" && o.email.trim() ? o.email : undefined,
    plan:
      typeof o.plan === "string" && o.plan.trim() ? o.plan : undefined,
    hasPaid: o.hasPaid === true,
    blocked: o.blocked === true,
    telegramUserId:
      typeof o.telegramUserId === "string" ? o.telegramUserId : undefined,
    telegramId:
      typeof o.telegramId === "string" ? o.telegramId : undefined,
    telegramUsername:
      typeof o.telegramUsername === "string"
        ? o.telegramUsername
        : undefined,
  };
}

export function getMiniAppSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(HVAC_TG_MINIAPP_SESSION_STORAGE_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function saveMiniAppSessionToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HVAC_TG_MINIAPP_SESSION_STORAGE_KEY, token.trim());
  } catch {
    /* */
  }
}

export function clearMiniAppSessionToken(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(HVAC_TG_MINIAPP_SESSION_STORAGE_KEY);
  } catch {
    /* */
  }
}

export type CreateMiniAppSessionResult = {
  ok: boolean;
  profile?: TelegramMiniAppProfile;
  need_registration?: boolean;
  need_email_linking?: boolean;
  pending_email_registration?: boolean;
  pendingSessionId?: string;
  accessAllowed?: boolean;
  accessGate?: string;
  emailVerifiedByCode?: boolean;
  error?: string;
};

function readStartParamFromInitData(initData: string): string {
  try {
    return String(new URLSearchParams(initData).get("start_param") || "").trim();
  } catch {
    return "";
  }
}

export async function bootstrapMiniApp(
  initData: string
): Promise<CreateMiniAppSessionResult> {
  const trimmed = typeof initData === "string" ? initData.trim() : "";
  if (!trimmed) {
    return {
      ok: false,
      error: "Нет данных Telegram. Откройте страницу из бота (Mini App).",
    };
  }

  const startParam = readStartParamFromInitData(trimmed);
  let linkToken: string | undefined;
  if (startParam.toLowerCase().startsWith("link_")) {
    linkToken = startParam.slice("link_".length);
  }

  try {
    const res = await fetch("/api/telegram/miniapp-bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: trimmed, linkToken }),
      cache: "no-store",
    });

    let data: Record<string, unknown> = {};
    try {
      const parsed = (await res.json()) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        data = parsed as Record<string, unknown>;
      }
    } catch {
      return { ok: false, error: "Сервер вернул непонятный ответ." };
    }

    if (data.ok === true && typeof data.sessionToken === "string") {
      const token = data.sessionToken.trim();
      if (token) saveMiniAppSessionToken(token);
      clearPendingRegistrationSessionId();
      const profile = mapApiProfile(data.profile);
      if (profile) {
        return {
          ok: true,
          profile,
          accessAllowed: data.accessAllowed === true,
          accessGate:
            typeof data.accessGate === "string" ? data.accessGate : undefined,
          emailVerifiedByCode: data.emailVerifiedByCode === true,
        };
      }
      return { ok: false, error: "Профиль не получен после входа." };
    }

    if (data.authStatus === "pending_email_registration") {
      const pendingSessionId =
        typeof data.pendingSessionId === "string" ? data.pendingSessionId.trim() : "";
      if (pendingSessionId) savePendingRegistrationSessionId(pendingSessionId);
      return {
        ok: true,
        pending_email_registration: true,
        pendingSessionId: pendingSessionId || undefined,
      };
    }

    if (res.status === 404 && data.need_email_linking === true) {
      return { ok: true, need_email_linking: true };
    }

    const mapped = mapMiniAppBootstrapError({
      status: res.status,
      error: typeof data.error === "string" ? data.error : undefined,
      message: typeof data.message === "string" ? data.message : undefined,
    });
    console.warn("[miniapp] bootstrap failed", {
      status: res.status,
      error: data.error,
      authStatus: data.authStatus,
    });
    return { ok: false, error: mapped };
  } catch (e) {
    console.warn("[miniapp] bootstrap network error", e);
    return {
      ok: false,
      error: mapMiniAppBootstrapError({ status: 0, error: "network" }),
    };
  }
}

/** @deprecated Используйте bootstrapMiniApp — оставлено для совместимости. */
export async function createMiniAppSession(
  initData: string
): Promise<CreateMiniAppSessionResult> {
  return bootstrapMiniApp(initData);
}

export type GetMiniAppMeResult = {
  ok: boolean;
  profile?: TelegramMiniAppProfile;
  accessAllowed?: boolean;
  accessGate?: string;
  emailVerifiedByCode?: boolean;
  error?: string;
  status?: number;
};

/**
 * GET /api/telegram/miniapp-me с Bearer-токеном из localStorage.
 * При 401 токен очищается.
 */
export async function getMiniAppMe(): Promise<GetMiniAppMeResult> {
  const token = getMiniAppSessionToken();
  if (!token) {
    return { ok: false, error: "Нет сохранённой сессии." };
  }

  try {
    const res = await fetch("/api/telegram/miniapp-me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    let data: Record<string, unknown> = {};
    try {
      const parsed = (await res.json()) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        data = parsed as Record<string, unknown>;
      }
    } catch {
      if (res.status === 401) {
        clearMiniAppSessionToken();
      }
      return {
        ok: false,
        error: "Не удалось прочитать ответ сервера.",
        status: res.status,
      };
    }

    if (res.status === 401) {
      clearMiniAppSessionToken();
      return {
        ok: false,
        error: "Сессия устарела. Войдите снова через Telegram.",
        status: 401,
      };
    }

    if (!res.ok) {
      if (res.status === 404) {
        clearMiniAppSessionToken();
      }
      return {
        ok: false,
        error:
          res.status === 404
            ? "Профиль не найден."
            : "Не удалось загрузить профиль.",
        status: res.status,
      };
    }

    if (data.ok === true) {
      const profile = mapApiProfile(data.profile);
      if (profile) {
        return {
          ok: true,
          profile,
          status: res.status,
          accessAllowed: data.accessAllowed === true,
          accessGate:
            typeof data.accessGate === "string" ? data.accessGate : undefined,
          emailVerifiedByCode: data.emailVerifiedByCode === true,
        };
      }
    }

    return {
      ok: false,
      error: "Не удалось разобрать профиль.",
      status: res.status,
    };
  } catch {
    return {
      ok: false,
      error: "Нет соединения с сервером.",
    };
  }
}

export type EnsureMiniAppProfileResult =
  | {
      status: "profile";
      profile: TelegramMiniAppProfile;
      accessAllowed?: boolean;
      accessGate?: string;
      emailVerifiedByCode?: boolean;
    }
  | { status: "pending_email_registration"; initData: string; pendingSessionId?: string }
  | { status: "need_registration" }
  | { status: "need_email_linking"; initData: string }
  | { status: "error"; message: string }
  | { status: "no_init" };

/**
 * Сначала проверяет сохранённую сессию (miniapp-me), затем при наличии initData создаёт новую.
 */
export async function ensureTelegramMiniAppProfile(
  initData: string | null
): Promise<EnsureMiniAppProfileResult> {
  if (getMiniAppSessionToken()) {
    const me = await getMiniAppMe();
    if (me.ok && me.profile) {
      return {
        status: "profile",
        profile: me.profile,
        accessAllowed: me.accessAllowed,
        accessGate: me.accessGate,
        emailVerifiedByCode: me.emailVerifiedByCode,
      };
    }
  }

  const init = typeof initData === "string" ? initData.trim() : "";
  if (!init) {
    return { status: "no_init" };
  }

  const created = await createMiniAppSession(init);
  if (created.ok && created.profile) {
    return {
      status: "profile",
      profile: created.profile,
      accessAllowed: created.accessAllowed,
      accessGate: created.accessGate,
      emailVerifiedByCode: created.emailVerifiedByCode,
    };
  }
  if (created.pending_email_registration) {
    return {
      status: "pending_email_registration",
      initData: init,
      pendingSessionId: created.pendingSessionId,
    };
  }
  if (created.need_email_linking) {
    return { status: "need_email_linking", initData: init };
  }
  if (created.need_registration) {
    return { status: "need_registration" };
  }
  return {
    status: "error",
    message: created.error ?? "Не удалось войти через Telegram.",
  };
}
