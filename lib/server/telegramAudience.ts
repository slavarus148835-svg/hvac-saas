import type {
  DocumentData,
  Firestore,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";

export type TelegramAudienceStats = {
  usersWithTelegramChatId: number;
  usersWithTelegramIdButNoChatId: number;
  telegramUsersCount: number;
  telegramUsersWithChatId: number;
  uniqueBroadcastTargets: number;
};

export type BroadcastRecipient =
  | { source: "user"; uid: string; chatId: string }
  | { source: "telegramUser"; docId: string; chatId: string };

function trimmedChatId(data: Record<string, unknown>): string {
  return String(data.telegramChatId ?? "").trim();
}

function hasTelegramIdentity(data: Record<string, unknown>): boolean {
  const u = String(data.telegramUserId ?? "").replace(/\D/g, "");
  const tid = String(data.telegramId ?? "").replace(/\D/g, "");
  return u.length > 0 || tid.length > 0;
}

function isEligibleForBroadcast(data: Record<string, unknown>): boolean {
  if (data.telegramBlocked === true) return false;
  if (data.telegramOptIn !== true) return false;
  return trimmedChatId(data).length > 0;
}

function asRecord(data: DocumentData): Record<string, unknown> {
  return data as Record<string, unknown>;
}

/**
 * Получатели рассылки: users и telegramUsers с opt-in и chat id, без дублей по chat_id.
 * При конфликте приоритет у записи из users (чтобы блокировка шла в users/{uid}).
 */
export function buildBroadcastRecipients(
  userDocs: QueryDocumentSnapshot[],
  telegramUserDocs: QueryDocumentSnapshot[]
): BroadcastRecipient[] {
  const byChatId = new Map<string, BroadcastRecipient>();

  for (const doc of userDocs) {
    const d = asRecord(doc.data());
    if (!isEligibleForBroadcast(d)) continue;
    const chatId = trimmedChatId(d);
    byChatId.set(chatId, { source: "user", uid: doc.id, chatId });
  }

  for (const doc of telegramUserDocs) {
    const d = asRecord(doc.data());
    if (!isEligibleForBroadcast(d)) continue;
    const chatId = trimmedChatId(d);
    if (!chatId || byChatId.has(chatId)) continue;
    byChatId.set(chatId, { source: "telegramUser", docId: doc.id, chatId });
  }

  return [...byChatId.values()];
}

export async function getTelegramAudienceStats(db: Firestore): Promise<TelegramAudienceStats> {
  const [usersSnap, telegramSnap] = await Promise.all([
    db.collection(PRICING_FS.users).get(),
    db.collection("telegramUsers").get(),
  ]);

  let usersWithTelegramChatId = 0;
  let usersWithTelegramIdButNoChatId = 0;

  for (const doc of usersSnap.docs) {
    const d = doc.data() as Record<string, unknown>;
    const chatOk = trimmedChatId(d).length > 0;
    if (chatOk) usersWithTelegramChatId++;
    else if (hasTelegramIdentity(d)) usersWithTelegramIdButNoChatId++;
  }

  let telegramUsersWithChatId = 0;
  for (const doc of telegramSnap.docs) {
    const d = doc.data() as Record<string, unknown>;
    if (trimmedChatId(d).length > 0) telegramUsersWithChatId++;
  }

  const recipients = buildBroadcastRecipients(usersSnap.docs, telegramSnap.docs);

  return {
    usersWithTelegramChatId,
    usersWithTelegramIdButNoChatId,
    telegramUsersCount: telegramSnap.size,
    telegramUsersWithChatId,
    uniqueBroadcastTargets: recipients.length,
  };
}
