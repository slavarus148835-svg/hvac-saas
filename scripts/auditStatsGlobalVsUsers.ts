/**
 * Compare stats/global with a single users collection scan (audit/backfill only).
 *   npx tsx scripts/auditStatsGlobalVsUsers.ts
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { isStatsExcludedTelegramProvisionUid } from "../lib/server/statsExcludeTelegramProvisionUid";
import { userHasConfirmedBankPayment } from "../lib/server/statsPaidUser";
import { firestoreTimeToMs } from "../lib/server/firestoreTimeMs";
import { STATS_GLOBAL_DOC_PATH } from "../lib/server/statsGlobalCounters";
import { PRICING_FS } from "../lib/pricingFirestorePaths";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env.vercel.production.local") });
dotenv.config({ path: path.join(ROOT, ".env.local") });

const TRIAL_MS = 15 * 24 * 60 * 60 * 1000;

function repairFirebaseJson(): void {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw?.trim()) return;
  try {
    JSON.parse(String(raw));
  } catch {
    try {
      const repaired = String(raw).replace(
        /("private_key":\s*")([\s\S]*?)("\s*,\s*"client_email")/,
        (_, a: string, key: string, b: string) => a + key.replace(/\r?\n/g, "\\n") + b
      );
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify(JSON.parse(repaired));
    } catch {
      /* */
    }
  }
}

async function main() {
  repairFirebaseJson();
  const { getAdminDb } = await import("../lib/firebaseAdmin");
  const db = getAdminDb();
  if (!db) throw new Error("no admin db");

  const globalSnap = await db.doc(STATS_GLOBAL_DOC_PATH).get();
  const stored = (globalSnap.data() ?? {}) as Record<string, unknown>;
  const updatedAtMs = firestoreTimeToMs(stored.updatedAt);
  const cutoff = updatedAtMs > 0 ? updatedAtMs : 0;

  let totalUsers = 0;
  let telegramUsers = 0;
  let paidUsers = 0;
  let trialActiveUsers = 0;
  let endedTrialUsers = 0;
  let usersWithCalculation = 0;
  let newSinceUpdated = 0;
  let newTelegramSince = 0;
  let newCalcSince = 0;
  let newPaidSince = 0;

  const snap = await db.collection(PRICING_FS.users).get();
  const now = Date.now();

  for (const doc of snap.docs) {
    if (isStatsExcludedTelegramProvisionUid(doc.id)) continue;
    totalUsers++;
    const d = doc.data() as Record<string, unknown>;
    const hasTg = Boolean(d.telegramUserId || d.telegramId || d.telegramChatId);
    if (hasTg) telegramUsers++;
    if (userHasConfirmedBankPayment(d)) paidUsers++;
    const calcMs = firestoreTimeToMs(d.firstCalculationAt);
    if (calcMs > 0) usersWithCalculation++;

    const trialStart =
      firestoreTimeToMs(d.trialStartedAt) > 0
        ? firestoreTimeToMs(d.trialStartedAt)
        : firestoreTimeToMs(d.createdAt);
    if (trialStart > 0) {
      const trialEnd = trialStart + TRIAL_MS;
      if (trialEnd > now) trialActiveUsers++;
      else endedTrialUsers++;
    }

    const createdMs = firestoreTimeToMs(d.createdAt);
    if (cutoff > 0 && createdMs > cutoff) newSinceUpdated++;
    if (cutoff > 0 && hasTg && createdMs > cutoff) newTelegramSince++;
    if (cutoff > 0 && calcMs > cutoff) newCalcSince++;
    if (cutoff > 0 && userHasConfirmedBankPayment(d)) {
      const paidMs = Math.max(
        firestoreTimeToMs(d.paidUntil),
        firestoreTimeToMs(d.lastPaymentAt),
        firestoreTimeToMs(d.updatedAt)
      );
      if (paidMs > cutoff) newPaidSince++;
    }
  }

  const actual = {
    totalUsers,
    telegramUsers,
    paidUsers,
    trialActiveUsers,
    endedTrialUsers,
    usersWithCalculation,
    totalCalculations: usersWithCalculation,
  };

  const storedNums = {
    totalUsers: Number(stored.totalUsers) || 0,
    telegramUsers: Number(stored.telegramUsers) || 0,
    paidUsers: Number(stored.paidUsers) || 0,
    trialActiveUsers: Number(stored.trialActiveUsers) || 0,
    endedTrialUsers: Number(stored.endedTrialUsers) || 0,
    usersWithCalculation: Number(stored.usersWithCalculation) || 0,
    totalCalculations: Number(stored.totalCalculations) || 0,
  };

  console.log(
    JSON.stringify(
      {
        usersCollectionSize: snap.size,
        statsGlobal: {
          exists: globalSnap.exists,
          updatedAt: stored.updatedAt ?? null,
          ...storedNums,
        },
        actualFromUsersScan: actual,
        delta: {
          totalUsers: actual.totalUsers - storedNums.totalUsers,
          telegramUsers: actual.telegramUsers - storedNums.telegramUsers,
          paidUsers: actual.paidUsers - storedNums.paidUsers,
          usersWithCalculation: actual.usersWithCalculation - storedNums.usersWithCalculation,
        },
        sinceStatsUpdatedAt: {
          cutoffIso: cutoff ? new Date(cutoff).toISOString() : null,
          newRegistrations: newSinceUpdated,
          newTelegramUsers: newTelegramSince,
          newFirstCalculations: newCalcSince,
          newPaidSignals: newPaidSince,
        },
        env: {
          FIRESTORE_SAFE_MODE: process.env.FIRESTORE_SAFE_MODE ?? null,
        },
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
