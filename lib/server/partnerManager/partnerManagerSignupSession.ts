import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { PARTNER_MANAGER_SIGNUP_SESSIONS_COLLECTION } from "@/lib/partner/b2bConstants";
import { firestoreTimeToMs } from "@/lib/server/firestoreTimeMs";

export type PartnerManagerSignupStep = "awaiting_name" | "awaiting_phone";

export type PartnerManagerSignupSessionDoc = {
  telegramUserId: number;
  telegramChatId: number;
  telegramUsername?: string;
  step: PartnerManagerSignupStep;
  name?: string;
  phone?: string;
  createdAt: unknown;
  updatedAt: unknown;
  expiresAt: unknown;
};

const SESSION_TTL_MS = 30 * 60 * 1000;

function sessionRef(db: Firestore, telegramUserId: number) {
  return db
    .collection(PARTNER_MANAGER_SIGNUP_SESSIONS_COLLECTION)
    .doc(String(telegramUserId));
}

export async function deletePartnerManagerSignupSession(
  db: Firestore,
  telegramUserId: number
): Promise<void> {
  await sessionRef(db, telegramUserId).delete().catch(() => undefined);
}

export function validatePartnerManagerSignupName(
  text: string
): { ok: true; name: string } | { ok: false } {
  const t = String(text ?? "").trim();
  if (!t || t.startsWith("/")) return { ok: false };
  if (t.length < 2 || t.length > 80) return { ok: false };
  return { ok: true, name: t };
}

export function validatePartnerManagerSignupPhone(
  text: string
): { ok: true; phone: string } | { ok: false } {
  const raw = String(text ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return { ok: false };
  const phone = `+${digits}`;
  if (phone.length > 22) return { ok: false };
  return { ok: true, phone };
}

export type PartnerManagerSignupLookup =
  | { status: "none" }
  | { status: "expired" }
  | { status: "active"; data: PartnerManagerSignupSessionDoc };

export async function lookupPartnerManagerSignupSession(
  db: Firestore,
  telegramUserId: number
): Promise<PartnerManagerSignupLookup> {
  const ref = sessionRef(db, telegramUserId);
  const snap = await ref.get();
  if (!snap.exists) return { status: "none" };
  const data = snap.data() as PartnerManagerSignupSessionDoc;
  const exp = firestoreTimeToMs(data.expiresAt);
  if (exp > 0 && Date.now() > exp) {
    await ref.delete().catch(() => undefined);
    return { status: "expired" };
  }
  return { status: "active", data };
}

export async function startPartnerManagerSignupSession(params: {
  db: Firestore;
  telegramUserId: number;
  telegramChatId: number;
  telegramUsername?: string | null;
}): Promise<void> {
  const now = Date.now();
  const expiresAt = Timestamp.fromMillis(now + SESSION_TTL_MS);
  const ref = sessionRef(params.db, params.telegramUserId);
  const payload: Record<string, unknown> = {
    telegramUserId: params.telegramUserId,
    telegramChatId: params.telegramChatId,
    step: "awaiting_name" satisfies PartnerManagerSignupStep,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    expiresAt,
  };
  const u = params.telegramUsername?.trim();
  if (u) payload.telegramUsername = u.slice(0, 64);
  await ref.set(payload, { merge: false });
}

export async function saveSignupSessionName(params: {
  db: Firestore;
  telegramUserId: number;
  name: string;
}): Promise<void> {
  const now = Date.now();
  const expiresAt = Timestamp.fromMillis(now + SESSION_TTL_MS);
  await sessionRef(params.db, params.telegramUserId).set(
    {
      name: params.name.slice(0, 80),
      step: "awaiting_phone" satisfies PartnerManagerSignupStep,
      updatedAt: FieldValue.serverTimestamp(),
      expiresAt,
    },
    { merge: true }
  );
}
