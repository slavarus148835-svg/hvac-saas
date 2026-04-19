import type { ActionCodeSettings, User } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { needsEmailCodeVerification as needsEmailCodeVerificationCore } from "@/lib/emailVerificationGate";

/** Редирект со старого URL `/verify-email` задаётся в `next.config.ts`. */
export const VERIFY_EMAIL_PATH = "/verify-email-code" as const;
export const VERIFY_EMAIL_CODE_PATH = "/verify-email-code" as const;
export const LOGIN_PATH = "/login" as const;

/** Базовый URL приложения (только на клиенте). */
export function getClientPublicAppBaseUrl(): string {
  if (typeof window === "undefined") {
    throw new Error("getClientPublicAppBaseUrl: только на клиенте");
  }
  const origin = window.location.origin;
  const envRaw = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");
  if (!envRaw) return origin;
  try {
    const envHost = new URL(envRaw).host;
    const curHost = new URL(origin).host;
    if (envHost !== curHost) return origin;
    return envRaw;
  } catch {
    return origin;
  }
}

export const SESSION_EMAIL_JUST_VERIFIED_KEY = "hvac_email_just_verified";

/** @deprecated оставлено для совместимости sessionStorage */
export const SESSION_EMAIL_VERIFICATION_SEND_ERROR_KEY =
  "hvac_email_verification_send_error";

export const SESSION_EMAIL_VER_LAST_SEND_AT_KEY = "hvac_email_ver_last_send_at";

/** @deprecated */
export const SESSION_EMAIL_RESEND_COOLDOWN_AT_KEY = "hvac_email_resend_cooldown_at";

export function recordVerificationEmailSentAtNow(): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SESSION_EMAIL_VER_LAST_SEND_AT_KEY, String(Date.now()));
}

export const EMAIL_VERIFICATION_RESEND_COOLDOWN_SEC = 60;

export function getVerificationResendCooldownLeftSec(): number {
  if (typeof window === "undefined") return 0;
  let raw = sessionStorage.getItem(SESSION_EMAIL_VER_LAST_SEND_AT_KEY);
  if (!raw) {
    const legacy = sessionStorage.getItem(SESSION_EMAIL_RESEND_COOLDOWN_AT_KEY);
    if (legacy) {
      sessionStorage.removeItem(SESSION_EMAIL_RESEND_COOLDOWN_AT_KEY);
      sessionStorage.setItem(SESSION_EMAIL_VER_LAST_SEND_AT_KEY, legacy);
      raw = legacy;
    }
  }
  if (!raw) return 0;
  const ts = Number(raw);
  if (!Number.isFinite(ts) || ts <= 0) return 0;
  const elapsed = Math.floor((Date.now() - ts) / 1000);
  return Math.max(0, EMAIL_VERIFICATION_RESEND_COOLDOWN_SEC - elapsed);
}

/**
 * Нужно ли ввести код: только по Firestore `emailVerifiedByCode` (не по ссылке Firebase).
 */
export function needsEmailCodeVerification(
  user: User | null,
  profile: { emailVerifiedByCode?: boolean } | undefined | null
): boolean {
  return needsEmailCodeVerificationCore(user, profile);
}

export type SyncUserAuthMirrorOptions = {
  setVerifiedTimestamp?: boolean;
};

export async function syncUserAuthMirrorToFirestore(
  user: User,
  options?: SyncUserAuthMirrorOptions
): Promise<void> {
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    uid: user.uid,
    email: user.email ?? "",
    emailVerified: user.emailVerified,
    updatedAt: now,
  };
  if (user.emailVerified && options?.setVerifiedTimestamp) {
    payload.emailVerifiedAt = now;
  }
  await setDoc(doc(db, "users", user.uid), payload, { merge: true });
}

/** Сброс пароля: редирект на вход. */
export function getPasswordResetActionCodeSettings(): ActionCodeSettings {
  const base = getClientPublicAppBaseUrl();
  return {
    url: `${base}${LOGIN_PATH}`,
    handleCodeInApp: false,
  };
}

export function firebaseAuthErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code: string }).code);
    switch (code) {
      case "auth/too-many-requests":
        return (
          "Слишком много попыток. Подождите и попробуйте снова."
        );
      case "auth/unauthorized-domain":
        return "Домен не разрешён для Firebase Auth.";
      case "auth/network-request-failed":
        return "Проблема с сетью.";
      case "auth/user-token-expired":
      case "auth/invalid-user-token":
        return "Сессия устарела. Выйдите и войдите снова.";
      case "auth/user-disabled":
        return "Аккаунт отключён.";
      case "auth/invalid-email":
        return "Некорректный email.";
      case "auth/user-not-found":
        return "Аккаунта с таким email не найдено.";
      case "auth/missing-email":
        return "Укажите email.";
      case "auth/weak-password":
      case "auth/password-does-not-meet-requirements":
        return "Пароль слишком слабый.";
      case "auth/email-already-in-use":
        return "Этот email уже зарегистрирован.";
      case "auth/invalid-credential":
        return "Неверный email или пароль.";
      case "auth/invalid-api-key":
        return "Неверный API-ключ Firebase.";
      case "auth/app-not-authorized":
        return "Приложение не разрешено для ключа Firebase.";
      case "auth/operation-not-allowed":
        return "Вход по email/password отключён в консоли Firebase.";
      case "permission-denied":
        return "Нет доступа к базе (Firestore rules).";
      default:
        if (code.startsWith("auth/")) {
          return `Ошибка авторизации (${code}).`;
        }
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Произошла ошибка. Попробуйте ещё раз.";
}

export function firebaseAuthErrorMessageWithCode(error: unknown): string {
  const base = firebaseAuthErrorMessage(error);
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code: string }).code);
    if (code) return `${base} [${code}]`;
  }
  return base;
}
