import { getAdminDb } from "@/lib/firebaseAdmin";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { firestoreTimeToMs } from "@/lib/server/firestoreTimeMs";

export type StatsReportPeriod = "today" | "yesterday" | "week" | "month";

export type StatsReport = {
  registrations: number;
  paid: number;
  conversion: number;
};

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

function paidEventMs(data: Record<string, unknown>): number {
  const p = data.paidAt;
  if (typeof p === "number" && Number.isFinite(p) && p > 0) {
    return p;
  }
  const lc = data.lastPaymentConfirmed;
  if (lc && typeof lc === "object") {
    const c = (lc as Record<string, unknown>).confirmedAt;
    return firestoreTimeToMs(c);
  }
  return 0;
}

function registrationMs(data: Record<string, unknown>): number {
  return firestoreTimeToMs(data.createdAt);
}

function inRange(ms: number, start: number, end: number): boolean {
  return ms > 0 && ms >= start && ms < end;
}

/**
 * registrations — createdAt в периоде [start, end).
 * paid — paidAt в периоде, иначе confirmedAt из lastPaymentConfirmed.
 * conversion — paid / registrations * 100, если registrations > 0.
 */
export async function getReport(period: StatsReportPeriod): Promise<StatsReport> {
  const db = getAdminDb();
  const { start, end } = getReportPeriodRange(period);
  if (!db) {
    return { registrations: 0, paid: 0, conversion: 0 };
  }
  const snap = await db.collection(PRICING_FS.users).get();
  let registrations = 0;
  let paid = 0;
  for (const doc of snap.docs) {
    const d = doc.data() as Record<string, unknown>;
    if (inRange(registrationMs(d), start, end)) {
      registrations++;
    }
    if (inRange(paidEventMs(d), start, end)) {
      paid++;
    }
  }
  const conversion =
    registrations === 0 ? 0 : Math.round((paid / registrations) * 10000) / 100;
  return { registrations, paid, conversion };
}
