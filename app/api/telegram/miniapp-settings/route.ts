import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { verifyTelegramMiniAppSession } from "@/lib/server/telegram/telegramMiniAppSession";

export const runtime = "nodejs";

const MAX_FOOTER = 4000;
const MAX_GUARANTEE = 2000;
const MAX_CONTACT = 500;

function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h || typeof h !== "string") return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m?.[1]?.trim() || null;
}

function clip(s: unknown, max: number): string {
  if (typeof s !== "string") return "";
  return s.trim().slice(0, max);
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

    const snap = await db.collection(PRICING_FS.users).doc(v.uid).get();
    const d = snap.exists ? (snap.data() as Record<string, unknown>) : {};
    const gm = Number(d.giftRouteMeters);
    const giftRouteMeters =
      Number.isFinite(gm) && gm >= 0 ? Math.min(500, Math.floor(gm)) : 1;

    return NextResponse.json({
      ok: true,
      giftRouteMeters,
      quoteFooterTemplate: clip(d.calculatorQuoteFooterTemplate, MAX_FOOTER),
      guaranteeText: clip(d.calculatorGuaranteeText, MAX_GUARANTEE),
      masterContact: clip(d.calculatorMasterContact, MAX_CONTACT),
    });
  } catch (e) {
    console.log("TELEGRAM_MINIAPP_SETTINGS_GET_FAILED", {
      message: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
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

    let body: Record<string, unknown>;
    try {
      const j = await req.json();
      body = j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : {};
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const patch: Record<string, unknown> = {
      uid: v.uid,
      updatedAt: new Date().toISOString(),
    };
    let anyField = false;

    if ("giftRouteMeters" in body) {
      anyField = true;
      let n = NaN;
      const raw = body.giftRouteMeters;
      if (typeof raw === "number") n = raw;
      else if (typeof raw === "string") n = Number(String(raw).replace(/\D/g, ""));
      if (!Number.isFinite(n)) {
        return NextResponse.json({ ok: false, error: "gift_invalid" }, { status: 400 });
      }
      patch.giftRouteMeters = Math.max(0, Math.min(500, Math.floor(n)));
    }

    if ("quoteFooterTemplate" in body) {
      anyField = true;
      patch.calculatorQuoteFooterTemplate = clip(body.quoteFooterTemplate, MAX_FOOTER);
    }

    if ("guaranteeText" in body) {
      anyField = true;
      patch.calculatorGuaranteeText = clip(body.guaranteeText, MAX_GUARANTEE);
    }

    if ("masterContact" in body) {
      anyField = true;
      patch.calculatorMasterContact = clip(body.masterContact, MAX_CONTACT);
    }

    if (!anyField) {
      return NextResponse.json({ ok: false, error: "empty_payload" }, { status: 400 });
    }

    await db.collection(PRICING_FS.users).doc(v.uid).set(patch, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.log("TELEGRAM_MINIAPP_SETTINGS_PATCH_FAILED", {
      message: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
