import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { findUserByTelegramKeys } from "@/lib/server/authDuplicateGuards";
import { isFirestoreCapacityError } from "@/lib/server/statsUsersSnapshot";
import { verifyTelegramInitData } from "@/lib/server/telegram/verifyTelegramInitData";

export const runtime = "nodejs";

function authorize(req: Request): boolean {
  const expected = String(process.env.CRON_SECRET || process.env.INTERNAL_DEBUG_SECRET || "").trim();
  if (!expected) return false;
  const url = new URL(req.url);
  const q = url.searchParams.get("secret");
  const h = req.headers.get("authorization");
  return q === expected || h === `Bearer ${expected}` || h === expected;
}

export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = getAdminDb();
  let firestoreOk = false;
  let firestoreError: string | null = null;

  if (db) {
    try {
      await db.collection("users").limit(1).get();
      firestoreOk = true;
    } catch (e) {
      firestoreError = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json({
    ok: true,
    vercel: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      env: process.env.VERCEL_ENV ?? null,
    },
    telegram: {
      botTokenConfigured: !!String(process.env.TELEGRAM_BOT_TOKEN || "").trim(),
      initDataMaxAgeSec: Number(process.env.TELEGRAM_INITDATA_MAX_AGE_SEC || 86400),
    },
    firestore: {
      adminDb: Boolean(db),
      readOk: firestoreOk,
      capacityError: firestoreError ? isFirestoreCapacityError(firestoreError) : false,
      error: firestoreError,
    },
    deployedMarkers: {
      bootstrapLogs: true,
      mapMiniAppBootstrapError: true,
      mergedDuplicateFilter: true,
    },
  });
}

export async function POST(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { initData?: string; telegramUserId?: string };
  try {
    body = (await req.json()) as { initData?: string; telegramUserId?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const initData = typeof body.initData === "string" ? body.initData.trim() : "";
  const verified = initData ? verifyTelegramInitData(initData) : { ok: false as const, error: "no_init_data" };

  const db = getAdminDb();
  let lookup: unknown = null;
  if (db && verified.ok) {
    const tgId = String(Math.trunc(verified.telegramUser.id));
    try {
      lookup = await findUserByTelegramKeys(db, tgId, null);
    } catch (e) {
      lookup = {
        error: e instanceof Error ? e.message : String(e),
        capacity: isFirestoreCapacityError(e),
      };
    }
  }

  return NextResponse.json({
    ok: verified.ok,
    verify: verified,
    lookup,
    hint: "POST full WebApp initData from client to test hash + user lookup",
  });
}
