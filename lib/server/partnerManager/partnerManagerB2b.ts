import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { PARTNER_EVENTS_COLLECTION, PARTNER_MANAGERS_COLLECTION, PARTNER_PAYOUTS_COLLECTION } from "@/lib/partner/b2bConstants";
import { computeB2BCommissionFromPaymentKop } from "@/lib/server/partnerManager/b2bCommissionMath";
import {
  maskEmailForManager,
  notifyAdminPartnerManagerEvent,
  notifyPartnerManagerEvent,
} from "@/lib/server/partnerManager/b2bPartnerNotify";
import {
  isValidPartnerManagerCode,
  normalizePartnerManagerCode,
} from "@/lib/partner/partnerManagerCode";
import { allocateUniquePartnerManagerCode } from "@/lib/server/partnerManager/generateRandomPartnerCode";

export { normalizePartnerManagerCode } from "@/lib/partner/partnerManagerCode";
import { TBANK_MONTHLY_AMOUNT_KOPECKS } from "@/lib/server/tbankMonthlyPayment";
import {
  isTbankAcquiringPaymentSuccess,
  isTbankAcquiringRefundLikeStatus,
} from "@/lib/server/tbankPaymentStatus";
import { firestoreTimeToMs, getTrialEndMsFromRecord } from "@/lib/server/firestoreTimeMs";

export type PartnerEventType = "registration" | "first_calculation" | "payment" | "refund";

export type PartnerSource = "web" | "telegram_miniapp";

export { computeB2BCommissionFromPaymentKop } from "@/lib/server/partnerManager/b2bCommissionMath";

function safeOrderIdForDoc(orderId: string): string {
  return String(orderId || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 200);
}

export type PartnerManagerDoc = {
  name: string;
  code: string;
  telegramUserId: number;
  telegramChatId: number;
  telegramUsername?: string;
  phone?: string;
  active: boolean;
  createdAt: unknown;
  createdByAdminTelegramId: number | null;
  selfRegistered?: boolean;
  signupSource?: string;
  commissionAccruedKop?: number;
  commissionPaidOutKop?: number;
};

export async function getPartnerManagerByCode(
  db: Firestore,
  code: string
): Promise<{ id: string; data: PartnerManagerDoc } | null> {
  const c = normalizePartnerManagerCode(code);
  if (!c) return null;
  const q = await db
    .collection(PARTNER_MANAGERS_COLLECTION)
    .where("code", "==", c)
    .limit(2)
    .get();
  if (q.empty || q.docs.length !== 1) return null;
  const d = q.docs[0]!;
  const data = d.data() as PartnerManagerDoc;
  return { id: d.id, data };
}

export type AttachPartnerResult =
  | {
      ok: true;
      attached: boolean;
      reason?: "already_attached" | "invalid_code" | "inactive_manager";
    }
  | { ok: false; error: string };

/**
 * Закрепление B2B-менеджера один раз (не трогает referrerId / пользовательскую рефералку).
 */
