import { firestoreTimeToMs } from "@/lib/server/firestoreTimeMs";
import {
  PARTNER_REVEAL_DAYS_BEFORE_TRIAL_END,
  PARTNER_TRIAL_DAYS,
} from "@/lib/partner/constants";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Партнёрка доступна с момента revealAt и дальше навсегда (после триала и после оплаты).
 * Начало отсчёта — только `firstCalculationAt` (не `trialStartedAt`).
 */
export function canShowReferral(
  user: Record<string, unknown> | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!user) return false;
  const trialStartMs = firestoreTimeToMs(user.firstCalculationAt);
  if (trialStartMs <= 0) return false;
  const revealAt =
    trialStartMs + (PARTNER_TRIAL_DAYS - PARTNER_REVEAL_DAYS_BEFORE_TRIAL_END) * MS_PER_DAY;
  return nowMs >= revealAt;
}
