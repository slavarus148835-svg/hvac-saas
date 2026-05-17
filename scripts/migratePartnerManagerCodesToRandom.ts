/**
 * Одноразовая миграция: всем partnerManagers — новый случайный code (без имён / partner_).
 *   npx tsx scripts/migratePartnerManagerCodesToRandom.ts
 *   npx tsx scripts/migratePartnerManagerCodesToRandom.ts --name Maria
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env.vercel.production.local") });
dotenv.config({ path: path.join(ROOT, ".env.local") });

import { getWebManagerUrl } from "../lib/telegramMiniAppLinks";

function ensureFirebase(): boolean {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw?.trim()) return false;
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
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify(JSON.parse(repaired));
      return true;
    } catch {
      return false;
    }
  }
}

async function main() {
  if (!ensureFirebase()) {
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON missing or invalid");
    process.exit(1);
  }

  const nameFilter = process.argv.includes("--name")
    ? String(process.argv[process.argv.indexOf("--name") + 1] || "").trim().toLowerCase()
    : "";

  const { getAdminDb } = await import("../lib/firebaseAdmin");
  const { PARTNER_MANAGERS_COLLECTION } = await import("../lib/partner/b2bConstants");
  const { migratePartnerManagerDocToRandomCode } = await import(
    "../lib/server/partnerManager/generateRandomPartnerCode"
  );

  const db = getAdminDb()!;
  const snap = await db.collection(PARTNER_MANAGERS_COLLECTION).get();
  const docs = snap.docs.filter((d) => {
    if (!nameFilter) return true;
    const name = String((d.data() as { name?: string }).name ?? "").toLowerCase();
    return name.includes(nameFilter);
  });

  if (!docs.length) {
    console.log("No managers to migrate.");
    return;
  }

  console.log(`Migrating ${docs.length} manager(s)...`);
  for (const doc of docs) {
    const data = doc.data() as { name?: string; code?: string };
    const { oldCode, newCode } = await migratePartnerManagerDocToRandomCode(db, doc.id);
    console.log(
      JSON.stringify({
        id: doc.id,
        name: data.name ?? "",
        oldCode,
        newCode,
        web: getWebManagerUrl(newCode),
      })
    );
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
