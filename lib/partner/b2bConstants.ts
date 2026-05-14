/** B2B менеджеры — отдельно от пользовательской рефералки (?ref= / referrerId). */

export const PARTNER_MANAGER_STORAGE_KEY = "hvac_b2b_partner_code";
export const PARTNER_MANAGER_FIRST_TOUCH_MS_KEY = "hvac_b2b_partner_first_touch_ms";

/** Префикс Telegram Mini App: `startapp=partner_CODE` */
export const PARTNER_MINIAPP_START_PREFIX = "partner_";

export const PARTNER_MANAGERS_COLLECTION = "partnerManagers";
export const PARTNER_EVENTS_COLLECTION = "partnerEvents";
/** Выплаты менеджерам (заполняется админом / будущим процессом). */
export const PARTNER_PAYOUTS_COLLECTION = "partnerPayouts";
/** Анкета саморегистрации менеджера в Telegram (server-only, docId = telegramUserId). */
export const PARTNER_MANAGER_SIGNUP_SESSIONS_COLLECTION = "partnerManagerSignupSessions";

/** НДС/налог с платежа (доля). */
export const B2B_PAYMENT_TAX_RATE = 0.12;

/** Доля комиссии менеджера от суммы после налога. */
export const B2B_MANAGER_COMMISSION_RATE = 0.3;
