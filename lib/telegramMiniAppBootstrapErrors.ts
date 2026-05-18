/** Сообщения для пользователя Mini App по коду ошибки API bootstrap. */
export function mapMiniAppBootstrapError(params: {
  status: number;
  error?: string;
  message?: string;
}): string {
  const msg = typeof params.message === "string" ? params.message.trim() : "";
  if (msg) return msg;

  const code = String(params.error ?? "");
  if (code === "firestore_quota" || params.status === 503) {
    return "Сервис временно перегружен. Попробуйте позже.";
  }
  if (
    code === "invalid_init_data" ||
    code === "hash_mismatch" ||
    code === "missing_auth_date" ||
    code === "auth_date_expired" ||
    params.status === 401
  ) {
    return "Ошибка проверки Telegram-сессии. Закройте Mini App и откройте снова из бота.";
  }
  if (code === "telegram_lookup_ambiguous" || params.status === 409) {
    return "Конфликт привязки Telegram. Напишите в поддержку.";
  }
  if (params.status === 0 || params.status >= 500) {
    return "Ошибка соединения с сервером. Проверьте сеть и повторите.";
  }
  return "Не удалось войти через Telegram.";
}
