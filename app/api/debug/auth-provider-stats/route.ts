import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getAuthProviderStats } from "@/lib/server/authProviderStats";
import { assertInternalDebugSecret } from "@/lib/server/assertInternalDebugSecret";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = assertInternalDebugSecret(req);
  if (denied) return denied;

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ error: "no_admin" }, { status: 503 });
  }

  const stats = await getAuthProviderStats(db);
  return NextResponse.json(stats);
}
