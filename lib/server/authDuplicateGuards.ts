import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import type { App } from "firebase-admin/app";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { normalizeEmailForAuth as normalizeEmailForAuthShared } from "@/lib/authEmailNormalize";
import { firestoreTimeToMs } from "@/lib/server/firestoreTimeMs";

export type MiniAppAuthStatus =
  | "existing_user_by_telegram"
  | "need_email_linking"
  | "existing_user_linked_by_email"
  | "new_user_created"
  | "duplicate_blocked";

export const normalizeEmailForAuth = normalizeEmailForAuthShared;

export type TelegramUserLookup =
  | { kind: "found"; doc: QueryDocumentSnapshot }
  | { kind: "none" }
  | { kind: "ambiguous"; ids: string[] };

function digitsOnly(s: string): string {
  return String(s ?? "").replace(/\D/g, "");
}

/**
 * Все users-документы, где совпадает telegramUserId / telegramId / telegramChatId.
 */
export async function collectUserDocsByTelegramKeys(
  db: Firestore,
  telegramNumericId: string,
  telegramChatId: string | null
): Promise<QueryDocumentSnapshot[]> {
  const tgId = digitsOnly(telegramNumericId);
  const chatId = telegramChatId ? digitsOnly(telegramChatId) : "";
  const seen = new Set<string>();
  const out: QueryDocumentSnapshot[] = [];

  const push = (docs: QueryDocumentSnapshot[]) => {
    for (const d of docs) {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        out.push(d);
      }
    }
  };

  if (tgId) {
    push(
      (await db.collection(PRICING_FS.users).where("telegramUserId", "==", tgId).limit(10).get())
        .docs
    );
    push(
      (await db.collection(PRICING_FS.users).where("telegramId", "==", tgId).limit(10).get()).docs
    );
  }
  if (chatId && chatId !== tgId) {
    push(
      (
        await db
          .collection(PRICING_FS.users)
          .where("telegramChatId", "==", chatId)
          .limit(10)
          .get()
      ).docs
    );
  }

  return out;
}

export async function findUserByTelegramKeys(
  db: Firestore,
  telegramNumericId: string,
  telegramChatId: string | null
): Promise<TelegramUserLookup> {
  const docs = await collectUserDocsByTelegramKeys(db, telegramNumericId, telegramChatId);
  if (docs.length === 0) return { kind: "none" };
  if (docs.length > 1) {
    console.log("AUTH_DUPLICATE_BLOCKED", {
      reason: "multiple_firestore_users_for_telegram_keys",
      ids: docs.map((d) => d.id),
    });
    return { kind: "ambiguous", ids: docs.map((d) => d.id) };
  }
  return { kind: "found", doc: docs[0]! };
}

export async function findConflictingUidForTelegramKeys(
  db: Firestore,
  telegramNumericId: string,
  telegramChatId: string | null,
  allowedUid: string
): Promise<string | null> {
  const docs = await collectUserDocsByTelegramKeys(db, telegramNumericId, telegramChatId);
  for (const d of docs) {
    if (d.id !== allowedUid) return d.id;
  }
  return null;
}

export async function findUsersByNormalizedEmail(
  db: Firestore,
  normalizedEmail: string
): Promise<QueryDocumentSnapshot[]> {
  const norm = normalizeEmailForAuth(normalizedEmail);
  if (!norm || !norm.includes("@")) return [];

  console.log("AUTH_DUPLICATE_CHECK_START", { field: "email", normalizedEmail: norm });

  const q1 = await db
    .collection(PRICING_FS.users)
    .where("normalizedEmail", "==", norm)
    .limit(25)
    .get();
  const q2 = await db.collection(PRICING_FS.users).where("email", "==", norm).limit(25).get();

  const seen = new Set<string>();
  const out: QueryDocumentSnapshot[] = [];
  for (const d of [...q1.docs, ...q2.docs]) {
    if (!seen.has(d.id)) {
      seen.add(d.id);
      out.push(d);
    }
  }
  if (out.length > 0) {
    console.log("AUTH_DUPLICATE_FOUND_BY_EMAIL", { count: out.length, uids: out.map((x) => x.id) });
  }
  return out;
}

export type TelegramLinkSafety =
  | { ok: true }
  | { ok: false; reason: "target_has_other_telegram" | "telegram_bound_elsewhere" };

/**
 * Нельзя привязать tg к uid, если у другого uid уже этот tg, или у цели уже другой tg.
 */
export async function assertSafeTelegramLinkToUser(
  db: Firestore,
  targetUid: string,
  targetData: Record<string, unknown>,
  telegramNumericId: string,
  telegramChatId: string | null
): Promise<TelegramLinkSafety> {
  const tgId = digitsOnly(telegramNumericId);
  const existingUserId = digitsOnly(String(targetData.telegramUserId ?? ""));
  const existingLegacyId = digitsOnly(String(targetData.telegramId ?? ""));
  const existing = existingUserId || existingLegacyId;
  if (existing && existing !== tgId) {
    console.log("AUTH_DUPLICATE_BLOCKED", {
      reason: "target_has_other_telegram",
      targetUid,
      existing,
      tgId,
    });
    return { ok: false, reason: "target_has_other_telegram" };
  }

  const otherUid = await findConflictingUidForTelegramKeys(db, tgId, telegramChatId, targetUid);
  if (otherUid) {
    console.log("AUTH_DUPLICATE_BLOCKED", {
      reason: "telegram_bound_elsewhere",
      otherUid,
      targetUid,
      tgId,
    });
    return { ok: false, reason: "telegram_bound_elsewhere" };
  }

  return { ok: true };
}

export function buildTelegramLinkMergePatch(params: {
  telegramNumericId: string;
  telegramUsername: string | null;
  telegramChatId: string | null;
}): Record<string, unknown> {
  const tgId = digitsOnly(params.telegramNumericId);
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    telegramUserId: tgId,
    telegramId: tgId,
    telegramUsername: params.telegramUsername ?? null,
    telegramLinkedAt: now,
    updatedAt: now,
  };
  if (params.telegramChatId) {
    patch.telegramChatId = digitsOnly(params.telegramChatId);
  }
  return patch;
}

/**
 * Auth: email уже занят другим аккаунтом.
 */
export async function authUserExistsByEmail(app: App, normalizedEmail: string): Promise<boolean> {
  const norm = normalizeEmailForAuth(normalizedEmail);
  if (!norm) return false;
  try {
    await getAuth(app).getUserByEmail(norm);
    return true;
  } catch (e: unknown) {
    const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: string }).code) : "";
    if (code === "auth/user-not-found") return false;
    throw e;
  }
}

export async function authUserExistsForUid(app: App, uid: string): Promise<boolean> {
  const id = String(uid ?? "").trim();
  if (!id) return false;
  try {
    await getAuth(app).getUser(id);
    return true;
  } catch (e: unknown) {
    const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: string }).code) : "";
    if (code === "auth/user-not-found") return false;
    throw e;
  }
}

export function maybeLogNewEmailUserFromDoc(uid: string, user: Record<string, unknown>): void {
  const st = String(user.registrationStage || "");
  if (st !== "auth_created") return;
  const ms = firestoreTimeToMs(user.createdAt);
  if (ms <= 0 || Date.now() - ms > 5 * 60 * 1000) return;
  console.log("AUTH_NEW_USER_CREATED", { uid, source: "email_register_recent_doc" });
}
