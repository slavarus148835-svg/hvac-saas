import { NextResponse } from "next/server";
import { assertInternalDebugSecret } from "@/lib/server/assertInternalDebugSecret";
import { getTrialStats } from "@/lib/server/getTrialStats";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = assertInternalDebugSecret(req);
  if (denied) return denied;

  const { isFirestoreHeavyScansDisabled, readStatsGlobal } = await import(
    "@/lib/server/statsGlobalCounters"
  );
  if (isFirestoreHeavyScansDisabled()) {
    const { getAdminDb } = await import("@/lib/firebaseAdmin");
    const db = getAdminDb();
    if (!db) return NextResponse.json({ error: "no_admin" }, { status: 503 });
    const global = await readStatsGlobal(db);
    return NextResponse.json({
      safeMode: true,
      trialActiveUsers: global.trialActiveUsers,
      endedTrialUsers: global.endedTrialUsers,
    });
  }

  const stats = await getTrialStats();
  return NextResponse.json({
    ...stats,
    conversionLabel: "paid / users with ended trial",
  });
}
