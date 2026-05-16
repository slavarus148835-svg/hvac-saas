import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import type { App } from "firebase-admin/app";
import {
  authUserExistsByEmail,
  authUserExistsForUid,
  findUsersByNormalizedEmail,
  normalizeEmailForAuth,
} from "@/lib/server/authDuplicateGuards";
import { EMAIL_VERIFICATION_CODES_COLLECTION } from "@/lib/server/emailCodeConstants";
import { firestoreTimeToMs } from "@/lib/server/firestoreTimeMs";
import { getTelegramLoginSession } from "@/lib/server/telegramLoginSession";
import { isStatsExcludedTelegramProvisionUid } from "@/lib/server/statsExcludeTelegramProvisionUid";

export type FirestoreUserDiagnosis = {
  uid: string;
  email: string | null;
  normalizedEmail: string | null;
  registrationStage: string | null;
  emailVerifiedByCode: boolean;
  authExistsForUid: boolean;
  isTgProvisionUid: boolean;
  isOrphan: boolean;
  createdAt: string | null;
};

export type RegistrationDiagnosis = {
  normalizedEmail: string;
  existsInFirebaseAuth: boolean;
  firebaseUid: string | null;
  firebaseEmailVerified: boolean | null;
  firestoreUsersByEmail: FirestoreUserDiagnosis[];
  tgProvisionUsersByEmail: FirestoreUserDiagnosis[];
  pendingEmailCodesCount: number;
  lastEmailCodeCreatedAt: string | null;
  telegramLoginSessionId: string | null;
  telegramSessionBlocksRegistration: boolean;
  blockingReason: string | null;
  recommendedAction: string;
  wouldAllowRegistration: boolean;
};

function summarizeFirestoreUser(
  doc: QueryDocumentSnapshot,
  authExistsForUid: boolean
): FirestoreUserDiagnosis {
  const data = doc.data() as Record<string, unknown>;
  const createdMs = firestoreTimeToMs(data.createdAt);
  return {
    uid: doc.id,
    email: typeof data.email === "string" ? data.email : null,
    normalizedEmail:
      typeof data.normalizedEmail === "string" ? data.normalizedEmail : null,
    registrationStage:
      typeof data.registrationStage === "string" ? data.registrationStage : null,
    emailVerifiedByCode: Boolean(data.emailVerifiedByCode),
    authExistsForUid,
    isTgProvisionUid: isStatsExcludedTelegramProvisionUid(doc.id),
    isOrphan: !authExistsForUid,
    createdAt: createdMs > 0 ? new Date(createdMs).toISOString() : null,
  };
}

async function loadEmailVerificationCodesForEmail(
  db: Firestore,
  normalizedEmail: string
): Promise<{ count: number; lastCreatedAt: string | null }> {
  const norm = normalizeEmailForAuth(normalizedEmail);
  const snap = await db.collection(EMAIL_VERIFICATION_CODES_COLLECTION).get();
  const now = Date.now();
  let count = 0;
  let lastMs = 0;
  for (const doc of snap.docs) {
    const d = doc.data() as Record<string, unknown>;
    if (normalizeEmailForAuth(String(d.email ?? "")) !== norm) continue;
    const expiresMs = firestoreTimeToMs(d.expiresAt);
    const consumed = d.consumed === true;
    if (consumed || (expiresMs > 0 && expiresMs <= now)) continue;
    count++;
    const createdMs = firestoreTimeToMs(d.createdAt) || firestoreTimeToMs(d.lastSentAt);
    if (createdMs > lastMs) lastMs = createdMs;
  }
  return {
    count,
    lastCreatedAt: lastMs > 0 ? new Date(lastMs).toISOString() : null,
  };
}

export type PreRegistrationEvaluation = {
  allowed: boolean;
  reason: string | null;
  message: string | null;
  authStatus: "ok" | "duplicate_blocked" | "invalid" | "server_error";
};

const MESSAGES: Record<string, string> = {
  invalid_email: "Укажите корректный email.",
  email_in_firebase_auth: "Аккаунт с этим email уже есть. Войдите по email.",
  email_in_firestore_with_auth:
    "Этот email уже зарегистрирован. Войдите или восстановите доступ.",
  telegram_account_use_login:
    "Уже есть аккаунт через Telegram. Завершите вход через Telegram или начните регистрацию по email заново.",
  server_misconfigured: "Ошибка регистрации. Попробуйте позже или напишите в поддержку.",
  internal_error: "Ошибка регистрации. Попробуйте позже или напишите в поддержку.",
};

export function messageForRegistrationReason(reason: string | null): string {
  if (!reason) return MESSAGES.internal_error;
  return MESSAGES[reason] ?? MESSAGES.internal_error;
}

