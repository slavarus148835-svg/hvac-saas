import { NextResponse } from "next/server";
import { getAdminApp } from "@/lib/firebaseAdmin";
import { verifyEmailVerificationCodeForUid } from "@/lib/server/emailVerificationCodeOps";
import { loadUserDocByUid } from "@/lib/server/telegram/telegramMiniAppSession";
import { requireMiniAppSessionBearer } from "@/lib/server/telegram/requireMiniAppSessionBearer";

export const runtime = "nodejs";

/** POST /api/telegram/miniapp-verify-email-code — Bearer: mini app session, body: { code } */
export async function POST(req: Request) {
  const session = await requireMiniAppSessionBearer(req);
  if (!session.ok) {
    return NextResponse.json(session.body, { status: session.status });
  }

  const app = getAdminApp();
  if (!app) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  let body: { code?: string };
  try {
    body = (await req.json()) as { code?: string };
  } catch {
    body = {};
  }

  const loaded = await loadUserDocByUid(session.db, session.uid);
  if (!loaded) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const email = String(loaded.data.email ?? "").trim();
  const result = await verifyEmailVerificationCodeForUid(
    session.db,
    app,
    session.uid,
    email,
    String(body.code ?? "")
  );

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, attemptsLeft: result.attemptsLeft },
      { status: result.status }
    );
  }

  return NextResponse.json({ ok: true, emailVerifiedByCode: true });
}
