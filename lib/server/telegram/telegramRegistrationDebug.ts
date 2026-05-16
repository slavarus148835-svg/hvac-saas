import type { Firestore } from "firebase-admin/firestore";
import type { App } from "firebase-admin/app";
import {
  authUserExistsByEmail,
  collectUserDocsByTelegramKeys,
  findUsersByNormalizedEmail,
  normalizeEmailForAuth,
} from "@/lib/server/authDuplicateGuards";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import {
  getTelegramRegistrationSession,
  pendingRegistrationDocId,
  TELEGRAM_PENDING_REGISTRATION_PREFIX,
} from "@/lib/server/telegram/telegramLinkShared";
import { listRecentLinkTokensByEmail } from "@/lib/server/telegram/telegramLinkTokens";
import { evaluatePreRegistration } from "@/lib/server/registrationDiagnose";
import { isStatsExcludedTelegramProvisionUid } from "@/lib/server/statsExcludeTelegramProvisionUid";

export async function buildTelegramRegistrationStateDebug(
  db: Firestore,
  app: App,
  params: { telegramUserId?: string; email?: string }
) {
  const tgId = String(params.telegramUserId ?? "").replace(/\D/g, "");
  const email = normalizeEmailForAuth(String(params.email ?? ""));

  let pendingSessionFound = false;
  let sessionLinkedUid: string | null = null;
  if (tgId) {
    const pending = await getTelegramRegistrationSession(db, pendingRegistrationDocId(tgId));
    if (pending) {
      pendingSessionFound = pending.status === "pending_email_registration";
      sessionLinkedUid = pending.linkedUid ?? null;
    }
  }

  const tgProvisionId = tgId ? `tg_${tgId}` : "";
  let tgProvisionUserFound = false;
  if (tgProvisionId) {
    const snap = await db.collection(PRICING_FS.users).doc(tgProvisionId).get();
    tgProvisionUserFound = snap.exists;
  }

  const emailAuthExists = email ? await authUserExistsByEmail(app, email) : false;

  const firestoreUsersByEmail = email
    ? (await findUsersByNormalizedEmail(db, email)).map((d) => ({
        uid: d.id,
        isTgProvision: isStatsExcludedTelegramProvisionUid(d.id),
        registrationStage: (d.data() as Record<string, unknown>).registrationStage ?? null,
      }))
    : [];

  const firestoreUsersByTelegramUserId = tgId
    ? (await collectUserDocsByTelegramKeys(db, tgId, null)).map((d) => ({
        uid: d.id,
        email: (d.data() as Record<string, unknown>).email ?? null,
      }))
    : [];

  const evaluation = email
    ? await evaluatePreRegistration(db, app, email)
    : { allowed: true, reason: null };

  return {
    telegramUserId: tgId || null,
    email: email || null,
    pendingSessionFound,
    sessionLinkedUid,
    tgProvisionUserFound,
    emailAuthExists,
    firestoreUsersByEmail,
    firestoreUsersByTelegramUserId,
    canRegisterAndLink: evaluation.allowed,
    blockingReason: evaluation.reason,
    recommendedAction: evaluation.allowed ? "register_or_link_allowed" : evaluation.reason,
    pendingSessionDocId: tgId ? pendingRegistrationDocId(tgId) : null,
    pendingSessionPrefix: TELEGRAM_PENDING_REGISTRATION_PREFIX,
  };
}

export async function buildTelegramLinkTokenStateDebug(db: Firestore, emailRaw: string) {
  const email = normalizeEmailForAuth(emailRaw);
  const tokens = email ? await listRecentLinkTokensByEmail(db, email, 10) : [];
  return { email: email || null, recentTokens: tokens };
}
