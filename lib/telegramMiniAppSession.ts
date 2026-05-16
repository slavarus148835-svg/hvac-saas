import type { TelegramMiniAppProfile } from "@/lib/telegramMiniAppAuth";

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
  error?: string;
};

export async function createMiniAppSession(
  initData: string
): Promise<CreateMiniAppSessionResult> {
  const trimmed = typeof initData === "string" ? initData.trim() : "";
  if (!trimmed) {
    return {
      ok: false,
      error:
        "Нет данных Telegram. Откройте страницу из бота (Mini App).",
    };
  }

  try {
    const res = await fetch("/api/telegram/miniapp-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: trimmed }),
      cache: "no-store",
    });

    let data: Record<string, unknown> = {};
    try {
      const parsed = (await res.json()) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        data = parsed as Record<string, unknown>;
      }
    } catch {
      return {
        ok: false,
        error: "Сервер вернул непонятный ответ. Попробуйте позже.",
      };
    }

    if (
      res.status === 404 &&
      data.need_email_linking === true
    ) {
      return {
        ok: true,
        need_email_linking: true,
      };
    }

    if (res.status === 409 && data.authStatus === "duplicate_blocked") {
      return {
        ok: false,
        error:
          "Конфликт данных Telegram. Откройте Mini App из бота ещё раз или напишите в поддержку.",
      };
    }

    if (!res.ok) {
      if (res.status === 401) {
        return {
          ok: false,
          error:
            "Не удалось подтвердить данные Telegram. Закройте Mini App и откройте снова из бота.",
        };
      }
      if (res.status === 503) {
        return {
          ok: false,
          error: "Сервис временно недоступен. Попробуйте позже.",
        };
      }
      if (res.status >= 500) {
        return {
          ok: false,
          error: "На сервере ошибка. Попробуйте позже.",
        };
      }
      return {
        ok: false,
        error: "Не удалось создать сессию. Обновите страницу.",
      };
    }

    if (data.ok === true && typeof data.sessionToken === "string") {
      const token = data.sessionToken.trim();
      if (token) {
        saveMiniAppSessionToken(token);
      }
      const profile = mapApiProfile(data.profile);
      if (profile) {
        return { ok: true, profile };
      }
      return {
        ok: false,
        error: "Сессия создана, но профиль не получен. Попробуйте снова.",
      };
    }

    return {
      ok: false,
      error: "Не удалось создать сессию. Попробуйте позже.",
    };
  } catch {
    return {
      ok: false,
      error:
        "Нет соединения с сервером. Проверьте интернет и попробуйте снова.",
    };
  }
}

export type GetMiniAppMeResult = {
  ok: boolean;
  profile?: TelegramMiniAppProfile;
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
        return { ok: true, profile, status: res.status };
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
  | { status: "profile"; profile: TelegramMiniAppProfile }
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
      return { status: "profile", profile: me.profile };
    }
  }

  const init = typeof initData === "string" ? initData.trim() : "";
  if (!init) {
    return { status: "no_init" };
  }

  const created = await createMiniAppSession(init);
  if (created.ok && created.profile) {
    return { status: "profile", profile: created.profile };
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