export async function attachPartnerToUserIfEmpty(
  db: Firestore,
  uid: string,
  rawCode: string,
  source: PartnerSource,
  options?: { firstTouchMs?: number }
): Promise<AttachPartnerResult> {
  const code = normalizePartnerManagerCode(rawCode);
  if (!isValidPartnerManagerCode(code)) {
    return { ok: true, attached: false, reason: "invalid_code" };
  }

  const manager = await getPartnerManagerByCode(db, code);
  if (!manager) {
    return { ok: true, attached: false, reason: "invalid_code" };
  }
  if (!manager.data.active) {
    return { ok: true, attached: false, reason: "inactive_manager" };
  }

  const userRef = db.collection(PRICING_FS.users).doc(uid);
  const firstTouchMs =
    typeof options?.firstTouchMs === "number" &&
    Number.isFinite(options.firstTouchMs) &&
    options.firstTouchMs > 0
      ? Math.floor(options.firstTouchMs)
      : null;

  try {
    const outcome = await db.runTransaction(async (tx) => {
      const uSnap = await tx.get(userRef);
      if (!uSnap.exists) {
        throw new Error("user_not_found");
      }
      const u = uSnap.data() ?? {};
      const existingMid =
        typeof u.partnerManagerId === "string" ? u.partnerManagerId.trim() : "";
      if (existingMid) {
        return { kind: "skip" as const, reason: "already_attached" as const };
      }

      const now = FieldValue.serverTimestamp();
      const patch: Record<string, unknown> = {
        partnerCode: manager.data.code,
        partnerManagerId: manager.id,
        partnerAttachedAt: now,
        partnerSource: source,
        partnerLastTouchAt: now,
        partnerAttributionType: "lifetime",
        partnerAttributionLocked: true,
        partnerAttributionLockedAt: now,
        updatedAt: new Date().toISOString(),
        partnerFirstTouchAt:
          firstTouchMs != null ? new Date(firstTouchMs) : now,
      };

      tx.set(userRef, patch, { merge: true });
      return { kind: "attached" as const };
    });

    if (outcome.kind === "skip") {
      return { ok: true, attached: false, reason: outcome.reason };
    }

    const wroteEvent = await recordPartnerEventOnce(db, {
      eventId: `registration_${uid}`,
      type: "registration",
      userId: uid,
      partnerManagerId: manager.id,
      partnerCode: manager.data.code,
    });

    if (wroteEvent) {
      try {
        await notifyAdminPartnerManagerEvent(db, {
          type: "registration",
          userId: uid,
          partnerManagerId: manager.id,
          source,
        });
        await notifyPartnerManagerEvent(db, {
          type: "registration",
          managerTelegramChatId: manager.data.telegramChatId,
          source,
          partnerManagerId: manager.id,
        });
      } catch (e) {
        console.error("[attachPartnerToUserIfEmpty] notify failed", e);
      }
    }

    return { ok: true, attached: true };
  } catch (e) {
    if (String(e instanceof Error ? e.message : e) === "user_not_found") {
      return { ok: false, error: "user_not_found" };
    }
    console.error("[attachPartnerToUserIfEmpty]", e);
    return { ok: false, error: "transaction_failed" };
  }
}

