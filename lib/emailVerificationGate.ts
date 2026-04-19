/**
 * Допуск в приложение только после Firestore `emailVerifiedByCode === true`.
 * Флаг Firebase Auth `emailVerified` (ссылка из письма Firebase) не используется.
 */
export function needsEmailCodeVerification(
  user: { emailVerified: boolean } | null,
  profile: { emailVerifiedByCode?: boolean } | undefined | null
): boolean {
  if (user === null) return false;
  return profile?.emailVerifiedByCode !== true;
}
