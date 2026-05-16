import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { assertInternalDebugSecret } from "@/lib/server/assertInternalDebugSecret";
import { isStatsExcludedTelegramProvisionUid } from "@/lib/server/statsExcludeTelegramProvisionUid";
import { firestoreTimeToMs } from "@/lib/server/firestoreTimeMs";

export const runtime = "nodejs";

/**
 * GET /api/debug/latest-users?secret=...
 */
export async function GET(req: Request) {
  const denied = assertInternalDebugSecret(req);
  if (denied) return denied;

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ error: "no_admin" }, { status: 503 });
  }

  const snap = await db.collection(PRICING_FS.users).limit(500).get();
  const rows: Array<{
    uid: string;
    email: string | null;
    createdAt: string | null;
    registrationSource: string | null;
    telegramUserId: string | null;
    authProvider: string | null;
    telegramNotifiedAt: string | null;
    telegramNotifyError: string | null;
  }> = [];

  for (const doc of snap.docs) {
    if (isStatsExcludedTelegramProvisionUid(doc.id)) continue;
    const d = doc.data() as Record<string, unknown>;
    const createdMs = firestoreTimeToMs(d.createdAt);
    rows.push({
      uid: doc.id,
      email: typeof d.email === "string" ? d.email : null,
      createdAt: createdMs > 0 ? new Date(createdMs).toISOString() : null,
      registrationSource:
        typeof d.registrationSource === "string" ? d.registrationSource : null,
      telegramUserId:
        typeof d.telegramUserId === "string"
          ? d.telegramUserId
          : typeof d.telegramId === "string"
            ? d.telegramId
            : null,
      authProvider: typeof d.authProvider === "string" ? d.authProvider : null,
      telegramNotifiedAt:
        typeof d.telegramNotifiedAt === "string" ? d.telegramNotifiedAt : null,
      telegramNotifyError:
        typeof d.telegramNotifyError === "string" ? d.telegramNotifyError : null,
    });
  }

  rows.sort((a, b) => {
    const am = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bm = b.createdAt ? Date.parse(b.createdAt) : 0;
    return bm - am;
  });

  return NextResponse.json({
    count: rows.length,
    users: rows.slice(0, 10),
  });
}
