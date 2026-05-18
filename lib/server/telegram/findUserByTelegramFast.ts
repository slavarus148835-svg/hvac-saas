import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import type { TelegramUserLookup } from "@/lib/server/authDuplicateGuards";
import { isFirestoreCapacityError } from "@/lib/server/statsUsersSnapshot";

function digitsOnly(s: string): string {
  return String(s ?? "").replace(/\D/g, "");
}

function isMerged(data: Record<string, unknown>): boolean {
  return data.isMergedDuplicate === true;
}

/**
 * Минимум reads для Mini App bootstrap: doc tg_{id} → один query telegramUserId.
 */
export async function findUserByTelegramFast(
  db: Firestore,
  telegramNumericId: string
): Promise<TelegramUserLookup> {
  const tgId = digitsOnly(telegramNumericId);
  if (!tgId) return { kind: "none" };

  const tgDocId = `tg_${tgId}`;
  try {
    const direct = await db.collection(PRICING_FS.users).doc(tgDocId).get();
    if (direct.exists) {
      const data = direct.data() as Record<string, unknown>;
      if (!isMerged(data)) {
        return { kind: "found", doc: direct as QueryDocumentSnapshot };
      }
    }

    const q = await db
      .collection(PRICING_FS.users)
      .where("telegramUserId", "==", tgId)
      .limit(2)
      .get();

    const docs = q.docs.filter((d) => !isMerged(d.data() as Record<string, unknown>));
    if (docs.length === 0) return { kind: "none" };
    if (docs.length > 1) {
      return { kind: "ambiguous", ids: docs.map((d) => d.id) };
    }
    return { kind: "found", doc: docs[0]! };
  } catch (e) {
    if (isFirestoreCapacityError(e)) throw e;
    throw e;
  }
}
