/** Поля Firestore / профиля для проверки подтверждения email. */
export type EmailVerificationProfile = {
  emailVerifiedByCode?: boolean;
  emailVerified?: boolean;
  emailVerifiedAt?: string;
};

/**
 * Email считается подтверждённым для доступа Mini App и оплаты, если:
 * - введён код (emailVerifiedByCode), или
 * - legacy web-аккаунт с Firebase/Firestore emailVerified / emailVerifiedAt.
 */
export function isEmailVerificationSatisfied(
  profile: EmailVerificationProfile | null | undefined
): boolean {
  if (!profile) return false;
  if (profile.emailVerifiedByCode === true) return true;
  if (profile.emailVerified === true) return true;
  if (typeof profile.emailVerifiedAt === "string" && profile.emailVerifiedAt.trim()) {
    return true;
  }
  return false;
}
