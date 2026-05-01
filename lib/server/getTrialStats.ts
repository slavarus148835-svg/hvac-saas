import { getAdminDb } from "@/lib/firebaseAdmin";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { firestoreTimeToMs } from "@/lib/server/firestoreTimeMs";

const TRIAL_DAYS = 15;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TRIAL_MS = TRIAL_DAYS * MS_PER_DAY;

export type TrialStats = {
  totalUsers: number;
  activeTrialUsers: number;
  endedTrialUsers: number;
  endedWithoutPaymentUsers: number;
  paidUsers: number;
  /**
   * Конверсия триала в оплату: paid / endedTrialUsers * 100.
   * Логично для воронки «триал завершился -> оплата».
   */
  conversionPercent: number;
  conversionFormula: "paid_users / ended_trial_users";
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
      conversionPercent: 0,
      conversionFormula: "paid_users / ended_trial_users",
    };
  }

  const snap = await db.collection(PRICING_FS.users).get();
  let totalUsers = 0;
  let activeTrialUsers = 0;
  let endedTrialUsers = 0;
  let endedWithoutPaymentUsers = 0;
  let paidUsers = 0;

  for (const doc of snap.docs) {
    totalUsers++;
    const user = doc.data() as Record<string, unknown>;
    const hasPaid = user.hasPaid === true;
    if (hasPaid) paidUsers++;

    const trialStartMs = resolveTrialStartMs(user);
    if (trialStartMs <= 0) continue;

    const trialEndMs = trialStartMs + TRIAL_MS;
    if (trialEndMs > nowMs) {
      activeTrialUsers++;
      continue;
    }

    endedTrialUsers++;
    if (!hasPaid) endedWithoutPaymentUsers++;
  }

  const conversionPercent =
    endedTrialUsers === 0 ? 0 : roundPercent((paidUsers / endedTrialUsers) * 100);

  return {
    totalUsers,
    activeTrialUsers,
    endedTrialUsers,
    endedWithoutPaymentUsers,
    paidUsers,
    conversionPercent,
    conversionFormula: "paid_users / ended_trial_users",
  };
}

export function buildTrialStatsTelegramBlock(stats: TrialStats): string {
  return [
    "📊 Триалы",
    `• Всего пользователей: ${stats.totalUsers}`,
    `• Активный триал: ${stats.activeTrialUsers}`,
    `• Триал закончился: ${stats.endedTrialUsers}`,
    `• Закончился без оплаты: ${stats.endedWithoutPaymentUsers}`,
    `• Оплатили: ${stats.paidUsers}`,
    `• Конверсия: ${stats.conversionPercent}%`,
  ].join("\n");
}
