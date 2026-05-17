import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { verifyTelegramMiniAppSession } from "@/lib/server/telegram/telegramMiniAppSession";

export const runtime = "nodejs";

function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h || typeof h !== "string") return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m?.[1]?.trim() || null;
}

async function resolveUid(req: Request) {
  const token = bearerToken(req);
  if (!token) return null;
  const db = getAdminDb();
  if (!db) return null;
  const v = await verifyTelegramMiniAppSession(db, token);
  if (!v.ok) return null;
  return { db, uid: v.uid };
}

export async function GET(req: Request) {
  const ctx = await resolveUid(req);
  if (!ctx) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const snap = await ctx.db.collection(PRICING_FS.users).doc(ctx.uid).get();
  if (!snap.exists) {
    return NextResponse.json({ ok: true, completed: false });
  }

  const data = snap.data() ?? {};
  const completed = data.miniAppOnboardingCompleted === true;
  return NextResponse.json({ ok: true, completed });
}

export async function POST(req: Request) {
  const ctx = await resolveUid(req);
  if (!ctx) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  await ctx.db
    .collection(PRICING_FS.users)
    .doc(ctx.uid)
    .set(
      {
        miniAppOnboardingCompleted: true,
        miniAppOnboardingCompletedAt: FieldValue.serverTimestamp(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

  return NextResponse.json({ ok: true, completed: true });
}
