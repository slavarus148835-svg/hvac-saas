/**
 * Пути клиентского Firestore для страницы прайса.
 * Должны совпадать с firestore.rules (users, users/.../models, priceLists).
 */
export const PRICING_FS = {
  users: "users",
  priceLists: "priceLists",
  modelsSubcollection: "models",
  /** Анти-потери: только Admin SDK (см. firestore.rules). */
  leads: "leads",
  /** Сессии входа через Telegram-бота (server-only). */
  telegramLoginSessions: "telegram_login_sessions",
} as const;
