import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import type { StatsUsersSnapshot } from "@/lib/server/statsUsersSnapshot";
import { firestoreTimeToMs } from "@/lib/server/firestoreTimeMs";
import {
  getConfirmedBankPaymentEventMs,
  isPaidUserForStatsTotals,
  userHasConfirmedBankPayment,
} from "@/lib/server/statsPaidUser";

export type StatsReportPeriod = "today" | "yesterday" | "week" | "month";

export type StatsReport = {
  registrations: number;
  /** Подтверждённые оплаты Т-Банка: событие в периоде (см. `userHasConfirmedBankPayment` + дата события). */
  paid: number;
  conversion: number;
  /** Снимок: пользователи с широким «платным доступом» на момент построения отчёта. */
  activePaidAccess: number;
};

/** Заголовок периода для Telegram (как прежний `periodTitleRu`). */
export function statsReportPeriodTitleRu(period: StatsReportPeriod): string {
  if (period === "today") return "📊 Отчёт за сегодня";
  if (period === "yesterday") return "📊 Отчёт за вчера";
  if (period === "week") return "📊 Отчёт за неделю";
  return "📊 Отчёт за месяц";
}

/** Инлайн-подпись периода для метрик: «за вчера», «за неделю». */
export function statsReportPeriodSuffixRu(period: StatsReportPeriod): string {
  if (period === "today") return "за сегодня";
  if (period === "yesterday") return "за вчера";
  if (period === "week") return "за неделю";
  return "за месяц";
}

/** Границы периода [start, end) в мс UTC. */
export function getReportPeriodRange(period: StatsReportPeriod): { start: number; end: number } {
  const now = Date.now();
  const todayStart = Date.UTC(
    new Date(now).getUTCFullYear(),
    new Date(now).getUTCMonth(),
    new Date(now).getUTCDate(),
    0,
    0,
    0,
    0
  );

  if (period === "today") {
    return { start: todayStart, end: now };
  }
  if (period === "yesterday") {
    const end = todayStart;
    const start = end - 24 * 60 * 60 * 1000;
    return { start, end };
  }
  if (period === "week") {
    return { start: now - 7 * 24 * 60 * 60 * 1000, end: now };
  }
  return { start: now - 30 * 24 * 60 * 60 * 1000, end: now };
}

function registrationMs(data: Record<string, unknown>): number {
  return firestoreTimeToMs(data.createdAt);
}

function inRange(ms: number, start: number, end: number): boolean {
  return ms > 0 && ms >= start && ms < end;
}

/**
 * registrations — createdAt в периоде [start, end).
 * paid — подтверждённый платёж Т-Банка (`userHasConfirmedBankPayment`) и дата события
 *   только из `lastPaymentConfirmed` (`getConfirmedBankPaymentEventMs`, без верхнего `paidAt`) в периоде.
 * activePaidAccess — число пользователей с широким доступом (`isPaidUserForStatsTotals`) на now.
 * conversion — paid / registrations * 100, если registrations > 0.
 */
export function computeReportFromUserDocs(
  docs: QueryDocumentSnapshot[],
  period: StatsReportPeriod,
  nowMs = Date.now()
): StatsReport {
  const { start, end } = getReportPeriodRange(period);
  let registrations = 0;
  let paid = 0;
  let activePaidAccess = 0;
  for (const doc of docs) {
    const d = doc.data() as Record<string, unknown>;
    if (inRange(registrationMs(d), start, end)) {
      registrations++;
    }
    if (
      userHasConfirmedBankPayment(d) &&
      inRange(getConfirmedBankPaymentEventMs(d), start, end)
    ) {
      paid++;
    }
    if (isPaidUserForStatsTotals(d, nowMs)) {
      activePaidAccess++;
    }
  }
  const conversion =
    registrations === 0 ? 0 : Math.round((paid / registrations) * 10000) / 100;
  return { registrations, paid, conversion, activePaidAccess };
}

export async function getReport(
  period: StatsReportPeriod,
  usersSnapshot?: StatsUsersSnapshot
): Promise<StatsReport> {
  if (usersSnapshot) {
    return computeReportFromUserDocs(usersSnapshot.docs, period);
  }
  const db = getAdminDb();
  if (!db) {
    return { registrations: 0, paid: 0, conversion: 0, activePaidAccess: 0 };
  }
  const snap = await db.collection(PRICING_FS.users).get();
  return computeReportFromUserDocs(snap.docs, period);
}
