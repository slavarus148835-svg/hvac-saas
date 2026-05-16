/**
 * Сообщения UI для ответа POST /api/auth/pre-register-check.
 */
export function formatPreRegisterCheckError(parsed: {
  ok?: boolean;
  reason?: string;
  message?: string;
  error?: string;
}): string {
  if (typeof parsed.message === "string" && parsed.message.trim()) {
    return parsed.message.trim();
  }

  const reason = String(parsed.reason || parsed.error || "").trim();
  switch (reason) {
    case "email_in_firebase_auth":
      return "Аккаунт с этим email уже есть. Войдите по email.";
    case "email_in_firestore_with_auth":
    case "email_already_registered":
      return "Этот email уже зарегистрирован. Войдите или восстановите доступ.";
    case "telegram_account_use_login":
      return "Сначала завершите вход через Telegram или обновите страницу и зарегистрируйтесь по email.";
    case "invalid_email":
      return "Укажите корректный email.";
    case "server_misconfigured":
    case "internal_error":
    case "no_admin":
      return "Ошибка регистрации. Попробуйте позже или напишите в поддержку.";
    case "orphan_firestore_profile":
      return "Регистрация временно заблокирована. Напишите в поддержку.";
    default:
      return "Ошибка регистрации. Попробуйте позже или напишите в поддержку.";
  }
}
