import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { sendEmailVerificationCodeForUid } from "@/lib/server/emailVerificationCodeOps";
import { loadUserDocByUid } from "@/lib/server/telegram/telegramMiniAppSession";
import { requireMiniAppSessionBearer } from "@/lib/server/telegram/requireMiniAppSessionBearer";

export const runtime = "nodejs";

/** POST /api/telegram/miniapp-send-email-code — Bearer: mini app session */
export async function POST(req: Request) {
  const session = await requireMiniAppSessionBearer(req);
  if (!session.ok) {
    return NextResponse.json(session.body, { status: session.status });
  }

  const loaded = await loadUserDocByUid(session.db, session.uid);
  if (!loaded) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const email = String(loaded.data.email ?? "").trim();
  if (!email) {
    return NextResponse.json({ ok: false, error: "no_email" }, { status: 400 });
  }

  const result = await sendEmailVerificationCodeForUid(session.db, session.uid, email);
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        retryAfterSec: result.retryAfterSec,
        detail: result.detail,
      },
      { status: result.status }
    );
  }

  return NextResponse.json({ ok: true, cooldownSec: result.cooldownSec });
}
