/** Коллекция только для Admin SDK; клиентам недоступна (см. firestore.rules). */
export const EMAIL_VERIFICATION_CODES_COLLECTION = "emailVerificationCodes";

export const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;
export const EMAIL_CODE_RESEND_COOLDOWN_MS = 60 * 1000;
