/**
 * Safe post-campaign cleanup for telegram_mini_app_launch_2026_05 deliveries.
 *
 *   npx tsx scripts/cleanupMiniAppLaunchCampaign.ts           # dry-run summary
 *   npx tsx scripts/cleanupMiniAppLaunchCampaign.ts --apply   # delete transient failed only
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import {
  classifyDeliveryError,
  isPermanentErrorCode,
  TRANSIENT_CLEANUP_ERROR_CODES,
  type MiniAppLaunchDeliveryChannel,
} from "@/lib/server/miniAppLaunchNotifyRetry";
import { MINIAPP_LAUNCH_CAMPAIGN_ID } from "@/lib/server/miniAppLaunchNotifyConstants";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env.vercel.production.local") });
dotenv.config({ path: path.join(ROOT, ".env.local") });

const APPLY = process.argv.includes("--apply");

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

function resolveCode(
  data: Record<string, unknown>,
  channel: MiniAppLaunchDeliveryChannel
): string {
  if (typeof data.lastErrorCode === "string" && data.lastErrorCode) {
    return data.lastErrorCode;
  }
  return classifyDeliveryError(String(data.error ?? ""), channel);
}

async function main() {
  repairFirebaseJson();
  const { getAdminDb } = await import("@/lib/firebaseAdmin");
  const db = getAdminDb();
  if (!db) throw new Error("Firebase admin not configured");

  const col = db
    .collection("notificationCampaigns")
    .doc(MINIAPP_LAUNCH_CAMPAIGN_ID)
    .collection("deliveries");

  const snap = await col.select("status", "error", "lastErrorCode", "channel", "retryCount", "uid").get();

  const summary = {
    campaignId: MINIAPP_LAUNCH_CAMPAIGN_ID,
    apply: APPLY,
    totalScanned: snap.size,
    byStatus: {} as Record<string, number>,
    duplicateUidAnomalies: 0,
    transientFailedToClear: [] as string[],
    permanentFailedKept: 0,
    sentKept: 0,
    skippedKept: 0,
    legacyFailedWithoutErrorCode: 0,
    updates: [] as string[],
  };

  const seenUids = new Map<string, number>();

  let batch = db.batch();
  let batchOps = 0;

  const commitBatch = async () => {
    if (batchOps === 0) return;
    if (APPLY) await batch.commit();
    batch = db.batch();
    batchOps = 0;
  };

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const status = String(data.status ?? "unknown");
    summary.byStatus[status] = (summary.byStatus[status] ?? 0) + 1;

    const uid = String(data.uid ?? doc.id);
    seenUids.set(uid, (seenUids.get(uid) ?? 0) + 1);

    if (status === "sent") {
      summary.sentKept++;
      continue;
    }
    if (status === "skipped") {
      summary.skippedKept++;
      continue;
    }
    if (status !== "failed") continue;

    const channel: MiniAppLaunchDeliveryChannel =
      data.channel === "email" ? "email" : "telegram";
    const code = resolveCode(data, channel);

    if (!data.lastErrorCode && data.error) {
      summary.legacyFailedWithoutErrorCode++;
      if (APPLY) {
        batch.set(doc.ref, { lastErrorCode: code }, { merge: true });
        batchOps++;
        summary.updates.push(`${doc.id}:lastErrorCode=${code}`);
      }
    }

    if (isPermanentErrorCode(code as never, channel)) {
      summary.permanentFailedKept++;
      continue;
    }

    if (TRANSIENT_CLEANUP_ERROR_CODES.has(code as never)) {
      summary.transientFailedToClear.push(doc.id);
      if (APPLY) {
        batch.delete(doc.ref);
        batchOps++;
      }
      if (batchOps >= 400) await commitBatch();
    }
  }

  await commitBatch();

  for (const count of seenUids.values()) {
    if (count > 1) summary.duplicateUidAnomalies++;
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
