import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getAdminApp, getAdminDb } from "@/lib/firebaseAdmin";
import {
  getTelegramLoginSession,
} from "@/lib/server/telegramLoginSession";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const db = getAdminDb();
    const app = getAdminApp();
    if (!db || !app) {
      return NextResponse.json(
        { status: "error", canCompleteLogin: false, error: "no_admin" },
        { status: 503 }
      );
    }

    const sessionId = String(new URL(req.url).searchParams.get("sessionId") || "").trim();
    console.log("[api/auth/telegram-session/status] poll", { sessionId });
    if (!sessionId) {
      return NextResponse.json(
        { status: "error", canCompleteLogin: false, error: "missing_session_id" },
        { status: 400 }
      );
    }

    const session = await getTelegramLoginSession(db, sessionId);
    if (!session) {
      return NextResponse.json(
        { status: "error", canCompleteLogin: false, error: "session_not_found" },
        { status: 404 }
      );
    }

    if (session.status === "expired") {
      return NextResponse.json({ status: "expired", canCompleteLogin: false });
    }
    if (session.status === "pending") {
      return NextResponse.json({ status: "pending", canCompleteLogin: false });
    }

    if (!session.resolvedUid) {
      return NextResponse.json({ status: "error", canCompleteLogin: false });
    }

    const customToken = await getAuth(app).createCustomToken(session.resolvedUid);
    return NextResponse.json({
      status: "confirmed",
      canCompleteLogin: true,
      customToken,
    });
  } catch (e) {
    console.error("[api/auth/telegram-session/status]", e);
    return NextResponse.json(
      { status: "error", canCompleteLogin: false, error: "unknown_error" },
      { status: 500 }
    );
  }
}
