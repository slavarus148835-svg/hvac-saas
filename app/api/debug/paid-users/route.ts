import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { firestoreTimeToMs } from "@/lib/server/firestoreTimeMs";
import {
  getAccessPaidMatchReasons,
  getConfirmedBankPaymentReasons,
  isPaidUserForStatsTotals,
  isSuspiciousAccessOnlyLegacy,
  userHasConfirmedBankPayment,
  type UserRecord,
} from "@/lib/server/statsPaidUser";

export const runtime = "nodejs";

function assertAdminDebugQuerySecret(req: Request): NextResponse | null {
  const url = new URL(req.url);
  const provided = String(url.searchParams.get("secret") ?? "").trim();
  const primary = String(process.env.ADMIN_DEBUG_SECRET ?? "").trim();
  const fallback = String(process.env.CRON_SECRET ?? "").trim();
  if (!primary && !fallback) {
    return NextResponse.json(
      { error: "admin_debug_secret_not_configured" },
      { status: 503 }
    );
  }
  const ok =
    (primary.length > 0 && provided === primary) ||
    (fallback.length > 0 && provided === fallback);
  if (!ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

function deepJsonSerializable(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "object") return value;
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    try {
      const d = (value as { toDate: () => Date }).toDate();
      return { _firestoreTimestamp: d.toISOString() };
    } catch {
      return "[Timestamp]";
    }
  }
  if (Array.isArray(value)) return value.map(deepJsonSerializable);
  const o = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(o)) {
    out[k] = deepJsonSerializable(o[k]);
  }
  return out;
}

function msToIso(ms: number): string | null {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms).toISOString();
}

type PaidUserDebugRow = {
  uid: string;
  email: string | null;
  displayName: string | null;
  telegramUsername: string | null;
  telegramUserId: string | null;
  telegramId: string | null;
  telegramChatId: string | null;
  createdAt: string | null;
  firstCalculationAt: string | null;
  hasPaid: boolean;
  paidUntil: string | null;
  paidUntilMs: number;
  plan: unknown;
  lastPaymentConfirmed: unknown;
  lastPaymentIntent: unknown;
  orderId: string | null;
  paymentIntentId: string | null;
  /** Ветки широкого доступа (`isPaidUserForStatsTotals`). */
  paidMatchReasons: string[];
  /** Почему считается подтверждённой банковской оплатой (пусто если нет). */
  confirmedPaymentReasons: string[];
  /** То же, что `confirmedPaymentReasons` (явное имя для отладки). */
  confirmedBankPaymentReasons: string[];
  suspiciousLegacyPaidOnly: boolean;
};

