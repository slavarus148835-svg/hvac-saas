export type TelegramMiniAppProfile = {
  uid?: string;
  email?: string;
  plan?: string;
  hasPaid?: boolean;
  blocked?: boolean;
  telegramUserId?: string;
  telegramId?: string;
  telegramUsername?: string;
};

export type TelegramMiniAppAuthResult = {
  ok: boolean;
  profile?: TelegramMiniAppProfile;
  need_registration?: boolean;
  error?: string;
};

function mapProfile(raw: Record<string, unknown>): TelegramMiniAppProfile {
  return {
    uid: typeof raw.uid === "string" ? raw.uid : undefined,
    email:
      typeof raw.email === "string" && raw.email.trim()
        ? raw.email
        : undefined,
    plan:
      typeof raw.plan === "string" && raw.plan.trim()
        ? raw.plan
        : undefined,
    hasPaid: raw.hasPaid === true,
    blocked: raw.blocked === true,
    telegramUserId:
      typeof raw.telegramUserId === "string" ? raw.telegramUserId : undefined,
    telegramId:
      typeof raw.telegramId === "string" ? raw.telegramId : undefined,
    telegramUsername:
      typeof raw.telegramUsername === "string"
        ? raw.telegramUsername
        : undefined,
  };
}

function friendlyError(status: number, code?: string): string {
  if (status === 401) {
    return "Не удалось подтвердить данные Telegram. Закройте Mini App и откройте снова из бота.";
  }
  if (status === 503) {
    return "Сервис временно недоступен. Попробуйте позже.";
  }
  if (status === 400) {
    return "Запрос не принят. Обновите страницу.";
  }
  if (status >= 500) {
    return "На сервере ошибка. Попробуйте позже.";
  }
  if (code === "invalid_init_data") {
    return "Сессия Telegram недействительна. Откройте страницу из бота ещё раз.";
  }
  return "Что-то пошло не так. Попробуйте позже.";
}

/**
 * Проверка initData на сервере и поиск связанного профиля в Firestore.
 */
export async function authTelegramMiniApp(
  initData: string
): Promise<TelegramMiniAppAuthResult> {
  const trimmed = typeof initData === "string" ? initData.trim() : "";
  if (!trimmed) {
    return {
      ok: false,
      error:
        "Нет данных входа из Telegram. Откройте эту страницу из бота (Mini App).",
    };
  }

  try {
    const res = await fetch("/api/telegram/miniapp-auth", {
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

    if (data.need_registration === true) {
      return { ok: true, need_registration: true };
    }

    const profileRaw = data.profile;
    if (
      profileRaw &&
      typeof profileRaw === "object" &&
      !Array.isArray(profileRaw)
    ) {
      return {
        ok: true,
        profile: mapProfile(profileRaw as Record<string, unknown>),
      };
    }

    if (!res.ok) {
      const code =
        typeof data.error === "string" ? data.error : undefined;
      return {
        ok: false,
        error: friendlyError(res.status, code),
      };
    }

    return {
      ok: false,
      error: "Не удалось разобрать ответ сервера.",
    };
  } catch {
    return {
      ok: false,
      error: "Нет соединения с сервером. Проверьте интернет и попробуйте снова.",
    };
  }
}
