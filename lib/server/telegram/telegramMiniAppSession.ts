import { createHash, randomBytes } from "crypto";
import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";

export const TELEGRAM_MINIAPP_SESSIONS_COLLECTION = "telegramMiniAppSessions";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashTelegramMiniAppSessionToken(rawToken: string): string {
  return createHash("sha256").update(String(rawToken).trim(), "utf8").digest("hex");
}

export type TelegramMiniAppPublicProfile = {
  uid: string;
  email: string | null;
  plan: string | null;
  hasPaid: boolean;
  blocked: boolean;
  telegramUserId: string | null;
  telegramId: string | null;
  telegramUsername: string | null;
};

export function telegramMiniAppPublicProfileFromUserDoc(
  uid: string,
  data: Record<string, unknown>
): TelegramMiniAppPublicProfile {
  return {
    uid,
    email: typeof data.email === "string" ? data.email : null,
    plan: typeof data.plan === "string" ? data.plan : null,
    hasPaid: data.hasPaid === true,
    blocked: data.blocked === true,
    telegramUserId:
      typeof data.telegramUserId === "string" ? data.telegramUserId : null,
    telegramId: typeof data.telegramId === "string" ? data.telegramId : null,
    telegramUsername:
      typeof data.telegramUsername === "string" ? data.telegramUsername : null,
  };
}

export type CreateTelegramMiniAppSessionParams = {
  uid: string;
  telegramUserId: string;
  userAgent?: string | null;
  ipHash?: string | null;
};

/**
 * Создаёт сессию Mini App: в Firestore — только hash(rawToken), клиенту — raw token.
 */
export async function createTelegramMiniAppSession(
  db: Firestore,
  params: CreateTelegramMiniAppSessionParams
): Promise<{ sessionToken: string }> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashTelegramMiniAppSessionToken(rawToken);
  const now = Date.now();
  const expiresAt = Timestamp.fromMillis(now + SESSION_TTL_MS);

  await db.collection(TELEGRAM_MINIAPP_SESSIONS_COLLECTION).doc(tokenHash).set({
    uid: params.uid,
    telegramUserId: params.telegramUserId,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
    lastUsedAt: FieldValue.serverTimestamp(),
    userAgent:
      typeof params.userAgent === "string" && params.userAgent.trim()
        ? params.userAgent.trim().slice(0, 512)
        : null,
    ipHash:
      typeof params.ipHash === "string" && params.ipHash.trim()
        ? params.ipHash.trim()
        : null,
    revoked: false,
  });

  return { sessionToken: rawToken };
}

export type VerifyTelegramMiniAppSessionResult =
  | { ok: true; uid: string; telegramUserId: string }
  | { ok: false; error: string };

export async function verifyTelegramMiniAppSession(
  db: Firestore,
  sessionToken: string
): Promise<VerifyTelegramMiniAppSessionResult> {
  const trimmed = typeof sessionToken === "string" ? sessionToken.trim() : "";
  if (!trimmed) {
    return { ok: false, error: "missing_token" };
  }

  const tokenHash = hashTelegramMiniAppSessionToken(trimmed);
  const ref = db.collection(TELEGRAM_MINIAPP_SESSIONS_COLLECTION).doc(tokenHash);
  const snap = await ref.get();
  if (!snap.exists) {
    return { ok: false, error: "not_found" };
  }

  const data = snap.data() as Record<string, unknown> | undefined;
  if (!data) {
    return { ok: false, error: "invalid_doc" };
  }

  if (data.revoked === true) {
    return { ok: false, error: "revoked" };
  }

  const exp = data.expiresAt;
  let expiresMs: number | null = null;
  if (exp instanceof Timestamp) {
    expiresMs = exp.toMillis();
  } else if (
    exp &&
    typeof exp === "object" &&
    "toMillis" in exp &&
    typeof (exp as Timestamp).toMillis === "function"
  ) {
    expiresMs = (exp as Timestamp).toMillis();
  }
  if (expiresMs === null || expiresMs <= Date.now()) {
    return { ok: false, error: "expired" };
  }

  const uid = typeof data.uid === "string" ? data.uid : "";
  const telegramUserId =
    typeof data.telegramUserId === "string" ? data.telegramUserId : "";
  if (!uid || !telegramUserId) {
    return { ok: false, error: "invalid_session_fields" };
  }

  await ref.update({ lastUsedAt: FieldValue.serverTimestamp() });

  return { ok: true, uid, telegramUserId };
}

export async function revokeTelegramMiniAppSession(
  db: Firestore,
  sessionToken: string
): Promise<boolean> {
  const trimmed = typeof sessionToken === "string" ? sessionToken.trim() : "";
  if (!trimmed) return false;
  const tokenHash = hashTelegramMiniAppSessionToken(trimmed);
  const ref = db.collection(TELEGRAM_MINIAPP_SESSIONS_COLLECTION).doc(tokenHash);
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.update({ revoked: true });
  return true;
}

export async function loadUserDocByUid(
  db: Firestore,
  uid: string
): Promise<{ data: Record<string, unknown> } | null> {
  const snap = await db.collection(PRICING_FS.users).doc(uid).get();
  if (!snap.exists) return null;
  return { data: snap.data() as Record<string, unknown> };
}

export function normalizeTelegramUserIdForMiniApp(id: number): string {
  return String(Math.trunc(id)).replace(/\D/g, "");
}

/**
 * Поиск пользователя по telegramUserId / telegramId (как в miniapp-auth).
 */
export async function findUserDocByTelegramId(
  db: Firestore,
  tgId: string
): Promise<QueryDocumentSnapshot | null> {
  const q1 = await db
    .collection(PRICING_FS.users)
    .where("telegramUserId", "==", tgId)
    .limit(5)
    .get();
  const q2 = await db
    .collection(PRICING_FS.users)
    .where("telegramId", "==", tgId)
    .limit(5)
    .get();

  const seen = new Set<string>();
  for (const d of q1.docs) {
    if (!seen.has(d.id)) {
      seen.add(d.id);
      return d;
    }
  }
  for (const d of q2.docs) {
    if (!seen.has(d.id)) {
      seen.add(d.id);
      return d;
    }
  }
  return null;
}
