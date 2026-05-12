import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import {
  PARTNER_REFERRALS_COLLECTION,
} from "@/lib/partner/constants";
import { normalizeReferralCode } from "@/lib/server/partnerReferralCode";

export type AttachPartnerReferralResult =
  | { ok: true; attached: boolean; reason?: "already_attached" | "invalid_code" | "self_referral" }
  | { ok: false; error: string };

/**
 * Привязка реферера по коду (идемпотентно, если referrerId уже есть).
 */
export async function attachPartnerReferralByCode(
  db: Firestore,
  referredUid: string,
  rawCode: string
): Promise<AttachPartnerReferralResult> {
  const code = normalizeReferralCode(rawCode);
  if (!code || code.length < 4) {
    return { ok: true, attached: false, reason: "invalid_code" };
  }

  const userRef = db.collection(PRICING_FS.users).doc(referredUid);

  try {
    const outcome = await db.runTransaction(async (tx) => {
      const uSnap = await tx.get(userRef);
      if (!uSnap.exists) {
        return { type: "error" as const, error: "user_not_found" };
      }
      const u = uSnap.data() ?? {};
      const existing = typeof u.referrerId === "string" ? u.referrerId.trim() : "";
      if (existing) {
        return { type: "noop" as const, reason: "already_attached" as const };
      }

      const qSnap = await tx.get(
        db.collection(PRICING_FS.users).where("referralCode", "==", code).limit(2)
      );
      if (qSnap.empty) {
        return { type: "noop" as const, reason: "invalid_code" as const };
      }
      if (qSnap.docs.length !== 1) {
        return { type: "noop" as const, reason: "invalid_code" as const };
      }

      const partnerDoc = qSnap.docs[0]!;
      const partnerUid = partnerDoc.id;
      if (partnerUid === referredUid) {
        return { type: "noop" as const, reason: "self_referral" as const };
      }

      const partnerRef = db.collection(PRICING_FS.users).doc(partnerUid);
      const partnerSnap = await tx.get(partnerRef);
      if (!partnerSnap.exists) {
        return { type: "noop" as const, reason: "invalid_code" as const };
      }

      const referralDocId = `${partnerUid}_${referredUid}`;
      const referralRef = db.collection(PARTNER_REFERRALS_COLLECTION).doc(referralDocId);

      tx.update(userRef, {
        referrerId: partnerUid,
        updatedAt: new Date().toISOString(),
      });

      tx.update(partnerRef, {
        partnerRegisteredCount: FieldValue.increment(1),
        updatedAt: new Date().toISOString(),
      });

      tx.set(
        referralRef,
        {
          partnerUserId: partnerUid,
          referredUserId: referredUid,
          referralCode: code,
          createdAt: FieldValue.serverTimestamp(),
          status: "registered",
        },
        { merge: true }
      );

      return { type: "attached" as const };
    });

    if (outcome.type === "error") {
      return { ok: false, error: outcome.error };
    }
    if (outcome.type === "noop") {
      return {
        ok: true,
        attached: false,
        reason: outcome.reason,
      };
    }
    return { ok: true, attached: true };
  } catch (e) {
    console.error("[attachPartnerReferralByCode]", e);
    return { ok: false, error: "transaction_failed" };
  }
}
