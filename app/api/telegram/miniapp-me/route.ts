import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  loadUserDocByUid,
  telegramMiniAppPublicProfileFromUserDoc,
  verifyTelegramMiniAppSession,
} from "@/lib/server/telegram/telegramMiniAppSession";

export const runtime = "nodejs";

function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h || typeof h !== "string") return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m?.[1]?.trim() || null;
}

export async function GET(req: Request) {
  console.log("TELEGRAM_MINIAPP_ME_START");
  try {
    const token = bearerToken(req);
    if (!token) {
      console.log("TELEGRAM_MINIAPP_ME_FAILED", { reason: "missing_bearer" });
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const db = getAdminDb();
    if (!db) {
      console.log("TELEGRAM_MINIAPP_ME_FAILED", { reason: "no_firebase_admin" });
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const v = await verifyTelegramMiniAppSession(db, token);
    if (!v.ok) {
      console.log("TELEGRAM_MINIAPP_ME_FAILED", { reason: v.error });
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const loaded = await loadUserDocByUid(db, v.uid);
    if (!loaded) {
      console.log("TELEGRAM_MINIAPP_ME_FAILED", {
        reason: "user_doc_missing",
        uid: v.uid,
      });
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const profile = telegramMiniAppPublicProfileFromUserDoc(v.uid, loaded.data);

    console.log("TELEGRAM_MINIAPP_ME_OK", { uid: v.uid });

    return NextResponse.json({
      ok: true,
      profile: {
        uid: profile.uid,
        email: profile.email,
        plan: profile.plan,
        hasPaid: profile.hasPaid,
        blocked: profile.blocked,
        telegramUserId: profile.telegramUserId,
        telegramId: profile.telegramId,
        telegramUsername: profile.telegramUsername,
      },
    });
  } catch (e) {
    console.log("TELEGRAM_MINIAPP_ME_FAILED", {
      reason: "exception",
      message: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
}
