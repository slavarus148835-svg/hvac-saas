import { randomBytes } from "crypto";
import type { Firestore } from "firebase-admin/firestore";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";

export function normalizeReferralCode(raw: string): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export async function allocateUniqueReferralCode(db: Firestore): Promise<string> {
  for (let attempt = 0; attempt < 24; attempt++) {
    const code = randomBytes(5).toString("hex").slice(0, 10).toUpperCase();
    const dup = await db
      .collection(PRICING_FS.users)
      .where("referralCode", "==", code)
      .limit(1)
      .get();
    if (dup.empty) return code;
  }
  return randomBytes(12).toString("hex").toUpperCase();
}