export async function recordPartnerEventOnce(
  db: Firestore,
  params: {
    eventId: string;
    type: PartnerEventType;
    userId: string;
    partnerManagerId: string;
    partnerCode: string;
    payment?: {
      orderId: string;
      amountKop: number;
      paymentId?: string;
      paymentStatus?: string;
    };
  }
): Promise<boolean> {
  const ref = db.collection(PARTNER_EVENTS_COLLECTION).doc(params.eventId);

  const wrote = await db.runTransaction(async (tx) => {
    const ex = await tx.get(ref);
    if (ex.exists) return false;

    const base: Record<string, unknown> = {
      type: params.type,
      userId: params.userId,
      partnerManagerId: params.partnerManagerId,
      partnerCode: params.partnerCode,
      createdAt: FieldValue.serverTimestamp(),
    };

    if (params.type === "payment" && params.payment) {
      const calc = computeB2BCommissionFromPaymentKop(params.payment.amountKop);
      base.orderId = params.payment.orderId;
      base.amount = calc.amountRub;
      base.amountKop = calc.amountKop;
      base.taxRate = calc.taxRate;
      base.netAfterTax = calc.netAfterTaxRub;
      base.netAfterTaxKop = calc.netAfterTaxKop;
      base.commissionRate = calc.commissionRate;
      base.commissionAmount = calc.commissionAmountRub;
      base.commissionAmountKop = calc.commissionAmountKop;
      if (params.payment.paymentId) {
        base.paymentId = params.payment.paymentId;
      }
      if (params.payment.paymentStatus) {
        base.paymentStatus = params.payment.paymentStatus;
      }
    }

    tx.set(ref, base);

    if (params.type === "payment" && params.payment) {
      const calc = computeB2BCommissionFromPaymentKop(params.payment.amountKop);
      const mgrRef = db.collection(PARTNER_MANAGERS_COLLECTION).doc(params.partnerManagerId);
      tx.set(
        mgrRef,
        {
          commissionAccruedKop: FieldValue.increment(calc.commissionAmountKop),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }

    return true;
  });

  return wrote;
}

/** Идемпотентный сторно комиссии при возврате после успешной оплаты. Возвращает true, если создан новый refund-событие. */
export async function reverseB2BPartnerManagerCommissionIfNeeded(params: {
  db: Firestore;
  orderId: string;
  userId: string;
  paymentStatus: unknown;
}): Promise<boolean> {
  if (!isTbankAcquiringRefundLikeStatus(params.paymentStatus)) return false;

  const oid = String(params.orderId || "").trim();
  const uid = String(params.userId || "").trim();
  if (!oid || !uid) return false;

  const paymentDocId = `payment_${safeOrderIdForDoc(oid)}`;
  const refundDocId = `refund_${safeOrderIdForDoc(oid)}`;
  const { db } = params;

  type RefundNotify = {
    partnerManagerId: string;
    partnerCode: string;
    commissionKop: number;
    tbankStatus: string;
  };

  try {
    const notify = await db.runTransaction(async (tx): Promise<RefundNotify | null> => {
      const refundRef = db.collection(PARTNER_EVENTS_COLLECTION).doc(refundDocId);
      const refundSnap = await tx.get(refundRef);
      if (refundSnap.exists) return null;

      const paymentRef = db.collection(PARTNER_EVENTS_COLLECTION).doc(paymentDocId);
      const paymentSnap = await tx.get(paymentRef);
      if (!paymentSnap.exists) return null;

      const p = paymentSnap.data() ?? {};
      if (String(p.type || "") !== "payment") return null;
      const eventUser = String(p.userId || "").trim();
      if (eventUser !== uid) return null;

      const partnerManagerId = String(p.partnerManagerId || "").trim();
      const partnerCode = String(p.partnerCode || "").trim();
      const commissionKop = Math.round(Number(p.commissionAmountKop));
      if (!partnerManagerId || !partnerCode) return null;
      if (!Number.isFinite(commissionKop) || commissionKop <= 0) return null;

      const neg = -commissionKop;
      const tbankStatus = String(params.paymentStatus ?? "").trim().toUpperCase();

      tx.set(refundRef, {
        type: "refund",
        userId: uid,
        partnerManagerId,
        partnerCode,
        orderId: oid,
        commissionAmountKop: neg,
        commissionAmount: neg / 100,
        relatedPaymentEventId: paymentDocId,
        originalPaymentStatus: p.paymentStatus ?? null,
        reversalPaymentStatus: tbankStatus,
        createdAt: FieldValue.serverTimestamp(),
      });

      const mgrRef = db.collection(PARTNER_MANAGERS_COLLECTION).doc(partnerManagerId);
      tx.set(
        mgrRef,
        {
          commissionAccruedKop: FieldValue.increment(neg),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      return { partnerManagerId, partnerCode, commissionKop: neg, tbankStatus };
    });

    if (notify) {
      try {
        const mgrSnap = await db
          .collection(PARTNER_MANAGERS_COLLECTION)
          .doc(notify.partnerManagerId)
          .get();
        const mgr = mgrSnap.data() as PartnerManagerDoc | undefined;
        const chatId = mgr?.telegramChatId ?? 0;

        await notifyAdminPartnerManagerEvent(db, {
          type: "refund",
          userId: uid,
          partnerManagerId: notify.partnerManagerId,
          orderId: oid,
          commissionAmountKop: notify.commissionKop,
          tbankStatus: notify.tbankStatus,
        });
        await notifyPartnerManagerEvent(db, {
          type: "refund",
          managerTelegramChatId: chatId,
          partnerManagerId: notify.partnerManagerId,
          commissionKop: notify.commissionKop,
        });
      } catch (e) {
        console.error("[reverseB2BPartnerManagerCommissionIfNeeded] notify failed", e);
      }
      return true;
    }

    return false;
  } catch (e) {
    console.error("[reverseB2BPartnerManagerCommissionIfNeeded]", e);
    return false;
  }
}

/**
 * B2B-комиссия только после подтверждённого успешного статуса T-Bank и сверки суммы с тарифом.
 * Не начисляет при регистрации, первом расчёте или без реальной оплаты.
 */
export async function tryCreditB2BPartnerManagerPaymentIfVerified(params: {
  db: Firestore;
  paymentStatus: unknown;
  orderId: string;
  userId: string;
  /** Сумма из уведомления банка / GetState (копейки). */
  amountKopFromBank: number;
  /** Ожидаемая сумма тарифа (по умолчанию месячная подписка). */
  expectedAmountKop?: number;
  paymentId?: string;
}): Promise<void> {
  const { db } = params;
  const expected =
    typeof params.expectedAmountKop === "number" && Number.isFinite(params.expectedAmountKop)
      ? Math.round(params.expectedAmountKop)
      : TBANK_MONTHLY_AMOUNT_KOPECKS;

  const oid = String(params.orderId || "").trim();
  const uid = String(params.userId || "").trim();
  if (!oid || !uid) return;

  if (!isTbankAcquiringPaymentSuccess(params.paymentStatus)) return;

  const bankKop = Math.round(Number(params.amountKopFromBank));
  if (!Number.isFinite(bankKop) || bankKop <= 0) return;
  if (bankKop !== expected || expected !== TBANK_MONTHLY_AMOUNT_KOPECKS) return;

  const userRef = db.collection(PRICING_FS.users).doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) return;
  const u = userSnap.data() ?? {};
  const partnerManagerId =
    typeof u.partnerManagerId === "string" ? u.partnerManagerId.trim() : "";
  const partnerCode = typeof u.partnerCode === "string" ? u.partnerCode.trim() : "";
  if (!partnerManagerId || !partnerCode) return;

  const mgrSnap = await db.collection(PARTNER_MANAGERS_COLLECTION).doc(partnerManagerId).get();
  if (!mgrSnap.exists) return;
  const mgr = mgrSnap.data() as PartnerManagerDoc;
  if (mgr.active !== true) return;

  const eventId = `payment_${safeOrderIdForDoc(oid)}`;
  const wrote = await recordPartnerEventOnce(db, {
    eventId,
    type: "payment",
    userId: uid,
    partnerManagerId,
    partnerCode,
    payment: {
      orderId: oid,
      amountKop: bankKop,
      paymentId: params.paymentId,
      paymentStatus: String(params.paymentStatus ?? "").trim().toUpperCase(),
    },
  });

  if (wrote) {
    try {
      await notifyAdminPartnerManagerEvent(db, {
        type: "payment",
        userId: uid,
        partnerManagerId,
        orderId: oid,
        amountKop: bankKop,
      });
      await notifyPartnerManagerEvent(db, {
        type: "payment",
        managerTelegramChatId: mgr.telegramChatId,
        partnerManagerId,
        amountKop: bankKop,
      });
    } catch (e) {
      console.error("[tryCreditB2BPartnerManagerPaymentIfVerified] notify failed", e);
    }
  }
}

/** @deprecated Используйте tryCreditB2BPartnerManagerPaymentIfVerified — с проверкой статуса и суммы. */
export async function creditB2BPartnerManagerPaymentIfNeeded(params: {
  db: Firestore;
  paidUserId: string;
  orderId: string;
  amountKopecks: number;
  paymentId?: string;
}): Promise<void> {
  await tryCreditB2BPartnerManagerPaymentIfVerified({
    db: params.db,
    paymentStatus: "CONFIRMED",
    orderId: params.orderId,
    userId: params.paidUserId,
    amountKopFromBank: params.amountKopecks,
    paymentId: params.paymentId,
  });
}

export type PartnerManagerStats = {
  managerId: string;
  code: string;
  name: string;
  active: boolean;
  registrations: number;
  firstCalculations: number;
  payments: number;
  activeTrials: number;
  commissionAccruedKop: number;
  commissionPaidOutKop: number;
  commissionAccruedRub: number;
  commissionPendingPayoutRub: number;
};

async function countUsersActiveTrialForManager(
  db: Firestore,
  partnerManagerId: string
): Promise<number> {
  const q = await db
    .collection(PRICING_FS.users)
    .where("partnerManagerId", "==", partnerManagerId)
    .get();
  const now = Date.now();
  let n = 0;
  for (const d of q.docs) {
    const u = d.data() as Record<string, unknown>;
    if (u.hasPaid === true) continue;
    const end = getTrialEndMsFromRecord(u);
    if (end > now) n += 1;
  }
  return n;
}

export async function getPartnerManagerStats(
  db: Firestore,
  managerId: string
): Promise<PartnerManagerStats | null> {
  const doc = await db.collection(PARTNER_MANAGERS_COLLECTION).doc(managerId).get();
  if (!doc.exists) return null;
  const m = doc.data() as PartnerManagerDoc;

  const ev = await db
    .collection(PARTNER_EVENTS_COLLECTION)
    .where("partnerManagerId", "==", managerId)
    .get();

  let registrations = 0;
  let firstCalculations = 0;
  let payments = 0;
  let commissionFromEventsKop = 0;

  for (const e of ev.docs) {
    const t = e.get("type");
    if (t === "registration") registrations += 1;
    else if (t === "first_calculation") firstCalculations += 1;
    else if (t === "payment") {
      payments += 1;
      const ck = e.get("commissionAmountKop");
      if (typeof ck === "number" && Number.isFinite(ck)) {
        commissionFromEventsKop += ck;
      }
    } else if (t === "refund") {
      const ck = e.get("commissionAmountKop");
      if (typeof ck === "number" && Number.isFinite(ck)) {
        commissionFromEventsKop += ck;
      }
    }
  }

  const accrued =
    typeof m.commissionAccruedKop === "number" && Number.isFinite(m.commissionAccruedKop)
      ? Math.round(m.commissionAccruedKop)
      : commissionFromEventsKop;
  const paidOut =
    typeof m.commissionPaidOutKop === "number" && Number.isFinite(m.commissionPaidOutKop)
      ? Math.round(m.commissionPaidOutKop)
      : 0;

  const activeTrials = await countUsersActiveTrialForManager(db, managerId);

  return {
    managerId,
    code: m.code,
    name: m.name,
    active: m.active,
    registrations,
    firstCalculations,
    payments,
    activeTrials,
    commissionAccruedKop: accrued,
    commissionPaidOutKop: paidOut,
    commissionAccruedRub: accrued / 100,
    commissionPendingPayoutRub: (accrued - paidOut) / 100,
  };
}

export async function getPartnerManagerByTelegramUserId(
  db: Firestore,
  telegramUserId: number
): Promise<{ id: string; data: PartnerManagerDoc } | null> {
  const q = await db
    .collection(PARTNER_MANAGERS_COLLECTION)
    .where("telegramUserId", "==", telegramUserId)
    .limit(2)
    .get();
  if (q.empty || q.docs.length !== 1) return null;
  const d = q.docs[0]!;
  return { id: d.id, data: d.data() as PartnerManagerDoc };
}

export async function getAllPartnerManagersStats(db: Firestore): Promise<PartnerManagerStats[]> {
  const snap = await db.collection(PARTNER_MANAGERS_COLLECTION).get();
  const out: PartnerManagerStats[] = [];
  for (const d of snap.docs) {
    const s = await getPartnerManagerStats(db, d.id);
    if (s) out.push(s);
  }
  out.sort((a, b) => a.code.localeCompare(b.code));
  return out;
}

export async function setPartnerManagerActiveByCode(
  db: Firestore,
  rawCode: string,
  active: boolean
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "invalid_code" }> {
  const m = await getPartnerManagerByCode(db, rawCode);
  if (!m) return { ok: false, reason: "invalid_code" };
  await db
    .collection(PARTNER_MANAGERS_COLLECTION)
    .doc(m.id)
    .set({ active, updatedAt: new Date().toISOString() }, { merge: true });
  return { ok: true };
}

export type PartnerClientListRow = {
  uid: string;
  displayLine: string;
  statusLine: string;
  dateMs: number;
};

function clientStatusLine(u: Record<string, unknown>): string {
  if (u.hasPaid === true) return "оплатил";
  if (firestoreTimeToMs(u.firstCalculationAt) > 0) return "сделал расчёт";
  return "зарегистрировался";
}

export async function listPartnerClientsForManager(
  db: Firestore,
  partnerManagerId: string,
  limit = 10,
  options?: { maskClientPrivacy?: boolean }
): Promise<PartnerClientListRow[]> {
  const mask = options?.maskClientPrivacy === true;
  const snap = await db
    .collection(PRICING_FS.users)
    .where("partnerManagerId", "==", partnerManagerId)
    .get();
  const rows: PartnerClientListRow[] = snap.docs.map((d) => {
    const u = d.data() as Record<string, unknown>;
    const email = typeof u.email === "string" ? u.email.trim() : "";
    let displayLine: string;
    if (mask) {
      if (email) {
        displayLine = maskEmailForManager(email) ?? "Пользователь: ***";
      } else {
        displayLine = `Пользователь: ${d.id.slice(0, 6)}`;
      }
    } else {
      const tgId =
        (typeof u.telegramUserId === "string" && u.telegramUserId.trim()) ||
        (typeof u.telegramId === "string" && u.telegramId.trim()) ||
        "";
      if (email) displayLine = email;
      else if (tgId) displayLine = `Telegram ID: ${tgId}`;
      else displayLine = `Пользователь: ${d.id.slice(0, 6)}`;
    }
    const dateMs = Math.max(
      firestoreTimeToMs(u.partnerAttachedAt),
      firestoreTimeToMs(u.createdAt)
    );
    return {
      uid: d.id,
      displayLine,
      statusLine: clientStatusLine(u),
      dateMs: dateMs > 0 ? dateMs : 0,
    };
  });
  rows.sort((a, b) => b.dateMs - a.dateMs);
  return rows.slice(0, limit);
}

export type PartnerPayoutRow = {
  id: string;
  amountRub: number;
  createdAtMs: number;
  note?: string;
};

export async function listPartnerPayoutsForManager(
  db: Firestore,
  partnerManagerId: string,
  limit = 5
): Promise<PartnerPayoutRow[]> {
  const snap = await db
    .collection(PARTNER_PAYOUTS_COLLECTION)
    .where("partnerManagerId", "==", partnerManagerId)
    .limit(80)
    .get();
  const rows: PartnerPayoutRow[] = snap.docs.map((d) => {
    const x = d.data() as Record<string, unknown>;
    const rub =
      typeof x.amountRub === "number" && Number.isFinite(x.amountRub)
        ? x.amountRub
        : Math.round(Number(x.amountKop) || 0) / 100;
    const note = typeof x.note === "string" ? x.note : undefined;
    return {
      id: d.id,
      amountRub: rub,
      createdAtMs: firestoreTimeToMs(x.createdAt),
      note,
    };
  });
  rows.sort((a, b) => b.createdAtMs - a.createdAtMs);
  return rows.slice(0, limit);
}

function formatDdMm(ms: number): string {
  if (!ms || ms <= 0) return "—";
  return new Date(ms).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" });
}

export async function buildPartnerRecentEventsLinesForAdmin(
  db: Firestore,
  partnerManagerId: string,
  maxLines = 15
): Promise<string[]> {
  const snap = await db
    .collection(PARTNER_EVENTS_COLLECTION)
    .where("partnerManagerId", "==", partnerManagerId)
    .limit(400)
    .get();

  type Ev = {
    type: string;
    userId: string;
    createdMs: number;
    amountRub?: number;
    commissionRub?: number;
  };
  const events: Ev[] = snap.docs.map((d) => {
    const x = d.data() as Record<string, unknown>;
    return {
      type: String(x.type || ""),
      userId: String(x.userId || ""),
      createdMs: firestoreTimeToMs(x.createdAt),
      amountRub: typeof x.amount === "number" ? x.amount : undefined,
      commissionRub:
        typeof x.commissionAmount === "number" ? x.commissionAmount : undefined,
    };
  });
  events.sort((a, b) => b.createdMs - a.createdMs);

  const picked = events
    .filter((e) =>
      ["registration", "first_calculation", "payment"].includes(e.type)
    )
    .slice(0, maxLines);

  const uids = [...new Set(picked.map((e) => e.userId).filter(Boolean))];
  const emailByUid = new Map<string, string>();
  await Promise.all(
    uids.map(async (uid) => {
      const us = await db.collection(PRICING_FS.users).doc(uid).get();
      const em = (us.data() as Record<string, unknown> | undefined)?.email;
      if (typeof em === "string" && em.trim()) emailByUid.set(uid, em.trim());
    })
  );

  const lines: string[] = [];
  for (const e of picked) {
    const email = emailByUid.get(e.userId) || `${e.userId.slice(0, 6)}…`;
    const dstr = formatDdMm(e.createdMs);
    if (e.type === "registration") {
      lines.push(`- регистрация ${email} ${dstr}`);
    } else if (e.type === "first_calculation") {
      lines.push(`- первый расчёт ${email} ${dstr}`);
    } else if (e.type === "payment") {
      const ar = e.amountRub ?? 0;
      const cr = e.commissionRub ?? 0;
      lines.push(`- оплата ${ar.toFixed(0)} ₽ / бонус ${cr.toFixed(2)} ₽ ${dstr}`);
    }
  }
  return lines;
}

export type CreatePartnerManagerInput = {
  name: string;
  telegramUserId: number;
  createdByAdminTelegramId: number;
  phone?: string;
};

export async function createPartnerManagerAdmin(
  db: Firestore,
  input: CreatePartnerManagerInput
): Promise<
  | { ok: true; managerId: string; code: string }
  | { ok: false; reason: "duplicate_code" | "transaction_failed" }
> {
  let code: string;
  try {
    code = await allocateUniquePartnerManagerCode(db);
  } catch {
    return { ok: false, reason: "transaction_failed" };
  }

  try {
    const managerId = await db.runTransaction(async (tx) => {
      const dup = await tx.get(
        db.collection(PARTNER_MANAGERS_COLLECTION).where("code", "==", code).limit(1)
      );
      if (!dup.empty) {
        throw new Error("duplicate_code");
      }

      const ref = db.collection(PARTNER_MANAGERS_COLLECTION).doc();
      const payload: Record<string, unknown> = {
        name: input.name.trim().slice(0, 200),
        code,
        telegramUserId: input.telegramUserId,
        telegramChatId: input.telegramUserId,
        active: true,
        createdAt: FieldValue.serverTimestamp(),
        createdByAdminTelegramId: input.createdByAdminTelegramId,
        commissionAccruedKop: 0,
        commissionPaidOutKop: 0,
      };
      const ph = input.phone?.trim();
      if (ph) payload.phone = ph.slice(0, 40);
      tx.set(ref, payload);
      return ref.id;
    });
    return { ok: true, managerId, code };
  } catch (e) {
    if (String(e instanceof Error ? e.message : e) === "duplicate_code") {
      return { ok: false, reason: "duplicate_code" };
    }
    console.error("[createPartnerManagerAdmin]", e);
    return { ok: false, reason: "transaction_failed" };
  }
}

export async function createSelfRegisteredPartnerManager(params: {
  db: Firestore;
  name: string;
  phone: string;
  telegramUserId: number;
  telegramChatId: number;
  telegramUsername?: string | null;
}): Promise<
  | { ok: true; managerId: string; code: string }
  | {
      ok: false;
      reason: "duplicate_telegram" | "code_allocation_failed" | "transaction_failed";
    }
> {
  for (let attempt = 0; attempt < 100; attempt++) {
    let code: string;
    try {
      code = await allocateUniquePartnerManagerCode(params.db);
    } catch {
      return { ok: false, reason: "code_allocation_failed" };
    }

    const ref = params.db.collection(PARTNER_MANAGERS_COLLECTION).doc();
    try {
      const managerId = await params.db.runTransaction(async (tx) => {
        const tgDup = await tx.get(
          params.db
            .collection(PARTNER_MANAGERS_COLLECTION)
            .where("telegramUserId", "==", params.telegramUserId)
            .limit(1)
        );
        if (!tgDup.empty) {
          throw new Error("dup_telegram");
        }

        const codeDup = await tx.get(
          params.db
            .collection(PARTNER_MANAGERS_COLLECTION)
            .where("code", "==", code)
            .limit(1)
        );
        if (!codeDup.empty) {
          throw new Error("dup_code");
        }

        const payload: Record<string, unknown> = {
          name: params.name.trim().slice(0, 200),
          code,
          phone: params.phone.trim().slice(0, 40),
          telegramUserId: params.telegramUserId,
          telegramChatId: params.telegramChatId,
          active: true,
          createdAt: FieldValue.serverTimestamp(),
          createdByAdminTelegramId: null,
          selfRegistered: true,
          signupSource: "telegram_bot",
          commissionAccruedKop: 0,
          commissionPaidOutKop: 0,
        };
        const tu = params.telegramUsername?.trim();
        if (tu) payload.telegramUsername = tu.slice(0, 64);

        tx.set(ref, payload);
        return ref.id;
      });
      return { ok: true, managerId, code };
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      if (msg === "dup_telegram") {
        return { ok: false, reason: "duplicate_telegram" };
      }
      if (msg === "dup_code") {
        continue;
      }
      console.error("[createSelfRegisteredPartnerManager]", e);
      return { ok: false, reason: "transaction_failed" };
    }
  }
  return { ok: false, reason: "code_allocation_failed" };
}

/**
 * Отметка первого расчёта + событие B2B (идемпотентно).
 * Возвращает true, если firstCalculationAt был записан впервые.
 */
export async function markFirstCalculationIfNeededAndRecordB2B(
  db: Firestore,
  uid: string
): Promise<boolean> {
  const userRef = db.collection(PRICING_FS.users).doc(uid);

  const wrote = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) return false;
    const data = snap.data() ?? {};
    if (firestoreTimeToMs(data.firstCalculationAt) > 0) {
      return false;
    }
    tx.set(
      userRef,
      {
        firstCalculationAt: Date.now(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    return true;
  });

  if (!wrote) return false;

  const after = await userRef.get();
  const u = after.data() ?? {};
  const partnerManagerId =
    typeof u.partnerManagerId === "string" ? u.partnerManagerId.trim() : "";
  const partnerCode = typeof u.partnerCode === "string" ? u.partnerCode.trim() : "";
  if (!partnerManagerId || !partnerCode) return true;

  const mgrSnap = await db.collection(PARTNER_MANAGERS_COLLECTION).doc(partnerManagerId).get();
  const mgr = mgrSnap.data() as PartnerManagerDoc | undefined;

  const eventWrote = await recordPartnerEventOnce(db, {
    eventId: `first_calculation_${uid}`,
    type: "first_calculation",
    userId: uid,
    partnerManagerId,
    partnerCode,
  });

  if (eventWrote) {
    try {
      await notifyAdminPartnerManagerEvent(db, {
        type: "first_calculation",
        userId: uid,
        partnerManagerId,
      });
      await notifyPartnerManagerEvent(db, {
        type: "first_calculation",
        managerTelegramChatId: mgr?.telegramChatId ?? 0,
        partnerManagerId,
      });
    } catch (e) {
      console.error("[markFirstCalculationIfNeededAndRecordB2B] notify failed", e);
    }
  }

  return true;
}
