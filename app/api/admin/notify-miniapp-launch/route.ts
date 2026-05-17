import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { readInternalDebugSecret } from "@/lib/server/assertInternalDebugSecret";
import {
  runMiniAppLaunchNotify,
  type MiniAppLaunchNotifyBody,
  type MiniAppLaunchNotifyChannel,
} from "@/lib/server/runMiniAppLaunchNotify";

export const runtime = "nodejs";

function isAuthorized(req: Request): boolean {
  const provided = readInternalDebugSecret(req);
  if (!provided) return false;
  const internal = String(process.env.INTERNAL_DEBUG_SECRET || "").trim();
  const cron = String(process.env.CRON_SECRET || "").trim();
  if (internal.length > 0 && provided === internal) return true;
  if (cron.length > 0 && provided === cron) return true;
  return false;
}

function parseChannel(raw: unknown): MiniAppLaunchNotifyChannel {
  const v = String(raw ?? "auto").trim().toLowerCase();
  if (v === "telegram" || v === "email") return v;
  return "auto";
}

/**
 * POST /api/admin/notify-miniapp-launch
 * Массовая рассылка о запуске Mini App (батчами, с dryRun).
 */
export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  let body: MiniAppLaunchNotifyBody = {};
  try {
    body = (await req.json()) as MiniAppLaunchNotifyBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await runMiniAppLaunchNotify(db, {
    dryRun: body.dryRun !== false,
    limit: body.limit,
    channel: parseChannel(body.channel),
  });

  return NextResponse.json({ ok: true, ...result });
}
