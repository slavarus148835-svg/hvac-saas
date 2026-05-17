import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { normalizeEmailForAuth } from "@/lib/server/authDuplicateGuards";
import { firestoreTimeToMs } from "@/lib/server/firestoreTimeMs";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { isStatsExcludedTelegramProvisionUid } from "@/lib/server/statsExcludeTelegramProvisionUid";
import {
  userHasActivePaidAccess,
  userHasConfirmedBankPayment,
  type UserRecord,
} from "@/lib/server/statsPaidUser";

const CALCULATION_HISTORY_COLLECTION = "calculationHistory";

export type TelegramMergeAssessment =
  | { canMerge: true; reason: string }
  | { canMerge: false; reason: string };

function nowIso(): string {
  return new Date().toISOString();
}

function hasRealEmail(data: Record<string, unknown>): boolean {
  const norm = normalizeEmailForAuth(
    String(data.normalizedEmail ?? data.email ?? "")
  );
  return Boolean(norm && norm.includes("@"));
}

function isProvisionLikeUser(uid: string, data: Record<string, unknown>): boolean {
  if (isStatsExcludedTelegramProvisionUid(uid)) return true;
  if (data.isProvisionUser === true) return true;
  const ps = String(data.provisionStatus ?? "").trim().toLowerCase();
  if (ps && ps !== "linked" && ps !== "merged") return true;
  if (!hasRealEmail(data)) return true;
  return false;
}

function hasPaidAccess(data: UserRecord, nowMs: number): boolean {
  return userHasActivePaidAccess(data, nowMs) || userHasConfirmedBankPayment(data);
}

/**
 * Можно ли безопасно перенести Telegram и данные с sourceUid на email targetUid.
 */
export function assessTelegramAccountAutoMerge(params: {
  sourceUid: string;
  sourceData: Record<string, unknown>;
  targetUid: string;
  targetData: Record<string, unknown>;
  nowMs?: number;
}): TelegramMergeAssessment {
  const { sourceUid, targetUid } = params;
  const nowMs = params.nowMs ?? Date.now();
  const source = params.sourceData;
  const target = params.targetData;

  if (!sourceUid || !targetUid || sourceUid === targetUid) {
    return { canMerge: true, reason: "same_or_empty" };
  }

  if (source.isMergedDuplicate === true) {
    return { canMerge: true, reason: "source_already_merged_ghost" };
  }

  const sourceEmail = hasRealEmail(source);
  const targetEmail = hasRealEmail(target);
  const sourcePaid = hasPaidAccess(source, nowMs);
  const targetPaid = hasPaidAccess(target, nowMs);

  if (sourceEmail && targetEmail) {
    return { canMerge: false, reason: "both_have_email" };
  }
  if (sourcePaid && targetPaid) {
    return { canMerge: false, reason: "both_have_paid_access" };
  }

  if (isProvisionLikeUser(sourceUid, source)) {
    return { canMerge: true, reason: "provision_or_light_telegram_source" };
  }

  const sourceHasCalc = firestoreTimeToMs(source.firstCalculationAt) > 0;
  const sourcePartner = Boolean(
    String(source.partnerManagerId ?? "").trim() || String(source.referrerId ?? "").trim()
  );
  if (!sourcePaid && !sourceEmail && !sourceHasCalc && !sourcePartner) {
    return { canMerge: true, reason: "empty_legacy_telegram_source" };
  }

  if (!sourcePaid && !sourceEmail) {
    return { canMerge: true, reason: "unpaid_telegram_only_source" };
  }

  return { canMerge: false, reason: "source_has_significant_data" };
}

function pickEarlierTimestamp(
  targetVal: unknown,
  sourceVal: unknown
): unknown | undefined {
  const t = firestoreTimeToMs(targetVal);
  const s = firestoreTimeToMs(sourceVal);
  if (s <= 0) return undefined;
  if (t <= 0) return sourceVal;
  return s < t ? sourceVal : undefined;
}

function pickLaterTimestamp(targetVal: unknown, sourceVal: unknown): unknown | undefined {
  const t = firestoreTimeToMs(targetVal);
  const s = firestoreTimeToMs(sourceVal);
  if (s <= 0) return undefined;
  if (t <= 0) return sourceVal;
  return s > t ? sourceVal : undefined;
}

