import type { Firestore } from "firebase-admin/firestore";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";

export type BackfillCandidate = {
  uid: string;
  /** Нормализованный numeric id, источник: telegramUserId или telegramId */
  telegramId: string;
};

function digits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function trimmedChatId(data: Record<string, unknown>): string {
  return String(data.telegramChatId ?? "").trim();
}

/**
 * Кандидаты: есть telegramUserId или telegramId, нет telegramChatId, не заблокированы в Telegram.
 */
export function findTelegramChatIdBackfillCandidates(
  docs: Array<{ id: string; data: () => Record<string, unknown> }>
): BackfillCandidate[] {
  const out: BackfillCandidate[] = [];
  for (const doc of docs) {
    const d = doc.data();
    if (d.telegramBlocked === true) continue;
    if (trimmedChatId(d).length > 0) continue;
    const fromUser = digits(d.telegramUserId);
    const fromId = digits(d.telegramId);
    const pick = fromUser || fromId;
    if (!pick) continue;
    out.push({ uid: doc.id, telegramId: pick });
  }
  return out;
}

export async function runTelegramChatIdBackfill(
  db: Firestore,
  candidates: BackfillCandidate[]
): Promise<number> {
  const now = new Date().toISOString();
  const payload = {
    telegramChatId: "",
    telegramOptIn: true,
    telegramBlocked: false,
    telegramLinkedAt: now,
    updatedAt: now,
  };
  let changed = 0;
  const BATCH = 400;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const chunk = candidates.slice(i, i + BATCH);
    const batch = db.batch();
    for (const c of chunk) {
      const ref = db.collection(PRICING_FS.users).doc(c.uid);
      batch.set(ref, { ...payload, telegramChatId: c.telegramId }, { merge: true });
    }
    await batch.commit();
    changed += chunk.length;
  }
  return changed;
}

export async function loadUsersForBackfill(db: Firestore) {
  const snap = await db.collection(PRICING_FS.users).get();
  return snap.docs.map((doc) => ({
    id: doc.id,
    data: () => doc.data() as Record<string, unknown>,
  }));
}