function buildRow(
  docId: string,
  data: Record<string, unknown>,
  nowMs: number
): PaidUserDebugRow {
  const user: UserRecord = data;
  const lpi = data.lastPaymentIntent;
  let orderId: string | null = null;
  let paymentIntentId: string | null = null;
  if (lpi && typeof lpi === "object" && !Array.isArray(lpi)) {
    const o = lpi as Record<string, unknown>;
    if (typeof o.orderId === "string") orderId = o.orderId;
    if (typeof o.paymentIntentId === "string") paymentIntentId = o.paymentIntentId;
  }
  const lpc = data.lastPaymentConfirmed;
  if (!orderId && lpc && typeof lpc === "object" && !Array.isArray(lpc)) {
    const o = lpc as Record<string, unknown>;
    if (typeof o.orderId === "string") orderId = o.orderId;
  }

  const paidUntilMs = firestoreTimeToMs(data.paidUntil);
  const createdMs = firestoreTimeToMs(data.createdAt);
  const firstCalcMs = firestoreTimeToMs(data.firstCalculationAt);

  const tgUser =
    typeof data.telegramUserId === "string" && data.telegramUserId.trim()
      ? data.telegramUserId.trim()
      : null;
  const tgIdAlt =
    typeof data.telegramId === "string" && data.telegramId.trim()
      ? data.telegramId.trim()
      : null;

  const bankOk = userHasConfirmedBankPayment(user);
  const accessReasons = getAccessPaidMatchReasons(user, nowMs);
  const suspiciousLegacy = isSuspiciousAccessOnlyLegacy(accessReasons, bankOk);
  const confirmedReasons = getConfirmedBankPaymentReasons(user);

  return {
    uid: docId,
    email: typeof data.email === "string" ? data.email : null,
    displayName:
      typeof data.displayName === "string"
        ? data.displayName
        : typeof data.name === "string"
          ? data.name
          : null,
    telegramUsername:
      typeof data.telegramUsername === "string" ? data.telegramUsername : null,
    telegramUserId: tgUser,
    telegramId: tgIdAlt,
    telegramChatId:
      typeof data.telegramChatId === "string" ? data.telegramChatId : null,
    createdAt: msToIso(createdMs),
    firstCalculationAt: msToIso(firstCalcMs),
    hasPaid: data.hasPaid === true,
    paidUntil: msToIso(paidUntilMs),
    paidUntilMs,
    plan: data.plan ?? null,
    lastPaymentConfirmed: deepJsonSerializable(data.lastPaymentConfirmed ?? null),
    lastPaymentIntent: deepJsonSerializable(data.lastPaymentIntent ?? null),
    orderId,
    paymentIntentId,
    paidMatchReasons: accessReasons,
    confirmedPaymentReasons: confirmedReasons,
    confirmedBankPaymentReasons: confirmedReasons,
    suspiciousLegacyPaidOnly: suspiciousLegacy,
  };
}

export async function GET(req: Request) {
  const denied = assertAdminDebugQuerySecret(req);
  if (denied) return denied;

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ error: "no_admin" }, { status: 503 });
  }

  const nowMs = Date.now();
  const snap = await db.collection(PRICING_FS.users).get();

  const confirmedBankPaidUsers: PaidUserDebugRow[] = [];
  const accessPaidUsers: PaidUserDebugRow[] = [];
  const suspiciousLegacyOnly: PaidUserDebugRow[] = [];

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const user: UserRecord = data;
    const row = buildRow(doc.id, data, nowMs);

    if (userHasConfirmedBankPayment(user)) {
      confirmedBankPaidUsers.push(row);
    }
    if (isPaidUserForStatsTotals(user, nowMs)) {
      accessPaidUsers.push(row);
      if (row.suspiciousLegacyPaidOnly) {
        suspiciousLegacyOnly.push(row);
      }
    }
  }

  const sortByUid = (a: PaidUserDebugRow, b: PaidUserDebugRow) =>
    a.uid.localeCompare(b.uid);
  confirmedBankPaidUsers.sort(sortByUid);
  accessPaidUsers.sort(sortByUid);
  suspiciousLegacyOnly.sort(sortByUid);

  return NextResponse.json({
    ok: true,
    matchedLogic: {
      confirmedBankPayment:
        "userHasConfirmedBankPayment — lastPaymentConfirmed.orderId, source не debug_grant, source пустой (legacy webhook) или getstate/webhook",
      accessPaid: "isPaidUserForStatsTotals — широкий платный доступ (для «Имеют доступ»)",
    },
    nowMs,
    nowIso: new Date(nowMs).toISOString(),
    confirmedBankPaidTotal: confirmedBankPaidUsers.length,
    accessPaidTotal: accessPaidUsers.length,
    suspiciousLegacyOnlyTotal: suspiciousLegacyOnly.length,
    suspiciousLegacyNote:
      "Доступ по широкой логике только plan/paidAt без подтверждённого Т-Банка и без hasPaid/lpc-объекта/paidUntil в будущем.",
    confirmedBankPaidUsers,
    accessPaidUsers,
    suspiciousLegacyOnly,
    /** @deprecated Используйте accessPaidUsers */
    users: accessPaidUsers,
  });
}