function resolveBlockingFromSummaries(params: {
  normalizedEmail: string;
  existsInFirebaseAuth: boolean;
  firestoreUsers: FirestoreUserDiagnosis[];
  telegramSessionBlocks: boolean;
}): { blockingReason: string | null; recommendedAction: string; wouldAllow: boolean } {
  const { normalizedEmail, existsInFirebaseAuth, firestoreUsers, telegramSessionBlocks } =
    params;

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return {
      blockingReason: "invalid_email",
      recommendedAction: "use_valid_email",
      wouldAllow: false,
    };
  }

  if (existsInFirebaseAuth) {
    return {
      blockingReason: "email_in_firebase_auth",
      recommendedAction: "login_with_email",
      wouldAllow: false,
    };
  }

  const blockingFirestore = firestoreUsers.filter(
    (u) => !u.isTgProvisionUid && u.authExistsForUid
  );
  if (blockingFirestore.length > 0) {
    return {
      blockingReason: "email_in_firestore_with_auth",
      recommendedAction: "login_with_email",
      wouldAllow: false,
    };
  }

  if (telegramSessionBlocks) {
    return {
      blockingReason: "telegram_account_use_login",
      recommendedAction: "complete_telegram_login_or_clear_session",
      wouldAllow: false,
    };
  }

  const orphans = firestoreUsers.filter((u) => u.isOrphan && !u.isTgProvisionUid);
  if (orphans.length > 0) {
    return {
      blockingReason: null,
      recommendedAction: "register_allowed_orphan_firestore_present",
      wouldAllow: true,
    };
  }

  const tgWithEmail = firestoreUsers.filter((u) => u.isTgProvisionUid);
  if (tgWithEmail.length > 0) {
    return {
      blockingReason: null,
      recommendedAction: "register_allowed_ignore_tg_provision_docs",
      wouldAllow: true,
    };
  }

  return {
    blockingReason: null,
    recommendedAction: "register_allowed",
    wouldAllow: true,
  };
}

export async function buildRegistrationDiagnosis(
  db: Firestore,
  app: App,
  emailRaw: string,
  opts?: { telegramLoginSessionId?: string }
): Promise<RegistrationDiagnosis> {
  const normalizedEmail = normalizeEmailForAuth(emailRaw);
  const auth = getAuth(app);

  let existsInFirebaseAuth = false;
  let firebaseUid: string | null = null;
  let firebaseEmailVerified: boolean | null = null;

  try {
    const u = await auth.getUserByEmail(normalizedEmail);
    existsInFirebaseAuth = true;
    firebaseUid = u.uid;
    firebaseEmailVerified = u.emailVerified;
  } catch (e: unknown) {
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? String((e as { code: string }).code)
        : "";
    if (code !== "auth/user-not-found") throw e;
  }

  const docs = await findUsersByNormalizedEmail(db, normalizedEmail);
  const firestoreUsersByEmail: FirestoreUserDiagnosis[] = [];
  for (const doc of docs) {
    const authExists = await authUserExistsForUid(app, doc.id);
    firestoreUsersByEmail.push(summarizeFirestoreUser(doc, authExists));
  }

  const tgProvisionUsersByEmail = firestoreUsersByEmail.filter((u) => u.isTgProvisionUid);

  const codes = await loadEmailVerificationCodesForEmail(db, normalizedEmail);

  const sid = String(opts?.telegramLoginSessionId ?? "").trim();
  let telegramSessionBlocksRegistration = false;
  if (sid) {
    const session = await getTelegramLoginSession(db, sid);
    if (session?.status === "confirmed" && session.resolvedUid) {
      telegramSessionBlocksRegistration = true;
    }
  }

  const { blockingReason, recommendedAction, wouldAllow } = resolveBlockingFromSummaries({
    normalizedEmail,
    existsInFirebaseAuth,
    firestoreUsers: firestoreUsersByEmail,
    telegramSessionBlocks: telegramSessionBlocksRegistration,
  });

  return {
    normalizedEmail,
    existsInFirebaseAuth,
    firebaseUid,
    firebaseEmailVerified,
    firestoreUsersByEmail,
    tgProvisionUsersByEmail,
    pendingEmailCodesCount: codes.count,
    lastEmailCodeCreatedAt: codes.lastCreatedAt,
    telegramLoginSessionId: sid || null,
    telegramSessionBlocksRegistration,
    blockingReason,
    recommendedAction,
    wouldAllowRegistration: wouldAllow,
  };
}

export async function evaluatePreRegistration(
  db: Firestore,
  app: App,
  emailRaw: string,
  opts?: { telegramLoginSessionId?: string }
): Promise<PreRegistrationEvaluation> {
  const diagnosis = await buildRegistrationDiagnosis(db, app, emailRaw, opts);

  if (!diagnosis.wouldAllowRegistration) {
    const reason = diagnosis.blockingReason ?? "internal_error";
    return {
      allowed: false,
      reason,
      message: messageForRegistrationReason(reason),
      authStatus: reason === "invalid_email" ? "invalid" : "duplicate_blocked",
    };
  }

  return {
    allowed: true,
    reason: null,
    message: null,
    authStatus: "ok",
  };
}
