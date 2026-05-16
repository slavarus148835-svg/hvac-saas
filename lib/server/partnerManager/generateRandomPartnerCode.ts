import { randomBytes } from "crypto";
import type { Firestore } from "firebase-admin/firestore";
import {
  isValidPartnerManagerCode,
  normalizePartnerManagerCode,
  PARTNER_CODE_MAX_LEN,
  PARTNER_CODE_MIN_LEN,
} from "@/lib/partner/partnerManagerCode";
import { PARTNER_MANAGERS_COLLECTION } from "@/lib/partner/b2bConstants";

async function partnerManagerExistsByCode(db: Firestore, code: string): Promise<boolean> {
  const c = normalizePartnerManagerCode(code);
  if (!c) return false;
  const q = await db
    .collection(PARTNER_MANAGERS_COLLECTION)
    .where("code", "==", c)
    .limit(1)
    .get();
  return !q.empty;
}

const CHARSET = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomCodeLength(): number {
  return (
    PARTNER_CODE_MIN_LEN +
    Math.floor(randomBytes(1)[0]! % (PARTNER_CODE_MAX_LEN - PARTNER_CODE_MIN_LEN + 1))
  );
}

/**
 * Случайный обезличенный partner code (6–8 символов, a-z0-9, без «partner»).
 */
export function generateRandomPartnerCode(): string {
  for (let attempt = 0; attempt < 64; attempt++) {
    const len = randomCodeLength();
    const bytes = randomBytes(len);
    let code = "";
    for (let i = 0; i < len; i++) {
      code += CHARSET[bytes[i]! % CHARSET.length];
    }
    if (isValidPartnerManagerCode(code)) return code;
  }
  const fallback = randomBytes(8).toString("hex").slice(0, PARTNER_CODE_MAX_LEN);
  return normalizePartnerManagerCode(fallback).slice(0, PARTNER_CODE_MAX_LEN);
}

/** Уникальный code в коллекции partnerManagers. */
export async function allocateUniquePartnerManagerCode(db: Firestore): Promise<string> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const code = generateRandomPartnerCode();
    const exists = await partnerManagerExistsByCode(db, code);
    if (!exists) return code;
  }
  throw new Error("code_allocation_failed");
}

export async function migratePartnerManagerDocToRandomCode(
  db: Firestore,
  managerDocId: string
): Promise<{ oldCode: string; newCode: string }> {
  const ref = db.collection(PARTNER_MANAGERS_COLLECTION).doc(managerDocId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error("manager_not_found");
  }
  const oldCode = String((snap.data() as { code?: string })?.code ?? "").trim();

  for (let attempt = 0; attempt < 200; attempt++) {
    const newCode = generateRandomPartnerCode();
    const dup = await db
      .collection(PARTNER_MANAGERS_COLLECTION)
      .where("code", "==", newCode)
      .limit(2)
      .get();
    const conflict = dup.docs.some((d) => d.id !== managerDocId);
    if (conflict) continue;

    await ref.set(
      { code: newCode, updatedAt: new Date().toISOString() },
      { merge: true }
    );
    return { oldCode, newCode };
  }
  throw new Error("code_allocation_failed");
}
