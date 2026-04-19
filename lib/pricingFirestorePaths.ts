/**
 * Пути клиентского Firestore для страницы прайса.
 * Должны совпадать с firestore.rules (users, users/.../models, priceLists).
 */
export const PRICING_FS = {
  users: "users",
  priceLists: "priceLists",
  modelsSubcollection: "models",
} as const;
