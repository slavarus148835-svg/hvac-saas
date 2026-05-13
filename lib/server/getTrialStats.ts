import { getAdminDb } from "@/lib/firebaseAdmin";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { firestoreTimeToMs } from "@/lib/server/firestoreTimeMs";
import {
  isPaidUserForStatsTotals,
  userHasConfirmedBankPayment,
} from "@/lib/server/statsPaidUser";

const TRIAL_DAYS = 15;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TRIAL_MS = TRIAL_DAYS * MS_PER_DAY;

export type TrialStats = {
  totalUsers: number;
  activeTrialUsers: number;
  endedTrialUsers: number;
  endedWithoutPaymentUsers: number;
  /** Подтверждённая банковская оплата (`userHasConfirmedBankPayment`), всего по базе. */
  paidUsers: number;
  /** Широкий платный доступ (`isPaidUserForStatsTotals`). */
  accessPaidUsers: number;
  /** Среди пользователей с истёкшим триалом: с подтверждённой банковской оплатой. */
  endedTrialConfirmedBankPaidUsers: number;
  /**
   * Конверсия оплат: среди истёкших триалов доля с `userHasConfirmedBankPayment`
   * (`endedTrialConfirmedBankPaidUsers / endedTrialUsers`).
   */
  conversionPercent: number;
  conversionFormula: "ended_trial_confirmed_bank_paid / ended_trial_users";
};

function resolveTrialStartMs(user: Record<string, unknown>): number {
  const startedAtMs = firestoreTimeToMs(user.trialStartedAt);
  if (startedAtMs > 0) return startedAtMs;
  return firestoreTimeToMs(user.createdAt);
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function getTrialStats(nowMs = Date.now()): Promise<TrialStats> {
  const db = getAdminDb();
  if (!db) {
    return {
      totalUsers: 0,
      activeTrialUsers: 0,
      endedTrialUsers: 0,
      endedWithoutPaymentUsers: 0,
      paidUsers: 0,
      accessPaidUsers: 0,
      endedTrialConfirmedBankPaidUsers: 0,
      conversionPercent: 0,
      conversionFormula: "ended_trial_confirmed_bank_paid / ended_trial_users",
    };
  }

  const snap = await db.collection(PRICING_FS.users).get();
  let totalUsers = 0;
  let activeTrialUsers = 0;
  let endedTrialUsers = 0;
  let endedWithoutPaymentUsers = 0;
  let paidUsers = 0;
  let accessPaidUsers = 0;
  let endedTrialConfirmedBankPaidUsers = 0;

  for (const doc of snap.docs) {
    totalUsers++;
    const user = doc.data() as Record<string, unknown>;
    const bankPaid = userHasConfirmedBankPayment(user);
    if (bankPaid) paidUsers++;
    if (isPaidUserForStatsTotals(user, nowMs)) accessPaidUsers++;

    const trialStartMs = resolveTrialStartMs(user);
    if (trialStartMs <= 0) continue;

    const trialEndMs = trialStartMs + TRIAL_MS;
    if (trialEndMs > nowMs) {
      activeTrialUsers++;
      continue;
    }

    endedTrialUsers++;
    if (bankPaid) endedTrialConfirmedBankPaidUsers++;
    else endedWithoutPaymentUsers++;
  }

  const conversionPercent =
    endedTrialUsers === 0
      ? 0
      : roundPercent((endedTrialConfirmedBankPaidUsers / endedTrialUsers) * 100);

  return {
    totalUsers,
    activeTrialUsers,
    endedTrialUsers,
    endedWithoutPaymentUsers,
    paidUsers,
    accessPaidUsers,
    endedTrialConfirmedBankPaidUsers,
    conversionPercent,
    conversionFormula: "ended_trial_confirmed_bank_paid / ended_trial_users",
  };
}

export function buildTrialStatsTelegramBlock(stats: TrialStats): string {
  return [
    "📊 Триалы — всего по базе",
    `• Активный триал: ${stats.activeTrialUsers}`,
    `• Триал закончился: ${stats.endedTrialUsers}`,
    `• Закончился без оплаты: ${stats.endedWithoutPaymentUsers}`,
    `• Реально оплатили после конца триала: ${stats.endedTrialConfirmedBankPaidUsers}`,
    `• Имеют доступ: ${stats.accessPaidUsers}`,
    `• Конверсия конца триала в оплату: ${stats.conversionPercent.toFixed(2)}%`,
  ].join("\n");
}
