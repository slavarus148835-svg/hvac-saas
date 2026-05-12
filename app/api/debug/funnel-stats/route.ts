import { NextResponse } from "next/server";
import { assertInternalDebugSecret } from "@/lib/server/assertInternalDebugSecret";
import { getFunnelStats } from "@/lib/server/getFunnelStats";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = assertInternalDebugSecret(req);
  if (denied) return denied;

  const stats = await getFunnelStats();
  return NextResponse.json(stats);
}
