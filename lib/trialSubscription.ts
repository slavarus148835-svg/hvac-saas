import {
  doc,
  getDocFromServer,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import type { Feature } from "@/lib/access";
import { db } from "@/lib/firebase";

export type SubscriptionStatus =
  | "trial_pending"
  | "trial_active"
  | "subscribed"
  | "expired";

export type UserTrialFields = {
  blocked?: boolean;
  email?: string;
  /** Подтверждение почты 6-значным кодом (серверный flow). */
  emailVerifiedByCode?: boolean;
  plan?: string;
  paidUntil?: unknown;
  trialStartedAt?: unknown;
  trialEndsAt?: unknown;
  firstCalculationAt?: unknown;
  subscriptionStatus?: string;
  trialDays?: number;
  createdAt?: unknown;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const TRIAL_DAYS = 15;
const TRIAL_MS = TRIAL_DAYS * MS_PER_DAY;
export const TRIAL_WARNING_DAYS = 3;

/**
 * Приводит значение времени из Firestore к миллисекундам.
 * Учитывает Timestamp, число, строку с цифрами (часто Date.parse даёт NaN), plain { seconds }.
 */
export function firestoreTimeToMs(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number" && Number.isFinite(value)) {
    const n = value;
    // >= 1e11 — однозначно ms с ~1973 г.; иначе 1e9…1e10 часто секунды Unix.
    if (n >= 1e11) return Math.round(n);
    if (n >= 1e9) return Math.round(n * 1000);
    return n;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "toMillis" in value &&
    typeof (value as { toMillis: () => number }).toMillis === "function"
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "seconds" in value &&
    typeof (value as { seconds: unknown }).seconds === "number" &&
    Number.isFinite((value as { seconds: number }).seconds)
  ) {
    const s = (value as { seconds: number }).seconds;
    const ns =
      "nanoseconds" in value && typeof (value as { nanoseconds: number }).nanoseconds === "number"
        ? (value as { nanoseconds: number }).nanoseconds
        : 0;
    return s * 1000 + Math.floor(ns / 1e6);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      const n = Number(trimmed);
      if (Number.isFinite(n)) {
        if (n >= 1e11) return Math.round(n);
        if (n >= 1e9) return Math.round(n * 1000);
        return n;
      }
    }
    const t = Date.parse(trimmed);
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

export function trialStartedMs(user: UserTrialFields | null | undefined): number {
  return firestoreTimeToMs(user?.trialStartedAt);
}

export function trialEndsMs(user: UserTrialFields | null | undefined): number {
  return firestoreTimeToMs(user?.trialEndsAt);
}

/**
 * Эффективный конец trial: приоритет у явного trialEndsAt (если распарсился > 0);
 * иначе trialStartedAt + trialDays; если нет старта — createdAt + trialDays.
 */
export function getTrialEndMs(user: UserTrialFields | null | undefined): number {
  if (!user) return 0;
  const explicit = trialEndsMs(user);
  if (explicit > 0) return explicit;

  const days =
    typeof user.trialDays === "number" && Number.isFinite(user.trialDays) && user.trialDays > 0
      ? user.trialDays
      : TRIAL_DAYS;

  const started = trialStartedMs(user);
  if (started > 0) {
    return started + days * MS_PER_DAY;
  }

  const created = firestoreTimeToMs(user.createdAt);
  if (created > 0) {
    return created + days * MS_PER_DAY;
  }
  return 0;
}

export function isPaidActive(user: UserTrialFields | null | undefined): boolean {
  if (!user) return false;
  const paidMs = firestoreTimeToMs(user.paidUntil);
  const paid = paidMs > 0 ? paidMs : Number((user as { paidUntil?: number }).paidUntil || 0);
  return paid > Date.now() && (user.plan === "standard" || user.plan === "pro");
}

/** Пробный период ещё не «запущен» (нет первого сохранённого расчёта), доступ разрешён только если trial не истёк. */
export function isTrialPending(user: UserTrialFields | null | undefined): boolean {
  if (!user) return false;
  if (isPaidActive(user)) return false;
  if (user.plan !== "trial") return false;
  if (isTrialExpired(user)) return false;
  const started = trialStartedMs(user);
  return started === 0;
}

export function isTrialRunning(user: UserTrialFields | null | undefined): boolean {
  if (!user || isPaidActive(user)) return false;
  if (user.plan !== "trial") return false;
  if (isTrialExpired(user)) return false;
  const started = trialStartedMs(user);
  const endMs = getTrialEndMs(user);
  return started > 0 && endMs > 0 && endMs > Date.now();
}

/**
 * Истёкший trial: при plan === "trial" — конец по getTrialEndMs()
 * (явный trialEndsAt приоритетнее, иначе started/created + trialDays).
 */
export function isTrialExpired(user: UserTrialFields | null | undefined): boolean {
  if (!user || isPaidActive(user)) return false;
  if (user.plan === "trial") {
    const endMs = getTrialEndMs(user);
    return endMs > 0 && endMs <= Date.now();
  }
  const started = trialStartedMs(user);
  const ends = trialEndsMs(user);
  return started > 0 && ends > 0 && ends <= Date.now();
}

export function trialDaysRemaining(
  user: UserTrialFields | null | undefined
): number | null {
  if (!user || user.plan !== "trial" || isPaidActive(user)) return null;
  if (isTrialExpired(user)) return 0;
  const endMs = getTrialEndMs(user);
  if (!endMs) return null;
  const diff = endMs - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / MS_PER_DAY);
}

export function paidPeriodEndsMs(user: UserTrialFields | null | undefined): number {
  if (!user) return 0;
  return firestoreTimeToMs(user.paidUntil);
}

/** Сколько полных суток осталось до конца оплаченного периода (только при активной оплате). */
export function paidDaysRemainingWhileActive(
  user: UserTrialFields | null | undefined
): number | null {
  if (!user || !isPaidActive(user)) return null;
  const ends = paidPeriodEndsMs(user);
  if (!ends) return null;
  const diff = ends - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / MS_PER_DAY);
}

