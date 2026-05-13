import { getAdminDb } from "@/lib/firebaseAdmin";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { firestoreTimeToMs } from "@/lib/server/firestoreTimeMs";
import {
  getConfirmedBankPaymentEventMs,
  isPaidUserForStatsTotals,
  MONTHLY_SUBSCRIPTION_PRICE_RUB,
  userHasActiveConfirmedBankSubscription,
  userHasConfirmedBankPayment,
  type UserRecord,
} from "@/lib/server/statsPaidUser";

const TRIAL_DAYS = 15;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TRIAL_MS = TRIAL_DAYS * MS_PER_DAY;
const LAST_7_DAYS_MS = 7 * MS_PER_DAY;

export type FunnelStats = {
  totalUsers: number;
  usersWithCalculation: number;
  endedTrialUsers: number;
  /** Подтверждённые оплаты Т-Банка (см. `userHasConfirmedBankPayment`). */
  paidUsers: number;
  /** Широкий «платный доступ» (`isPaidUserForStatsTotals`). */
  accessPaidUsers: number;
  /** Среди пользователей с истёкшим триалом — с подтверждённой банковской оплатой. */
  endedTrialConfirmedBankPaidUsers: number;
  /** Активные подписки: банк + paidUntil в будущем (без legacy/debug-доступа). */
  activeConfirmedBankSubscriptions: number;
  /** MRR ≈ активные подписки × фиксированная цена месяца (₽). */
  mrrRub: number;
  /** ARPU = MRR / активные подписки; при 0 подписок — 0. */
  arpuRub: number;
  conversionSignupToCalc: number;
  conversionTrialEndToPaid: number;
  last7Days: {
    newUsers: number;
    usersWithCalculation: number;
    /** Подтверждённые оплаты Т-Банка за 7 дней по дате события. */
    paidUsers: number;
  };
};

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return roundPercent((part / whole) * 100);
}

function resolveTrialStartMs(user: UserRecord): number {
  const started = firestoreTimeToMs(user.trialStartedAt);
  if (started > 0) return started;
  return firestoreTimeToMs(user.createdAt);
}

function bumpEarliestCalculationMs(map: Map<string, number>, uid: string | undefined | null, ms: number): void {
  const id = uid ? String(uid).trim() : "";
  if (!id || ms <= 0) return;
  const prev = map.get(id);
  if (prev === undefined || ms < prev) {
    map.set(id, ms);
  }
}

