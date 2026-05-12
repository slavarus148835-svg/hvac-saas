import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireCronSecret } from "@/lib/server/requireCronSecret";
import { runTelegramMiniAppUserNotifications } from "@/lib/server/runTelegramMiniAppUserNotifications";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = requireCronSecret(req);
  if (denied) return denied;

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ ok: false, error: "no_db" }, { status: 503 });
  }

  const result = await runTelegramMiniAppUserNotifications(db);
  return NextResponse.json({ ok: true, ...result });
}
