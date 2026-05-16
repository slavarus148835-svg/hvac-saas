import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { normalizeEmailForAuth } from "@/lib/server/authDuplicateGuards";
import { requireBearerUid } from "@/lib/server/requireBearerUid";
import { createTelegramLinkToken } from "@/lib/server/telegram/telegramLinkTokens";

export const runtime = "nodejs";

/**
 * POST /api/telegram/create-link-token
 * Только для авторизованного email-пользователя (Firebase ID token).
 */
export async function POST(req: Request) {
  const auth = await requireBearerUid(req);
  if (!auth.ok) {
    return NextResponse.json(auth.data, { status: auth.status });
  }

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ error: "no_admin" }, { status: 503 });
  }

  const email = normalizeEmailForAuth(auth.data.email);
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "no_email_on_user" }, { status: 400 });
  }

  try {
    const created = await createTelegramLinkToken(db, {
      uid: auth.data.uid,
      email,
    });

    return NextResponse.json({
      ok: true,
      linkUrl: created.linkUrl,
      expiresAt: new Date(created.expiresAtMs).toISOString(),
      expiresInSec: Math.ceil((created.expiresAtMs - Date.now()) / 1000),
    });
  } catch (e) {
    console.log("TELEGRAM_LINK_ERROR", { step: "create_token", message: String(e) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
