import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { canShowReferral } from "@/lib/partner/canShowReferral";
import { getPartnerSiteOrigin, PARTNER_COMMISSION_PERCENT } from "@/lib/partner/constants";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { requireBearerUid } from "@/lib/server/requireBearerUid";
import { allocateUniqueReferralCode } from "@/lib/server/partnerReferralCode";

function kopecksToRubles(k: unknown): number {
  const n = typeof k === "number" && Number.isFinite(k) ? k : Number(k);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n) / 100;
}

export async function GET(req: Request) {
  const auth = await requireBearerUid(req);
  if (!auth.ok) {
    return NextResponse.json(auth.data, { status: auth.status });
  }

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ error: "no_admin" }, { status: 503 });
  }

  const uid = auth.data.uid;
  const ref = db.collection(PRICING_FS.users).doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const user = snap.data() ?? {};
  if (!canShowReferral(user)) {
    return NextResponse.json(
      { error: "NOT_AVAILABLE_YET", message: "Партнёрская программа пока недоступна." },
      { status: 403 }
    );
  }

  let referralCode = typeof user.referralCode === "string" ? user.referralCode.trim() : "";
  if (!referralCode) {
    referralCode = await allocateUniqueReferralCode(db);
    const patch: Record<string, unknown> = {
      referralCode,
      updatedAt: new Date().toISOString(),
    };
    if (user.partnerCreatedAt == null) {
      patch.partnerCreatedAt = FieldValue.serverTimestamp();
    }
    if (typeof user.partnerBalance !== "number") patch.partnerBalance = 0;
    if (typeof user.partnerTotalEarned !== "number") patch.partnerTotalEarned = 0;
    if (typeof user.partnerPaidCount !== "number") patch.partnerPaidCount = 0;
    if (typeof user.partnerRegisteredCount !== "number") patch.partnerRegisteredCount = 0;
    await ref.set(patch, { merge: true });
  }

  const origin = getPartnerSiteOrigin();
  const referralLink = `${origin}/?ref=${encodeURIComponent(referralCode)}`;

  const refreshed = await ref.get();
  const d = refreshed.data() ?? {};

  return NextResponse.json({
    referralCode,
    referralLink,
    partnerBalance: kopecksToRubles(d.partnerBalance),
    partnerTotalEarned: kopecksToRubles(d.partnerTotalEarned),
    partnerRegisteredCount:
      typeof d.partnerRegisteredCount === "number" ? d.partnerRegisteredCount : 0,
    partnerPaidCount: typeof d.partnerPaidCount === "number" ? d.partnerPaidCount : 0,
    commissionPercent: PARTNER_COMMISSION_PERCENT,
  });
}
