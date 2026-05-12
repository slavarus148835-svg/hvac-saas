import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";

type TelegramWebhookIdentity = {
  telegramUserId: string;
  telegramUsername: string | null;
  telegramChatId: string;
};

function normalizeTelegramUserId(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeTelegramChatId(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return String(Math.trunc(n));
}

function normalizeTelegramUsername(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return raw.replace(/^@+/, "") || null;
}

export function extractTelegramIdentityFromWebhook(message: {
  chat?: { id?: number };
  from?: { id?: number; username?: string };
}): TelegramWebhookIdentity | null {
  const telegramChatId = normalizeTelegramChatId(message.chat?.id);
  const telegramUserId = normalizeTelegramUserId(message.from?.id);
  if (!telegramChatId || !telegramUserId) return null;
  return {
    telegramUserId,
    telegramUsername: normalizeTelegramUsername(message.from?.username),
    telegramChatId,
  };
}

type LinkResult = {
  matchedUsers: number;
  wroteFallback: boolean;
};

/**
 * Best-effort sync Telegram identity from webhook event:
 * - updates linked users by telegramUserId / telegramId
 * - otherwise stores record in telegramUsers for later linkage
 */
export async function syncTelegramIdentityFromWebhook(
  db: Firestore,
  identity: TelegramWebhookIdentity
): Promise<LinkResult> {
  const now = new Date().toISOString();
  const payload = {
    telegramUserId: identity.telegramUserId,
    telegramUsername: identity.telegramUsername,
    telegramChatId: identity.telegramChatId,
    telegramLinkedAt: now,
    telegramOptIn: true,
    telegramBlocked: false,
    updatedAt: now,
  };

  const byUserId = await db
    .collection(PRICING_FS.users)
    .where("telegramUserId", "==", identity.telegramUserId)
    .get();
  const byTelegramId = await db
    .collection(PRICING_FS.users)
    .where("telegramId", "==", identity.telegramUserId)
    .get();

  const refs = new Map<string, DocumentReference>();
  for (const d of byUserId.docs) refs.set(d.ref.path, d.ref);
  for (const d of byTelegramId.docs) refs.set(d.ref.path, d.ref);

  if (refs.size > 0) {
    const batch = db.batch();
    for (const ref of refs.values()) {
      batch.set(ref, payload, { merge: true });
    }
    await batch.commit();
    return { matchedUsers: refs.size, wroteFallback: false };
  }

  await db.collection("telegramUsers").doc(identity.telegramUserId).set(
    {
      ...payload,
      lastSeenAt: now,
      linkedUid: null,
    },
    { merge: true }
  );
  return { matchedUsers: 0, wroteFallback: true };
}

