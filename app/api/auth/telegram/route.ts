import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getAdminApp, getAdminDb } from "@/lib/firebaseAdmin";
import { getSafePostLoginPath } from "@/lib/safeRedirect";
import {
  isTelegramAuthFresh,
  verifyTelegramLoginPayload,
} from "@/lib/server/telegramLogin";
import { provisionOrUpdateTelegramUser } from "@/lib/server/provisionTelegramUser";
import {
  markLeadCompletedForTelegramId,
  upsertLeadTelegramStarted,
} from "@/lib/server/leadsFirestore";

export const runtime = "nodejs";

function registerErrorRedirect(req: NextRequest, code: string): NextResponse {
  const origin = new URL(req.url).origin;
  const url = new URL("/register", origin);
  url.searchParams.set("telegram_error", code);
  return NextResponse.redirect(url, 302);
}

export async function GET(req: NextRequest) {
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (!botToken) {
    console.error("[api/auth/telegram] TELEGRAM_BOT_TOKEN missing");
    return registerErrorRedirect(req, "missing_bot_token");
  }

  const app = getAdminApp();
  const db = getAdminDb();
  if (!app || !db) {
    console.error("[api/auth/telegram] Firebase Admin unavailable");
    return registerErrorRedirect(req, "server_misconfigured");
  }

  const url = new URL(req.url);
  const payload: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    payload[k] = v;
  });

  if (!verifyTelegramLoginPayload(payload, botToken)) {
    console.warn("[api/auth/telegram] hash verification failed");
    return registerErrorRedirect(req, "invalid_signature");
  }

  const authDateSec = Number(payload.auth_date);
  if (!isTelegramAuthFresh(authDateSec, 600)) {
    console.warn("[api/auth/telegram] auth_date stale", { authDateSec });
    return registerErrorRedirect(req, "auth_expired");
  }

  const telegramId = String(payload.id || "").trim();
  if (!telegramId) {
    return registerErrorRedirect(req, "missing_id");
  }

  try {
    await upsertLeadTelegramStarted(db, telegramId);
  } catch (e) {
    console.warn("[api/auth/telegram] lead upsert (telegram started) failed", e);
  }

  const telegramUsername = payload.username?.trim() || null;
  const firstName = payload.first_name?.trim() || null;
  const lastName = payload.last_name?.trim() || null;
  const photoUrl = payload.photo_url?.trim() || null;

  let uid: string;
  try {
    const out = await provisionOrUpdateTelegramUser({
      db,
      app,
      profile: {
        telegramId,
        telegramUsername,
        firstName,
        lastName,
        photoUrl,
      },
    });
    uid = out.uid;
  } catch (e) {
    console.error("[api/auth/telegram] provision failed", e);
    return registerErrorRedirect(req, "provision_failed");
  }

  let customToken: string;
  try {
    customToken = await getAuth(app).createCustomToken(uid);
  } catch (e) {
    console.error("[api/auth/telegram] createCustomToken failed", e);
    return registerErrorRedirect(req, "token_failed");
  }

  try {
    await markLeadCompletedForTelegramId(db, telegramId);
  } catch (e) {
    console.warn("[api/auth/telegram] mark lead completed failed", e);
  }

  const origin = new URL(req.url).origin;
  const nextSafe = getSafePostLoginPath(url.searchParams.get("next"));
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("next", nextSafe);
  loginUrl.hash = `tg_token=${encodeURIComponent(customToken)}`;

  return NextResponse.redirect(loginUrl.toString(), 302);
}
