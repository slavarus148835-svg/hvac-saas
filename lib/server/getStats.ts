import { getAdminDb } from "@/lib/firebaseAdmin";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";

/** Учитывает явный флаг, подтверждённую оплату и legacy paidUntil. */
export function userCountsAsPaid(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  if (data.hasPaid === true) return true;
  const confirmed = data.lastPaymentConfirmed;
  if (confirmed && typeof confirmed === "object") return true;
  const pu = Number(data.paidUntil ?? 0);
  return Number.isFinite(pu) && pu > 0;
}

export type AppUserStats = {
  totalUsers: number;
  paidUsers: number;
  conversion: number;
};

/**
 * Статистика по коллекции users (Admin SDK).
 * conversion — доля оплативших от всех зарегистрированных, % с двумя знаками.
 */
export async function getStats(): Promise<AppUserStats> {
  const db = getAdminDb();
  if (!db) {
    return { totalUsers: 0, paidUsers: 0, conversion: 0 };
  }
  const snap = await db.collection(PRICING_FS.users).get();
  let totalUsers = 0;
  let paidUsers = 0;
  for (const doc of snap.docs) {
    totalUsers++;
    const d = doc.data() as Record<string, unknown>;
    if (userCountsAsPaid(d)) paidUsers++;
  }
  const conversion =
    totalUsers === 0 ? 0 : Math.round((paidUsers / totalUsers) * 10000) / 100;
  return { totalUsers, paidUsers, conversion };
}
