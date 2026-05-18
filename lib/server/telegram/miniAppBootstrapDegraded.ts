import type { Firestore } from "firebase-admin/firestore";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { createTelegramMiniAppSession } from "@/lib/server/telegram/telegramMiniAppSession";
import type { VerifiedTelegramUser } from "@/lib/server/telegram/verifyTelegramInitData";
import { findUserByTelegramFast } from "@/lib/server/telegram/findUserByTelegramFast";
import { isFirestoreCapacityError } from "@/lib/server/statsUsersSnapshot";

function publicProfile(uid: string, tgId: string, user: VerifiedTelegramUser) {
  return {
    uid,
    email: null,
    plan: "trial",
    hasPaid: false,
    blocked: false,
    telegramUserId: tgId,
    telegramId: tgId,
    telegramUsername: user.username ?? null,
  };
}

/**
 * При quota: максимум 2 reads (findUserByTelegramFast), без registration session upsert.
 */
export async function tryMiniAppBootstrapDegraded(params: {
  db: Firestore;
  telegramUserId: string;
  telegramUser: VerifiedTelegramUser;
  userAgent?: string | null;
  ipHash?: string;
}): Promise<
  | {
      ok: true;
      sessionToken: string;
      profile: ReturnType<typeof publicProfile>;
      degraded: true;
    }
  | { ok: false; reason: string }
> {
  try {
    const lookup = await findUserByTelegramFast(params.db, params.telegramUserId);
    if (lookup.kind !== "found") {
      return { ok: false, reason: lookup.kind === "ambiguous" ? "ambiguous" : "not_found" };
    }

    const uid = lookup.doc.id;
    const { sessionToken } = await createTelegramMiniAppSession(params.db, {
      uid,
      telegramUserId: params.telegramUserId,
      userAgent: params.userAgent,
      ipHash: params.ipHash,
    });

    return {
      ok: true,
      sessionToken,
      profile: publicProfile(uid, params.telegramUserId, params.telegramUser),
      degraded: true,
    };
  } catch (e) {
    return {
      ok: false,
      reason: isFirestoreCapacityError(e) ? "firestore_quota" : "lookup_failed",
    };
  }
}
