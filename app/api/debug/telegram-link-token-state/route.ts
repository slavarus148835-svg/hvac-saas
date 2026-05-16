import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { assertInternalDebugSecret } from "@/lib/server/assertInternalDebugSecret";
import { buildTelegramLinkTokenStateDebug } from "@/lib/server/telegram/telegramRegistrationDebug";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = assertInternalDebugSecret(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const email = url.searchParams.get("email") || "";
  if (!email.trim()) {
    return NextResponse.json({ error: "email_query_required" }, { status: 400 });
  }

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ error: "no_admin" }, { status: 503 });
  }

  const state = await buildTelegramLinkTokenStateDebug(db, email);
  return NextResponse.json(state);
}
