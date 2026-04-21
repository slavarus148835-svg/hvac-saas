import type { Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";

export type LeadSource = "email" | "telegram";
export type LeadStatus = "started" | "completed";

export type LeadDoc = {
  email?: string;
  telegramId?: string;
  source: LeadSource;
  status: LeadStatus;
  createdAt: string;
  updatedAt: string;
  recoveryNudgeSentAt?: string;
};

function nowIso() {
  return new Date().toISOString();
}

export function leadDocIdForTelegram(telegramId: string): string {
  const digits = String(telegramId || "").replace(/\D/g, "");
  return `tg_${digits}`;
}

/** Старт воронки: отправка кода на email (есть Firebase uid). */
export async function upsertLeadEmailStarted(
  db: Firestore,
  uid: string,
  email: string
): Promise<void> {
  const ref = db.collection(PRICING_FS.leads).doc(uid);
  const snap = await ref.get();
  const createdAt = snap.exists ? String((snap.data() as LeadDoc)?.createdAt || nowIso()) : nowIso();
  const t = nowIso();
  const payload: LeadDoc = {
    email: String(email || "").trim(),
    source: "email",
    status: "started",
    createdAt,
    updatedAt: t,
  };
  await ref.set(payload, { merge: true });
}

/** Старт воронки: Telegram Login до выдачи сессии. */
export async function upsertLeadTelegramStarted(
  db: Firestore,
  telegramId: string
): Promise<void> {
  const id = leadDocIdForTelegram(telegramId);
  const ref = db.collection(PRICING_FS.leads).doc(id);
  const snap = await ref.get();
  const createdAt = snap.exists ? String((snap.data() as LeadDoc)?.createdAt || nowIso()) : nowIso();
  const t = nowIso();
  const payload: LeadDoc = {
    telegramId: String(telegramId || "").replace(/\D/g, ""),
    source: "telegram",
    status: "started",
    createdAt,
    updatedAt: t,
  };
  await ref.set(payload, { merge: true });
}

export async function markLeadCompletedForUid(db: Firestore, uid: string): Promise<void> {
  const ref = db.collection(PRICING_FS.leads).doc(uid);
  await ref.set(
    {
      status: "completed" as const,
      updatedAt: nowIso(),
    },
    { merge: true }
  );
}

export async function markLeadCompletedForTelegramId(
  db: Firestore,
  telegramId: string
): Promise<void> {
  const ref = db.collection(PRICING_FS.leads).doc(leadDocIdForTelegram(telegramId));
  await ref.set(
    {
      status: "completed" as const,
      updatedAt: nowIso(),
    },
    { merge: true }
  );
}

export function leadUpdatedAtMillis(data: Record<string, unknown> | undefined): number {
  if (!data) return 0;
  const u = data.updatedAt;
  if (u instanceof Timestamp) return u.toMillis();
  if (u && typeof u === "object" && "toMillis" in u && typeof (u as Timestamp).toMillis === "function") {
    return (u as Timestamp).toMillis();
  }
  if (typeof u === "string") {
    const t = Date.parse(u);
    return Number.isFinite(t) ? t : 0;
  }
  const c = data.createdAt;
  if (c instanceof Timestamp) return c.toMillis();
  if (typeof c === "string") {
    const t = Date.parse(c);
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}