/** Был оплаченный план, срок вышел, доступ по оплате не активен. */
export function isPaidSubscriptionLapsed(user: UserTrialFields | null | undefined): boolean {
  if (!user || isPaidActive(user)) return false;
  if (user.plan !== "standard" && user.plan !== "pro") return false;
  const ends = paidPeriodEndsMs(user);
  if (!ends) return false;
  return ends < Date.now();
}

/** Показывать секции оплаты / цену / CTA в кабинете и на /billing. */
export function shouldPromoteBilling(user: UserTrialFields | null | undefined): boolean {
  if (!user || user.blocked) return false;
  if (isPaidActive(user)) return false;
  if (isTrialExpired(user)) return true;
  if (isTrialPending(user)) return false;
  const left = trialDaysRemaining(user);
  if (left === null) return false;
  return left > 0 && left <= TRIAL_WARNING_DAYS;
}

/** Мягкое напоминание о пробном периоде (без акцента на цену). */
export function shouldShowTrialSoftNotice(
  user: UserTrialFields | null | undefined
): boolean {
  if (!user || user.blocked || isPaidActive(user)) return false;
  if (isTrialExpired(user)) return false;
  if (isTrialPending(user)) return false;
  const left = trialDaysRemaining(user);
  if (left == null || left <= 0) return false;
  return left <= TRIAL_WARNING_DAYS;
}

