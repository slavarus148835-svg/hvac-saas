import { NextResponse } from "next/server";
import { getAdminApp, getAdminDb } from "@/lib/firebaseAdmin";
import { assertInternalDebugSecret } from "@/lib/server/assertInternalDebugSecret";
import { buildRegistrationDiagnosis } from "@/lib/server/registrationDiagnose";

export const runtime = "nodejs";

/**
 * GET /api/debug/registration-diagnose?email=user@example.com
 * Secret: x-debug-secret, x-internal-debug-secret, ?secret=, Bearer.
 */
export async function GET(req: Request) {
  const denied = assertInternalDebugSecret(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const email = String(url.searchParams.get("email") || "").trim();
  if (!email) {
    return NextResponse.json({ error: "email_query_required" }, { status: 400 });
  }

  const telegramLoginSessionId = String(
    url.searchParams.get("telegramLoginSessionId") || ""
  ).trim();

  const app = getAdminApp();
  const db = getAdminDb();
  if (!app || !db) {
    return NextResponse.json({ error: "no_admin" }, { status: 503 });
  }

  const diagnosis = await buildRegistrationDiagnosis(db, app, email, {
    telegramLoginSessionId: telegramLoginSessionId || undefined,
  });

  return NextResponse.json(diagnosis);
}
