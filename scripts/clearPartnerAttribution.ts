/**
 * Снять ошибочную B2B-привязку партнёра с пользователя.
 *
 * Usage:
 *   npx tsx scripts/clearPartnerAttribution.ts <uid>
 *   npx tsx scripts/clearPartnerAttribution.ts --telegram <telegramUserId>
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env.vercel.production.local") });
dotenv.config({ path: path.join(ROOT, ".env.local") });
dotenv.config({ path: path.join(ROOT, ".env") });

import { getAdminDb } from "../lib/firebaseAdmin";
import { clearPartnerAttributionFromUser } from "../lib/server/partnerManager/partnerManagerB2b";
import { PRICING_FS } from "../lib/pricingFirestorePaths";

/** Vercel/env иногда кладут private_key с реальными переносами строк — чиним перед parse. */
function ensureFirebaseServiceAccountEnv(): boolean {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw || !String(raw).trim()) return false;
  try {
    JSON.parse(String(raw));
    return true;
  } catch {
    try {
      const repaired = String(raw).replace(
        /("private_key":\s*")([\s\S]*?)("\s*,\s*"client_email")/,
        (_, a: string, key: string, b: string) =>
          a + key.replace(/\r?\n/g, "\\n") + b
      );
      JSON.parse(repaired);
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON = repaired;
      return true;
    } catch {
      return false;
    }
  }
}

async function main() {
  if (!ensureFirebaseServiceAccountEnv()) {
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON missing or invalid");
    process.exit(1);
  }
  const db = getAdminDb();
  if (!db) {
    console.error("Firestore admin unavailable");
    process.exit(1);
  }

  const arg1 = process.argv[2];
  const arg2 = process.argv[3];
  if (!arg1) {
    console.error("Usage: npx tsx scripts/clearPartnerAttribution.ts <uid>");
    console.error("   or: npx tsx scripts/clearPartnerAttribution.ts --telegram <telegramUserId>");
    process.exit(1);
  }

  let uid = arg1;
  if (arg1 === "--telegram" && arg2) {
    const tg = String(arg2).replace(/\D/g, "");
    const q = await db
      .collection(PRICING_FS.users)
      .where("telegramUserId", "==", tg)
      .limit(2)
      .get();
    if (q.empty) {
      const q2 = await db
        .collection(PRICING_FS.users)
        .where("telegramId", "==", tg)
        .limit(2)
        .get();
      if (q2.empty || q2.docs.length !== 1) {
        console.error("User not found by telegram id:", tg);
        process.exit(1);
      }
      uid = q2.docs[0]!.id;
    } else if (q.docs.length !== 1) {
      console.error("Multiple users for telegram id:", tg);
      process.exit(1);
    } else {
      uid = q.docs[0]!.id;
    }
  }

  const result = await clearPartnerAttributionFromUser(db, uid);
  if (!result.ok) {
    console.error("Failed:", result.error);
    process.exit(1);
  }
  console.log(
    result.cleared
      ? `Cleared partner attribution for uid=${uid}`
      : `No partner attribution on uid=${uid}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
