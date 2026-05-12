import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { firestoreFieldToIsoUtc } from "@/lib/server/telegram/firestoreTimeIso";
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
  try {
    const token = bearerToken(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const db = getAdminDb();
    if (!db) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const v = await verifyTelegramMiniAppSession(db, token);
    if (!v.ok) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const loaded = await loadUserDocByUid(db, v.uid);
    if (!loaded) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const profile = telegramMiniAppPublicProfileFromUserDoc(v.uid, loaded.data);
    const d = loaded.data;
    const subscriptionStatus =
      typeof d.subscriptionStatus === "string" ? d.subscriptionStatus : null;

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
        trialEndsAt: firestoreFieldToIsoUtc(d.trialEndsAt),
        paidAt: firestoreFieldToIsoUtc(d.paidAt),
        subscriptionStatus,
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
