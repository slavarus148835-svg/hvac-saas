import { NextResponse } from "next/server";
import { getAdminApp, getAdminDb } from "@/lib/firebaseAdmin";
import { assertInternalDebugSecret } from "@/lib/server/assertInternalDebugSecret";
import { buildTelegramRegistrationStateDebug } from "@/lib/server/telegram/telegramRegistrationDebug";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = assertInternalDebugSecret(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const telegramUserId = url.searchParams.get("telegramUserId") || "";
  const email = url.searchParams.get("email") || "";

  const app = getAdminApp();
  const db = getAdminDb();
  if (!app || !db) {
    return NextResponse.json({ error: "no_admin" }, { status: 503 });
  }

  const state = await buildTelegramRegistrationStateDebug(db, app, {
    telegramUserId,
    email,
  });
  return NextResponse.json(state);
}
