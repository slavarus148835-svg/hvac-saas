import { getAuth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import type { App } from "firebase-admin/app";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { runRegistrationTelegramNotifyIfNeeded } from "@/lib/server/runRegistrationTelegramNotify";

export function firebaseUidForTelegramNumericId(telegramId: string): string {
  const digits = String(telegramId || "").replace(/\D/g, "");
  return `tg_${digits}`;
}

function defaultPriceListDoc() {
  return {
    standard_7: 5900,
    standard_9: 5900,
    standard_12: 6900,
    standard_18: 7900,
    standard_24: 9500,
    standard_30: 10500,
    standard_36: 11500,

    existing_7: 6900,
    existing_9: 6900,
    existing_12: 7900,
    existing_18: 8900,
    existing_24: 10500,
    existing_30: 11500,
    existing_36: 12500,

    route_7: 2000,
    route_9: 2000,
    route_12: 2200,
    route_18: 2200,
    route_24: 2700,
    route_30: 2700,
    route_36: 2900,

    baseArmConcreteSurcharge: 4000,
    extraHoleNormal: 1000,
    extraHoleArm: 5000,

    stroba_brick_small: 1000,
    stroba_brick_big: 1200,
    stroba_concrete_small: 1500,
    stroba_concrete_big: 1600,

    cable40: 600,
    cable16: 200,

    bracketsAndFasteners: 1000,
    dismantlingOldUnit: 3500,
    glassUnitWork: 1000,
    facadeTileCut: 1300,
    drainageToGutter: 200,
    drainPumpInstall: 3000,
    outdoorConnectionLadder: 500,
    floorCarryTools: 500,
    outdoorBlockCarry: 1000,

    updatedAt: new Date().toISOString(),
  };
}

export type TelegramProfileInput = {
  telegramId: string;
  telegramUsername: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
};

/**
 * Найти или создать пользователя по Telegram id, выровнять поля и прайс как при email-регистрации.
 */
export async function provisionOrUpdateTelegramUser(params: {
  db: Firestore;
  app: App;
  profile: TelegramProfileInput;
}): Promise<{ uid: string; created: boolean }> {
  const { db, app, profile } = params;
  const adminAuth = getAuth(params.app);
  const telegramId = String(profile.telegramId || "").replace(/\D/g, "");
  if (!telegramId) {
    throw new Error("invalid_telegram_id");
  }

  const snap = await db
    .collection(PRICING_FS.users)
    .where("telegramId", "==", telegramId)
    .limit(1)
    .get();

  const displayName =
    [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() ||
    (profile.telegramUsername ? `@${profile.telegramUsername}` : "") ||
    `Telegram ${telegramId}`;

  const photoURL =
    profile.photoUrl && profile.photoUrl.length <= 2000 ? profile.photoUrl : undefined;

  if (!snap.empty) {
    const doc = snap.docs[0]!;
    const uid = doc.id;
    try {
      await adminAuth.getUser(uid);
    } catch {
      console.error("[provisionTelegramUser] Firestore user without Auth user", uid);
      throw new Error("auth_user_missing_for_telegram_profile");
    }
    const now = new Date().toISOString();
    await db.collection(PRICING_FS.users).doc(uid).set(
      {
        telegramId,
        telegramUsername: profile.telegramUsername ?? null,
        firstName: profile.firstName ?? null,
        lastName: profile.lastName ?? null,
        photoUrl: profile.photoUrl ?? null,
        name: displayName,
        authProvider: "telegram",
        emailVerifiedByCode: true,
        emailVerified: true,
        emailVerifiedAt: now,
        registrationStage: "verified",
        emailCodeSendError: null,
        lastRegistrationError: null,
        updatedAt: now,
      },
      { merge: true }
    );
    try {
      await adminAuth.updateUser(uid, {
        displayName: displayName || undefined,
        photoURL,
        emailVerified: true,
      });
    } catch (e) {
      console.warn("[provisionTelegramUser] updateUser (existing doc) skipped", e);
    }
    await runRegistrationTelegramNotifyIfNeeded(db, uid, null);
    return { uid, created: false };
  }

  const uid = firebaseUidForTelegramNumericId(telegramId);
  const now = new Date().toISOString();

  try {
    await adminAuth.createUser({
      uid,
      displayName: displayName || undefined,
      photoURL,
      emailVerified: true,
    });
  } catch (e: unknown) {
    const code =
      typeof e === "object" && e !== null && "code" in e ? String((e as { code: string }).code) : "";
    if (code === "auth/uid-already-exists") {
      await adminAuth.updateUser(uid, {
        displayName: displayName || undefined,
        photoURL,
        emailVerified: true,
      });
    } else {
      throw e;
    }
  }

  await db.collection(PRICING_FS.users).doc(uid).set(
    {
      uid,
      email: "",
      emailVerified: true,
      emailVerifiedByCode: true,
      emailVerifiedAt: now,
      registrationStage: "verified",
      emailCodeSentAt: null,
      emailCodeSendError: null,
      telegramNotifiedAt: null,
      telegramNotifyError: null,
      lastRegistrationError: null,
      createdAt: now,
      updatedAt: now,
      role: "user",
      blocked: false,
      plan: "trial",
      subscriptionStatus: "trial_pending",
      trialDays: 15,
      name: displayName,
      company: "",
      phone: "",
      telegram: profile.telegramUsername ? `@${profile.telegramUsername}` : "",
      whatsapp: "",
      avito: "",
      giftRouteMeters: 1,
      authProvider: "telegram",
      telegramId,
      telegramUsername: profile.telegramUsername ?? null,
      firstName: profile.firstName ?? null,
      lastName: profile.lastName ?? null,
      photoUrl: profile.photoUrl ?? null,
      hasPaid: false,
    },
    { merge: true }
  );

  await db.collection(PRICING_FS.priceLists).doc(uid).set(defaultPriceListDoc(), { merge: true });

  await runRegistrationTelegramNotifyIfNeeded(db, uid, null);

  return { uid, created: true };
}
