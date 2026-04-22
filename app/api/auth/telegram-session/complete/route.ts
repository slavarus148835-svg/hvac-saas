import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { markTelegramLoginSessionUsed } from "@/lib/server/telegramLoginSession";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const db = getAdminDb();
    if (!db) {
      return NextResponse.json({ error: "no_admin" }, { status: 503 });
    }

    const body = (await req.json().catch(() => ({}))) as { sessionId?: string };
    const sessionId = String(body.sessionId || "").trim();
    if (!sessionId) {
      return NextResponse.json({ error: "missing_session_id" }, { status: 400 });
    }

    const marked = await markTelegramLoginSessionUsed(db, sessionId);
    if (!marked.ok) {
      return NextResponse.json({ ok: false, reason: marked.reason }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/auth/telegram-session/complete]", e);
    return NextResponse.json({ error: "unknown_error" }, { status: 500 });
  }
}
