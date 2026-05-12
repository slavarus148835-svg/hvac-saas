import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { PARTNER_COMMISSIONS_COLLECTION } from "@/lib/partner/constants";

function commissionDocId(paidUserId: string, orderId: string): string {
  const safeOrder = String(orderId || "").replace(/[/\s]/g, "_");
  return `${paidUserId}__${safeOrder}`;
}

/**
 * Начисление партнёрской комиссии после успешной оплаты (идемпотентно по orderId).
 */
export async function creditPartnerCommissionIfNeeded(params: {
  db: Firestore;
  paidUserId: string;
  orderId: string;
  amountKopecks: number;
  paymentId?: string;
}): Promise<void> {
  const { db, paidUserId, orderId, amountKopecks } = params;
  const oid = String(orderId || "").trim();
  if (!oid || !paidUserId) return;

  const commissionKopecks = Math.round(Number(amountKopecks) * 0.3);
  if (!Number.isFinite(commissionKopecks) || commissionKopecks <= 0) return;

  const commissionRef = db.collection(PARTNER_COMMISSIONS_COLLECTION).doc(
    commissionDocId(paidUserId, oid)
  );

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(commissionRef);
    if (existing.exists) return;

    const payerRef = db.collection(PRICING_FS.users).doc(paidUserId);
    const payerSnap = await tx.get(payerRef);
    if (!payerSnap.exists) return;

    const payer = payerSnap.data() ?? {};
    const referrerId = typeof payer.referrerId === "string" ? payer.referrerId.trim() : "";
    if (!referrerId || referrerId === paidUserId) return;

    const partnerRef = db.collection(PRICING_FS.users).doc(referrerId);
    const partnerSnap = await tx.get(partnerRef);
    if (!partnerSnap.exists) return;

    tx.update(partnerRef, {
      partnerBalance: FieldValue.increment(commissionKopecks),
      partnerTotalEarned: FieldValue.increment(commissionKopecks),
      partnerPaidCount: FieldValue.increment(1),
      updatedAt: new Date().toISOString(),
    });

    tx.set(commissionRef, {
      partnerUserId: referrerId,
      paidUserId,
      paymentId: String(params.paymentId || "").trim() || null,
      orderId: oid,
      amount: Number(amountKopecks),
      commission: commissionKopecks,
      percent: 30,
      createdAt: FieldValue.serverTimestamp(),
      status: "credited",
    });
  });
}