function buildMergedUserFieldsPatch(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  nowMs: number
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  const earlierFirst = pickEarlierTimestamp(target.firstCalculationAt, source.firstCalculationAt);
  if (earlierFirst !== undefined) patch.firstCalculationAt = earlierFirst;

  const earlierTrial = pickEarlierTimestamp(target.trialStartedAt, source.trialStartedAt);
  if (earlierTrial !== undefined) patch.trialStartedAt = earlierTrial;

  const laterTrialEnd = pickLaterTimestamp(target.trialEndsAt, source.trialEndsAt);
  if (laterTrialEnd !== undefined) patch.trialEndsAt = laterTrialEnd;

  const laterPaidUntil = pickLaterTimestamp(target.paidUntil, source.paidUntil);
  const targetPaid = hasPaidAccess(target, nowMs);
  const sourcePaid = hasPaidAccess(source, nowMs);
  if (!targetPaid && sourcePaid) {
    if (source.hasPaid === true) patch.hasPaid = true;
    if (source.plan) patch.plan = source.plan;
    if (source.paidUntil !== undefined) patch.paidUntil = source.paidUntil;
    if (source.paidAt !== undefined) patch.paidAt = source.paidAt;
    if (source.lastPaymentConfirmed) patch.lastPaymentConfirmed = source.lastPaymentConfirmed;
    if (source.subscriptionStatus) patch.subscriptionStatus = source.subscriptionStatus;
  } else if (laterPaidUntil !== undefined) {
    patch.paidUntil = laterPaidUntil;
    if (source.hasPaid === true && target.hasPaid !== true) patch.hasPaid = true;
  }

  if (!String(target.referrerId ?? "").trim() && String(source.referrerId ?? "").trim()) {
    patch.referrerId = source.referrerId;
  }
  if (!String(target.partnerManagerId ?? "").trim() && String(source.partnerManagerId ?? "").trim()) {
    patch.partnerManagerId = source.partnerManagerId;
    if (source.partnerCode) patch.partnerCode = source.partnerCode;
    if (source.partnerAttachedAt) patch.partnerAttachedAt = source.partnerAttachedAt;
  }

  if (!String(target.telegramChatId ?? "").trim() && String(source.telegramChatId ?? "").trim()) {
    patch.telegramChatId = source.telegramChatId;
  }

  if (
    !String(target.calculatorQuoteFooterTemplate ?? "").trim() &&
    String(source.calculatorQuoteFooterTemplate ?? "").trim()
  ) {
    patch.calculatorQuoteFooterTemplate = source.calculatorQuoteFooterTemplate;
  }
  if (
    !String(target.calculatorGuaranteeText ?? "").trim() &&
    String(source.calculatorGuaranteeText ?? "").trim()
  ) {
    patch.calculatorGuaranteeText = source.calculatorGuaranteeText;
  }
  if (
    !String(target.calculatorMasterContact ?? "").trim() &&
    String(source.calculatorMasterContact ?? "").trim()
  ) {
    patch.calculatorMasterContact = source.calculatorMasterContact;
  }

  const tgGm = Number(source.giftRouteMeters);
  const ttGm = Number(target.giftRouteMeters);
  if (Number.isFinite(tgGm) && tgGm >= 0 && (!Number.isFinite(ttGm) || ttGm <= 0)) {
    patch.giftRouteMeters = Math.floor(tgGm);
  }

  if (Object.keys(patch).length > 0) {
    patch.updatedAt = nowIso();
  }
  return patch;
}

async function reassignCalculationHistory(
  db: Firestore,
  fromUid: string,
  toUid: string
): Promise<number> {
  let total = 0;
  for (let pass = 0; pass < 20; pass++) {
    const snap = await db
      .collection(CALCULATION_HISTORY_COLLECTION)
      .where("uid", "==", fromUid)
      .limit(400)
      .get();
    if (snap.empty) break;
    const batch = db.batch();
    const t = nowIso();
    for (const doc of snap.docs) {
      batch.set(doc.ref, { uid: toUid, updatedAt: t }, { merge: true });
    }
    await batch.commit();
    total += snap.size;
    if (snap.size < 400) break;
  }
  return total;
}