export async function getFunnelStats(nowMs = Date.now()): Promise<FunnelStats> {
  const db = getAdminDb();
  if (!db) {
    return {
      totalUsers: 0,
      usersWithCalculation: 0,
      endedTrialUsers: 0,
      paidUsers: 0,
      accessPaidUsers: 0,
      endedTrialConfirmedBankPaidUsers: 0,
      activeConfirmedBankSubscriptions: 0,
      mrrRub: 0,
      arpuRub: 0,
      conversionSignupToCalc: 0,
      conversionTrialEndToPaid: 0,
      last7Days: {
        newUsers: 0,
        usersWithCalculation: 0,
        paidUsers: 0,
      },
    };
  }

  const usersSnap = await db.collection(PRICING_FS.users).get();
  const calcSnap = await db.collectionGroup(PRICING_FS.modelsSubcollection).get();
  const calculationHistorySnap = await db.collection("calculationHistory").get();

  const userById = new Map<string, UserRecord>();
  for (const doc of usersSnap.docs) {
    userById.set(doc.id, doc.data() as UserRecord);
  }

  const firstCalculationAtMsByUser = new Map<string, number>();
  for (const doc of calcSnap.docs) {
    const userDocId = doc.ref.parent.parent?.id;
    if (!userDocId) continue;

    const d = doc.data() as UserRecord;
    const calcMs = firestoreTimeToMs(d.createdAt);
    bumpEarliestCalculationMs(firstCalculationAtMsByUser, userDocId, calcMs);
  }

  for (const doc of calculationHistorySnap.docs) {
    const d = doc.data() as UserRecord & { uid?: unknown };
    const uid = typeof d.uid === "string" ? d.uid.trim() : "";
    const histMs = firestoreTimeToMs(d.createdAt);
    bumpEarliestCalculationMs(firstCalculationAtMsByUser, uid || null, histMs);
  }

  const sinceMs = nowMs - LAST_7_DAYS_MS;
  let totalUsers = 0;
  let endedTrialUsers = 0;
  let paidUsers = 0;
  let accessPaidUsers = 0;
  let endedTrialConfirmedBankPaidUsers = 0;
  let activeConfirmedBankSubscriptions = 0;
  let newUsers7d = 0;
  let paidUsers7d = 0;

  for (const [uid, user] of userById.entries()) {
    totalUsers++;

    const createdAtMs = firestoreTimeToMs(user.createdAt);
    if (createdAtMs >= sinceMs) newUsers7d++;

    if (isPaidUserForStatsTotals(user, nowMs)) {
      accessPaidUsers++;
    }
    if (userHasConfirmedBankPayment(user)) {
      paidUsers++;
      const paidAtMs = getConfirmedBankPaymentEventMs(user);
      if (paidAtMs >= sinceMs && paidAtMs <= nowMs) paidUsers7d++;
    }
    if (userHasActiveConfirmedBankSubscription(user, nowMs)) {
      activeConfirmedBankSubscriptions++;
    }

    const trialStartMs = resolveTrialStartMs(user);
    if (trialStartMs > 0 && trialStartMs + TRIAL_MS <= nowMs) {
      endedTrialUsers++;
      if (userHasConfirmedBankPayment(user)) endedTrialConfirmedBankPaidUsers++;
    }

    bumpEarliestCalculationMs(firstCalculationAtMsByUser, uid, firestoreTimeToMs(user.firstCalculationAt));
  }

  const usersWithCalculation = firstCalculationAtMsByUser.size;
  let usersWithCalculation7d = 0;
  for (const calcMs of firstCalculationAtMsByUser.values()) {
    if (calcMs >= sinceMs) usersWithCalculation7d++;
  }

  const mrrRub = activeConfirmedBankSubscriptions * MONTHLY_SUBSCRIPTION_PRICE_RUB;
  const arpuRub =
    activeConfirmedBankSubscriptions === 0 ? 0 : mrrRub / activeConfirmedBankSubscriptions;

  return {
    totalUsers,
    usersWithCalculation,
    endedTrialUsers,
    paidUsers,
    accessPaidUsers,
    endedTrialConfirmedBankPaidUsers,
    activeConfirmedBankSubscriptions,
    mrrRub,
    arpuRub,
    conversionSignupToCalc: percent(usersWithCalculation, totalUsers),
    conversionTrialEndToPaid: percent(endedTrialConfirmedBankPaidUsers, endedTrialUsers),
    last7Days: {
      newUsers: newUsers7d,
      usersWithCalculation: usersWithCalculation7d,
      paidUsers: paidUsers7d,
    },
  };
}

export function buildFunnelTelegramBlock(stats: FunnelStats): string {
  const p = (n: number) => n.toFixed(2);
  return [
    "📊 Воронка — всего по базе",
    `• Всего пользователей: ${stats.totalUsers}`,
    `• Сделали расчёт: ${stats.usersWithCalculation}`,
    `• Дошли до конца триала: ${stats.endedTrialUsers}`,
    `• Реально оплатили: ${stats.paidUsers}`,
    `• Имеют доступ: ${stats.accessPaidUsers}`,
    "",
    "Конверсии:",
    `• Регистрация → Расчёт: ${p(stats.conversionSignupToCalc)}%`,
    `• Конец триала → Оплата: ${p(stats.conversionTrialEndToPaid)}%`,
    `• Активация: ${p(stats.conversionSignupToCalc)}% сделали первый расчёт`,
  ].join("\n");
}