export function hasSubscriptionFeatureAccess(
  user: UserTrialFields | null | undefined,
  feature: Feature
): boolean {
  if (!user || user.blocked) {
    if (shouldLogTrialVerbose()) {
      logTrialDecisionTrace(user, `hasSubscriptionFeatureAccess:${feature}:blocked_or_missing`);
    }
    return false;
  }
  let allowed = false;
  if (isPaidActive(user)) allowed = true;
  else if (isTrialExpired(user)) allowed = false;
  else if (isTrialPending(user)) allowed = true;
  else if (isTrialRunning(user)) allowed = true;

  if (shouldLogTrialVerbose()) {
    logTrialDecisionTrace(user, `hasSubscriptionFeatureAccess:${feature}:allowed=${allowed}`);
  }
  return allowed;
}

export function shouldLogTrialVerbose(): boolean {
  if (typeof process === "undefined") return false;
  if (process.env.NEXT_PUBLIC_DEBUG_TRIAL === "1") return true;
  if (process.env.NODE_ENV !== "production") return true;
  return false;
}

export type TrialAccessSnapshot = {
  plan: string | undefined;
  trialEndsAtFieldMs: number;
  trialEndEffectiveMs: number;
  isTrialExpired: boolean;
  isTrialPending: boolean;
  isTrialRunning: boolean;
  /** Доступ к платным фичам (калькулятор и т.д.): оплата или активный/ожидающий trial, не истёкший. */
  accessDecision: boolean;
};

export function getTrialAccessSnapshot(
  user: UserTrialFields | null | undefined
): TrialAccessSnapshot {
  const plan = user?.plan;
  const trialEndsAtFieldMs = trialEndsMs(user ?? null);
  const trialEndEffectiveMs = getTrialEndMs(user);
  const expired = user ? isTrialExpired(user) : true;
  const pending = user ? isTrialPending(user) : false;
  const running = user ? isTrialRunning(user) : false;
  const paid = user ? isPaidActive(user) : false;
  const blocked = Boolean(user?.blocked);
  const accessDecision =
    !!user && !blocked && (paid || (!expired && (pending || running)));
  return {
    plan,
    trialEndsAtFieldMs,
    trialEndEffectiveMs,
    isTrialExpired: expired,
    isTrialPending: pending,
    isTrialRunning: running,
    accessDecision,
  };
}

export function logTrialAccessDebug(
  user: UserTrialFields | null | undefined,
  context: string
): void {
  logTrialDecisionTrace(user, context);
}

/** Поля для отладки: plan, trialEndsAt, now, isTrialExpired, решение по доступу. */
export function logTrialDecisionTrace(
  user: UserTrialFields | null | undefined,
  context: string
): void {
  if (!shouldLogTrialVerbose()) return;
  const now = Date.now();
  const snap = getTrialAccessSnapshot(user);
  console.info(`[trial-access/decision] ${context}`, {
    plan: snap.plan,
    subscriptionStatus: user?.subscriptionStatus,
    trialEndsAtFieldMs: snap.trialEndsAtFieldMs,
    trialEndEffectiveMs: snap.trialEndEffectiveMs,
    now,
    isTrialExpired: snap.isTrialExpired,
    isTrialPending: snap.isTrialPending,
    isTrialRunning: snap.isTrialRunning,
    accessDecision: snap.accessDecision,
  });
}

/**
 * Выставляет 15-дневный trial с момента первого сохранённого расчёта.
 * Идемпотентно по полю trialStartedAt / firstCalculationAt.
 */
export async function ensureTrialStartedOnFirstCalculation(uid: string): Promise<void> {
  const ref = doc(db, "users", uid);
  const snap = await getDocFromServer(ref);
  if (!snap.exists()) return;
  const data = snap.data() as UserTrialFields;
  if (trialStartedMs(data) > 0 || firestoreTimeToMs(data.firstCalculationAt) > 0) {
    return;
  }
  const now = Timestamp.now();
  await setDoc(
    ref,
    {
      trialStartedAt: now,
      trialEndsAt: Timestamp.fromMillis(now.toMillis() + TRIAL_MS),
      firstCalculationAt: now,
      subscriptionStatus: "trial_active" satisfies SubscriptionStatus,
      trialDays: TRIAL_DAYS,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
