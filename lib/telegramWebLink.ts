import { auth } from "@/lib/firebase";

export type CreateTelegramLinkTokenResult =
  | { ok: true; linkUrl: string; expiresAt: string }
  | { ok: false; message: string };

/**
 * Создать одноразовую ссылку для привязки Telegram к текущему web-аккаунту.
 */
export async function createTelegramWebLinkToken(): Promise<CreateTelegramLinkTokenResult> {
  const user = auth.currentUser;
  if (!user) {
    return { ok: false, message: "Войдите в аккаунт на сайте." };
  }

  let idToken: string;
  try {
    idToken = await user.getIdToken(true);
  } catch {
    return { ok: false, message: "Не удалось проверить сессию. Войдите снова." };
  }

  try {
    const res = await fetch("/api/telegram/create-link-token", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      linkUrl?: string;
      expiresAt?: string;
      error?: string;
    };
    if (!res.ok || !data.ok || !data.linkUrl) {
      return {
        ok: false,
        message: "Не удалось создать ссылку. Попробуйте позже.",
      };
    }
    return {
      ok: true,
      linkUrl: data.linkUrl,
      expiresAt: String(data.expiresAt || ""),
    };
  } catch {
    return { ok: false, message: "Нет соединения с сервером." };
  }
}
