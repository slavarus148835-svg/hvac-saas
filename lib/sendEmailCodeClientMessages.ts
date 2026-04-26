/**
 * Тексты для UI по JSON ответу POST /api/auth/send-email-code.
 * Без секретов: показываем error + безопасный detail с сервера.
 */
export function formatSendEmailCodeApiError(parsed: {
  error?: string;
  detail?: string;
  retryAfterSec?: number;
}): string {
  const { error, detail, retryAfterSec } = parsed;
  switch (error) {
    case "missing_email_code_pepper":
      return "Не задан секрет EMAIL_CODE_PEPPER на сервере";
    case "missing_email_env":
      return "Не настроен почтовый сервис (нужен полный SMTP или RESEND_API_KEY)";
    case "no_mail_provider":
      return "Не настроена отправка почты: задайте SMTP (Gmail и т.п.) или RESEND_API_KEY";
    case "missing_smtp_env":
      return "Заданы не все переменные SMTP (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM)";
    case "smtp_env_incomplete":
    case "smtp_unavailable":
      return detail
        ? `Неполные или неверные настройки SMTP: ${detail}`
        : "Неполные или неверные настройки SMTP (проверьте переменные на сервере)";
    case "server_unavailable":
      return detail
        ? `Сервер временно недоступен (${detail})`
        : "Сервер временно недоступен. Попробуйте позже.";
    case "send_failed":
      return detail ? `Не удалось отправить письмо: ${detail}` : "Не удалось отправить письмо";
    case "missing_email_from":
      return "Не задан EMAIL_FROM (адрес отправителя для Resend/SMTP)";
    case "resend_provider_failed":
      return detail
        ? `Resend отклонил отправку (${detail})`
        : "Resend отклонил отправку";
    case "smtp_provider_failed":
      return detail
        ? `SMTP вернул ошибку (${detail})`
        : "SMTP вернул ошибку";
    case "rate_limited":
      return `Слишком частая повторная отправка. Подождите ${retryAfterSec ?? 60} с.`;
    case "unknown_send_code_error":
      return detail ? `Не удалось отправить код (${detail})` : "Не удалось отправить код";
    case "no_email":
      return "У аккаунта нет email";
    case "no_admin":
      return "Сервер временно недоступен (нет доступа к базе)";
    case "no_token":
    case "invalid_token":
      return "Сессия недействительна. Войдите снова.";
    default:
      if (error) {
        return detail ? `${error} (${detail})` : error;
      }
      return "Не удалось отправить код подтверждения";
  }
}