async function mergePriceListDocIfNeeded(
  db: Firestore,
  fromUid: string,
  toUid: string
): Promise<boolean> {
  const targetRef = db.collection(PRICING_FS.priceLists).doc(toUid);
  const sourceRef = db.collection(PRICING_FS.priceLists).doc(fromUid);
  const [targetSnap, sourceSnap] = await Promise.all([targetRef.get(), sourceRef.get()]);
  if (!sourceSnap.exists) return false;
  const sourceData = sourceSnap.data() as Record<string, unknown>;
  if (!targetSnap.exists) {
    await targetRef.set({ ...sourceData, updatedAt: nowIso() }, { merge: true });
    return true;
  }
  const targetData = targetSnap.data() as Record<string, unknown>;
  const targetKeys = Object.keys(targetData).filter(
    (k) => k !== "updatedAt" && k !== "createdAt" && targetData[k] != null && targetData[k] !== ""
  );
  if (targetKeys.length > 3) return false;
  await targetRef.set({ ...sourceData, updatedAt: nowIso() }, { merge: true });
  return true;
}

async function mergeModelsSubcollectionIfNeeded(
  db: Firestore,
  fromUid: string,
  toUid: string
): Promise<number> {
  const targetCol = db
    .collection(PRICING_FS.users)
    .doc(toUid)
    .collection(PRICING_FS.modelsSubcollection);
  const sourceCol = db
    .collection(PRICING_FS.users)
    .doc(fromUid)
    .collection(PRICING_FS.modelsSubcollection);

  const [targetSnap, sourceSnap] = await Promise.all([
    targetCol.limit(1).get(),
    sourceCol.get(),
  ]);
  if (sourceSnap.empty) return 0;
  if (!targetSnap.empty) return 0;

  let copied = 0;
  const batch = db.batch();
  for (const doc of sourceSnap.docs) {
    batch.set(targetCol.doc(doc.id), doc.data(), { merge: true });
    copied++;
    if (copied >= 400) break;
  }
  if (copied > 0) await batch.commit();
  return copied;
}

export type TelegramAccountMergeResult =
  | { ok: true; merged: true; historyMoved: number }
  | { ok: true; merged: false }
  | { ok: false; reason: string };

/**
 * Перенос данных provision/legacy Telegram-аккаунта на email target и пометка source как дубликата.
 */
export async function mergeTelegramSourceUserIntoTarget(
  db: Firestore,
  params: {
    sourceUid: string;
    targetUid: string;
  }
): Promise<TelegramAccountMergeResult> {
  const sourceUid = String(params.sourceUid || "").trim();
  const targetUid = String(params.targetUid || "").trim();
  if (!sourceUid || !targetUid || sourceUid === targetUid) {
    return { ok: true, merged: false };
  }

  const sourceRef = db.collection(PRICING_FS.users).doc(sourceUid);
  const targetRef = db.collection(PRICING_FS.users).doc(targetUid);
  const [sourceSnap, targetSnap] = await Promise.all([sourceRef.get(), targetRef.get()]);
  if (!sourceSnap.exists || !targetSnap.exists) {
    return { ok: false, reason: "user_doc_missing" };
  }

  const sourceData = sourceSnap.data() as Record<string, unknown>;
  const targetData = targetSnap.data() as Record<string, unknown>;
  const assessment = assessTelegramAccountAutoMerge({
    sourceUid,
    sourceData,
    targetUid,
    targetData,
  });
  if (!assessment.canMerge) {
    return { ok: false, reason: assessment.reason };
  }

  if (sourceData.isMergedDuplicate === true) {
    return { ok: true, merged: false };
  }

  const nowMs = Date.now();
  const userPatch = buildMergedUserFieldsPatch(sourceData, targetData, nowMs);
  if (Object.keys(userPatch).length > 0) {
    await targetRef.set(userPatch, { merge: true });
  }

  const historyMoved = await reassignCalculationHistory(db, sourceUid, targetUid);
  await mergePriceListDocIfNeeded(db, sourceUid, targetUid);
  await mergeModelsSubcollectionIfNeeded(db, sourceUid, targetUid);

  const t = nowIso();
  await sourceRef.set(
    {
      isMergedDuplicate: true,
      mergedIntoUid: targetUid,
      mergedAt: t,
      provisionStatus: "merged",
      isProvisionUser: true,
      telegramUserId: FieldValue.delete(),
      telegramId: FieldValue.delete(),
      telegramChatId: FieldValue.delete(),
      telegramUsername: FieldValue.delete(),
      telegramLinkedAt: FieldValue.delete(),
      updatedAt: t,
    },
    { merge: true }
  );

  return { ok: true, merged: true, historyMoved };
}
