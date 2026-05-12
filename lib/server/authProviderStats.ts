import type { Firestore } from "firebase-admin/firestore";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";

export type AuthProviderStats = {
  totalUsers: number;
  telegramUsers: number;
  emailUsers: number;
  mixedUsers: number;
  unknownUsers: number;
  telegramPercent: number;
  emailPercent: number;
  mixedPercent: number;
  unknownPercent: number;
};

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 10000) / 100;
}

function trimmedEmail(data: Record<string, unknown>): string {
  return String(data.email ?? "").trim();
}

function hasTelegramIds(data: Record<string, unknown>): boolean {
  const u = String(data.telegramUserId ?? "").replace(/\D/g, "");
  const tid = String(data.telegramId ?? "").replace(/\D/g, "");
  return u.length > 0 || tid.length > 0;
}

function hasEmail(data: Record<string, unknown>): boolean {
  return trimmedEmail(data).length > 0;
}

/**
 * Статистика по полям в Firestore `users` (не Auth):
 * - telegramUsers: есть telegramUserId или telegramId
 * - emailUsers: есть email и нет telegram ids
 * - mixedUsers: есть и email, и telegram ids
 * - unknownUsers: нет ни email, ни telegram ids
 */
export async function getAuthProviderStats(db: Firestore): Promise<AuthProviderStats> {
  const snap = await db.collection(PRICING_FS.users).get();
  const totalUsers = snap.size;

  let emailUsers = 0;
  let mixedUsers = 0;
  let telegramOnlyUsers = 0;
  let unknownUsers = 0;

  for (const doc of snap.docs) {
    const d = doc.data() as Record<string, unknown>;
    const tg = hasTelegramIds(d);
    const em = hasEmail(d);
    if (tg && em) mixedUsers++;
    else if (tg) telegramOnlyUsers++;
    else if (em) emailUsers++;
    else unknownUsers++;
  }

  const telegramUsers = telegramOnlyUsers + mixedUsers;

  return {
    totalUsers,
    telegramUsers,
    emailUsers,
    mixedUsers,
    unknownUsers,
    telegramPercent: pct(telegramUsers, totalUsers),
    emailPercent: pct(emailUsers, totalUsers),
    mixedPercent: pct(mixedUsers, totalUsers),
    unknownPercent: pct(unknownUsers, totalUsers),
  };
}
