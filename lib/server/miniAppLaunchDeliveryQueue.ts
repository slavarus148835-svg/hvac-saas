import type { Firestore } from "firebase-admin/firestore";
import {
  evaluateDeliveryForQueue,
  normalizeRetryCount,
  type MiniAppLaunchDeliveryChannel,
  type MiniAppLaunchErrorCode,
} from "@/lib/server/miniAppLaunchNotifyRetry";
import {
  MINIAPP_LAUNCH_CAMPAIGN_ID,
  NOTIFICATION_CAMPAIGNS_COLLECTION,
} from "@/lib/server/miniAppLaunchNotifyConstants";

export type CachedDeliveryMeta = {
  retryCount: number;
  lastErrorCode: string | null;
  channel: MiniAppLaunchDeliveryChannel | null;
};

const DELIVERY_FIELDS = ["status", "retryCount", "lastErrorCode", "channel", "error"] as const;

/**
 * Single deliveries scan per HTTP request — memoized excluded uids + retry metadata.
 */
export class MiniAppLaunchDeliveryQueueCache {
  private excludedUids = new Set<string>();
  private retryableMeta = new Map<string, CachedDeliveryMeta>();
  private knownDocIds = new Set<string>();
  private loaded = false;

  get size(): number {
    return this.excludedUids.size + this.retryableMeta.size;
  }

  hasDeliveryDoc(uid: string): boolean {
    return this.knownDocIds.has(uid);
  }

  noteDeliveryDoc(uid: string): void {
    this.knownDocIds.add(uid);
  }

  isExcluded(uid: string): boolean {
    return this.excludedUids.has(uid);
  }

  getRetryMeta(uid: string): CachedDeliveryMeta | null {
    return this.retryableMeta.get(uid) ?? null;
  }

  markExcluded(uid: string): void {
    this.excludedUids.add(uid);
    this.retryableMeta.delete(uid);
  }

  markRetryable(uid: string, meta: CachedDeliveryMeta): void {
    this.retryableMeta.set(uid, meta);
    this.excludedUids.delete(uid);
  }

  async load(db: Firestore): Promise<void> {
    if (this.loaded) return;

    const snap = await db
      .collection(NOTIFICATION_CAMPAIGNS_COLLECTION)
      .doc(MINIAPP_LAUNCH_CAMPAIGN_ID)
      .collection("deliveries")
      .select(...DELIVERY_FIELDS)
      .get();

    for (const doc of snap.docs) {
      this.knownDocIds.add(doc.id);
      const data = doc.data() as Record<string, unknown>;
      const channel =
        data.channel === "email" || data.channel === "telegram"
          ? (data.channel as MiniAppLaunchDeliveryChannel)
          : null;
      const retryCount = normalizeRetryCount(data.retryCount);
      const lastErrorCode =
        typeof data.lastErrorCode === "string" ? data.lastErrorCode : null;
      const decision = evaluateDeliveryForQueue({
        status: String(data.status ?? ""),
        retryCount,
        lastErrorCode,
        error: typeof data.error === "string" ? data.error : null,
        channel,
      });

      if (decision === "exclude") {
        this.excludedUids.add(doc.id);
        continue;
      }

      this.retryableMeta.set(doc.id, { retryCount, lastErrorCode, channel });
    }

    this.loaded = true;
  }
}
