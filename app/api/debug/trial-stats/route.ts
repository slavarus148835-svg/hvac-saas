import { NextResponse } from "next/server";
import { assertInternalDebugSecret } from "@/lib/server/assertInternalDebugSecret";
import { getTrialStats } from "@/lib/server/getTrialStats";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = assertInternalDebugSecret(req);
  if (denied) return denied;

  const stats = await getTrialStats();
  return NextResponse.json({
    ...stats,
    conversionLabel: "paid / users with ended trial",
  });
}
