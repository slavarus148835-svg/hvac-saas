/**
 * Remove failed delivery docs with transient errors so users can be retried.
 *   npx tsx scripts/clearTransientLaunchFailures.ts
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { TRANSIENT_CLEANUP_ERROR_CODES, classifyDeliveryError } from "@/lib/server/miniAppLaunchNotifyRetry";
import { MINIAPP_LAUNCH_CAMPAIGN_ID } from "@/lib/server/miniAppLaunchNotifyConstants";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env.vercel.production.local") });
dotenv.config({ path: path.join(ROOT, ".env.local") });

const TRANSIENT = new Set(["send_failed", "email_send_failed", "telegram_send_failed"]);

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
  const { getAdminDb } = await import("@/lib/firebaseAdmin");
  const db = getAdminDb();
  if (!db) throw new Error("no db");

  const snap = await db
    .collection("notificationCampaigns")
    .doc(MINIAPP_LAUNCH_CAMPAIGN_ID)
    .collection("deliveries")
    .where("status", "==", "failed")
    .get();

  let deleted = 0;
  const batch = db.batch();
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const channel = data.channel === "email" ? "email" : "telegram";
    const code =
      typeof data.lastErrorCode === "string" && data.lastErrorCode
        ? data.lastErrorCode
        : classifyDeliveryError(String(data.error ?? ""), channel);
    if (!TRANSIENT_CLEANUP_ERROR_CODES.has(code as never)) continue;
    batch.delete(doc.ref);
    deleted++;
  }
  if (deleted > 0) await batch.commit();
  console.log(JSON.stringify({ deleted, scanned: snap.size }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
