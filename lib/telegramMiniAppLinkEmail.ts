import type { TelegramMiniAppProfile } from "@/lib/telegramMiniAppAuth";
import { saveMiniAppSessionToken } from "@/lib/telegramMiniAppSession";

export type LinkMiniAppEmailResult =
  | { ok: true; profile: TelegramMiniAppProfile; authStatus: string }
  | {
      ok: false;
      error: string;
      authStatus?: string;
    };

function mapProfile(raw: unknown): TelegramMiniAppProfile | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  return {
    uid: typeof o.uid === "string" ? o.uid : undefined,
    email:
      typeof o.email === "string" && o.email.trim() ? o.email : undefined,
    plan: typeof o.plan === "string" && o.plan.trim() ? o.plan : undefined,
    hasPaid: o.hasPaid === true,
    blocked: o.blocked === true,
    telegramUserId:
      typeof o.telegramUserId === "string" ? o.telegramUserId : undefined,
    telegramId: typeof o.telegramId === "string" ? o.telegramId : undefined,
    telegramUsername:
      typeof o.telegramUsername === "string" ? o.telegramUsername : undefined,
  };
}

/**
 * Привязка Telegram Mini App к существующему email-аккаунту (сервер проверяет initData и email).
 */
export async function linkTelegramMiniAppByEmail(
  initData: string,
  email: string
): Promise<LinkMiniAppEmailResult> {
  const trimmedInit = typeof initData === "string" ? initData.trim() : "";
  if (!trimmedInit) {
    return { ok: false, error: "Нет данных Telegram (initData)." };
  }

  try {
    const res = await fetch("/api/telegram/miniapp-link-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: trimmedInit, email }),
      cache: "no-store",
    });

    let data: Record<string, unknown> = {};
    try {
      const parsed = (await res.json()) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        data = parsed as Record<string, unknown>;
      }
    } catch {
      return { ok: false, error: "Не удалось разобрать ответ сервера." };
    }

    if (res.status === 409) {
      return {
        ok: false,
        error:
          "Этот Telegram уже привязан к другому профилю или конфликт данных. Обратитесь в поддержку.",
        authStatus: typeof data.authStatus === "string" ? data.authStatus : undefined,
      };
    }

    if (res.status === 404) {
      const msg =
        typeof data.message === "string" && data.message.trim()
          ? data.message
          : "Email не найден. Сначала зарегистрируйтесь на сайте.";
      return {
        ok: false,
        error: msg,
        authStatus: typeof data.authStatus === "string" ? data.authStatus : undefined,
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        error: "Не удалось привязать аккаунт. Попробуйте позже.",
      };
    }

    if (data.ok === true && typeof data.sessionToken === "string") {
      const token = data.sessionToken.trim();
      if (token) saveMiniAppSessionToken(token);
      const profile = mapProfile(data.profile);
      if (profile) {
        return {
          ok: true,
          profile,
          authStatus: String(data.authStatus ?? "existing_user_linked_by_email"),
        };
      }
    }

    return { ok: false, error: "Неожиданный ответ сервера." };
  } catch {
    return { ok: false, error: "Нет соединения с сервером." };
  }
}
