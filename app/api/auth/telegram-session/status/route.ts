import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getAdminApp, getAdminDb } from "@/lib/firebaseAdmin";
import {
  consumeConfirmedTelegramLoginSession,
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

    const consumed = await consumeConfirmedTelegramLoginSession(db, sessionId);
    if (!consumed.ok) {
      if (consumed.reason === "pending") {
        return NextResponse.json({ status: "pending", canCompleteLogin: false });
      }
      if (consumed.reason === "expired") {
        return NextResponse.json({ status: "expired", canCompleteLogin: false });
      }
      if (consumed.reason === "used") {
        return NextResponse.json({ status: "confirmed", canCompleteLogin: false });
      }
      return NextResponse.json({ status: "error", canCompleteLogin: false });
    }

    const customToken = await getAuth(app).createCustomToken(consumed.resolvedUid);
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
