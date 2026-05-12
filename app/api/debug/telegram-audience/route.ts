import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { assertInternalDebugSecret } from "@/lib/server/assertInternalDebugSecret";
import { getTelegramAudienceStats } from "@/lib/server/telegramAudience";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = assertInternalDebugSecret(req);
  if (auth) return auth;

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ error: "no_admin" }, { status: 503 });
  }

  const stats = await getTelegramAudienceStats(db);
  return NextResponse.json(stats);
}
