/**
 * One-time backfill stats/global (+ optional daily) from users collection.
 * Run when Firestore quota allows (NOT during RESOURCE_EXHAUSTED).
 *
 *   npx tsx scripts/backfillStatsGlobal.ts
 *   npx tsx scripts/backfillStatsGlobal.ts --dry-run
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { isStatsExcludedTelegramProvisionUid } from "../lib/server/statsExcludeTelegramProvisionUid";
import { userHasConfirmedBankPayment } from "../lib/server/statsPaidUser";
import { firestoreTimeToMs } from "../lib/server/firestoreTimeMs";
import {
  STATS_DAILY_COLLECTION,
  STATS_GLOBAL_DOC_PATH,
  utcDateKey,
  yesterdayUtcDateKey,
} from "../lib/server/statsGlobalCounters";
import { PRICING_FS } from "../lib/pricingFirestorePaths";
import { isFirestoreCapacityError } from "../lib/server/statsUsersSnapshot";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env.vercel.production.local") });
dotenv.config({ path: path.join(ROOT, ".env.local") });

const DRY = process.argv.includes("--dry-run");
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

  const now = Date.now();
  const yStart = new Date(yesterdayUtcDateKey(now)).getTime();
  const yEnd = yStart + 24 * 60 * 60 * 1000;

  let totalUsers = 0;
  let telegramUsers = 0;
  let paidUsers = 0;
  let trialActiveUsers = 0;
  let endedTrialUsers = 0;
  let usersWithCalculation = 0;
  let registrationsYesterday = 0;
  let paidYesterday = 0;

  console.log("Scanning users… (single collection read)");
  const t0 = Date.now();

  try {
    const snap = await db.collection(PRICING_FS.users).get();
    for (const doc of snap.docs) {
      if (isStatsExcludedTelegramProvisionUid(doc.id)) continue;
      totalUsers++;
      const d = doc.data() as Record<string, unknown>;
      if (d.telegramUserId || d.telegramId || d.telegramChatId) telegramUsers++;
      if (userHasConfirmedBankPayment(d)) paidUsers++;
      if (firestoreTimeToMs(d.firstCalculationAt) > 0) usersWithCalculation++;

      const trialStart =
        firestoreTimeToMs(d.trialStartedAt) > 0
          ? firestoreTimeToMs(d.trialStartedAt)
          : firestoreTimeToMs(d.createdAt);
      if (trialStart > 0) {
        const trialEnd = trialStart + TRIAL_MS;
        if (trialEnd > now) trialActiveUsers++;
        else endedTrialUsers++;
      }

      const created = firestoreTimeToMs(d.createdAt);
      if (created >= yStart && created < yEnd) registrationsYesterday++;
    }
    console.log(`Scanned ${snap.size} docs in ${Date.now() - t0}ms`);
  } catch (e) {
    if (isFirestoreCapacityError(e)) {
      console.error("RESOURCE_EXHAUSTED — wait for quota recovery, then retry.");
      process.exit(2);
    }
    throw e;
  }

  const globalPayload = {
    totalUsers,
    telegramUsers,
    paidUsers,
    trialActiveUsers,
    endedTrialUsers,
    usersWithCalculation,
    totalCalculations: usersWithCalculation,
    updatedAt: new Date().toISOString(),
    backfilledAt: new Date().toISOString(),
  };

  const dailyPayload = {
    date: yesterdayUtcDateKey(now),
    registrations: registrationsYesterday,
    paid: paidYesterday,
    calculations: 0,
    updatedAt: new Date().toISOString(),
  };

  console.log(JSON.stringify({ global: globalPayload, daily: dailyPayload }, null, 2));

  if (DRY) {
    console.log("Dry run — no writes.");
    return;
  }

  await db.doc(STATS_GLOBAL_DOC_PATH).set(globalPayload, { merge: false });
  await db.collection(STATS_DAILY_COLLECTION).doc(utcDateKey(now)).set(
    { calculations: 0, registrations: 0, paid: 0, updatedAt: new Date().toISOString() },
    { merge: true }
  );
  await db.collection(STATS_DAILY_COLLECTION).doc(yesterdayUtcDateKey(now)).set(dailyPayload, {
    merge: true,
  });

  console.log("Written stats/global and stats/daily/*");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
