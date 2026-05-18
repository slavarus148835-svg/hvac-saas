import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";

export type StatsUsersSnapshot = {
  docs: QueryDocumentSnapshot[];
  usersCount: number;
  loadDurationMs: number;
};

/** Один read коллекции users на запрос /stat (вместо 3–4 полных сканов). */
export async function loadStatsUsersSnapshot(db: Firestore): Promise<StatsUsersSnapshot> {
  const t0 = Date.now();
  const snap = await db.collection(PRICING_FS.users).get();
  return {
    docs: snap.docs,
    usersCount: snap.docs.length,
    loadDurationMs: Date.now() - t0,
  };
}

export function isFirestoreCapacityError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  const code = (e as { code?: number })?.code;
  return (
    code === 8 ||
    msg.includes("resource_exhausted") ||
    msg.includes("quota exceeded") ||
    msg.includes("deadline_exceeded") ||
    msg.includes("deadline exceeded")
  );
}
