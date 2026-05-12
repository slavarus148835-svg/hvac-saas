import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { loadMiniAppCalculatorContext } from "@/lib/server/telegram/loadMiniAppCalculatorContext";
import { verifyTelegramMiniAppSession } from "@/lib/server/telegram/telegramMiniAppSession";

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
      return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
    }

    const v = await verifyTelegramMiniAppSession(db, token);
    if (!v.ok) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const ctx = await loadMiniAppCalculatorContext(db, v.uid);

    return NextResponse.json({
      ok: true,
      prices: ctx.prices,
      giftRouteMeters: ctx.giftRouteMeters,
      models: ctx.models,
      customServices: ctx.customServices,
    });
  } catch (e) {
    console.log("TELEGRAM_MINIAPP_CALC_CONTEXT_FAILED", {
      message: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
