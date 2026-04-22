import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  assertTelegramSessionCreateRateLimit,
  createTelegramLoginSession,
} from "@/lib/server/telegramLoginSession";

export const runtime = "nodejs";

function botUsername(): string {
  return String(process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "hvac_cash_bot").trim();
}

export async function POST(req: Request) {
  try {
    const db = getAdminDb();
    if (!db) {
      return NextResponse.json({ error: "no_admin" }, { status: 503 });
    }

    const rate = await assertTelegramSessionCreateRateLimit(db, req);
    if (!rate.ok) {
      return NextResponse.json(
        { error: "rate_limited", retryAfterSec: rate.retryAfterSec },
        { status: 429 }
      );
    }

    const created = await createTelegramLoginSession(db, {
      createdByIpHash: rate.createdByIpHash,
    });
    const botUrl = `https://t.me/${botUsername()}?start=${encodeURIComponent(
      `login_${created.sessionId}`
    )}`;

    return NextResponse.json({
      sessionId: created.sessionId,
      botUrl,
      expiresAt: created.expiresAt,
    });
  } catch (e) {
    console.error("[api/auth/telegram-session/create]", e);
    return NextResponse.json({ error: "unknown_error" }, { status: 500 });
  }
}
