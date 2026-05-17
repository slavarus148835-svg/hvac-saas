import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  DEFAULT_CALCULATOR_PRICES,
  normalizePriceDocForSplitCapacity,
  type CalculatorPriceList,
} from "@/lib/calculator";
import {
  calculatorPriceListToFormStrings,
  normalizeMiniAppPricePayload,
  parseGiftRouteMetersInput,
} from "@/lib/miniAppPriceForm";
import { mergeNumericPriceDocument } from "@/lib/mergeNumericPriceDocument";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { assertMiniAppServiceAccess } from "@/lib/server/telegram/assertMiniAppServiceAccess";
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

    const denied = await assertMiniAppServiceAccess(db, v.uid);
    if (denied) return denied;

    const uid = v.uid;
    const userSnap = await db.collection(PRICING_FS.users).doc(uid).get();
    const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};
    const gm = Number(userData.giftRouteMeters);
    const giftRouteMeters =
      Number.isFinite(gm) && gm >= 0 ? Math.min(500, Math.floor(gm)) : 1;

    let merged: CalculatorPriceList = { ...DEFAULT_CALCULATOR_PRICES };
    const priceRef = db.collection(PRICING_FS.priceLists).doc(uid);
    const priceSnap = await priceRef.get();
    const hasSavedPriceList = priceSnap.exists;

    if (priceSnap.exists) {
      const pdata = priceSnap.data() as Record<string, unknown>;
      merged = mergeNumericPriceDocument(
        normalizePriceDocForSplitCapacity(pdata),
        DEFAULT_CALCULATOR_PRICES
      );
    }

    const form = calculatorPriceListToFormStrings(merged);

    return NextResponse.json({
      ok: true,
      form,
      giftRouteMeters,
      hasSavedPriceList,
    });
  } catch (e) {
    console.log("TELEGRAM_MINIAPP_PRICE_GET_FAILED", {
      message: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
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

    const denied = await assertMiniAppServiceAccess(db, v.uid);
    if (denied) return denied;

    const uid = v.uid;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const partial = normalizeMiniAppPricePayload(body);
    const gift = parseGiftRouteMetersInput(
      body && typeof body === "object" ? (body as Record<string, unknown>).giftRouteMeters : null
    );

    if (Object.keys(partial).length === 0 && gift === null) {
      return NextResponse.json({ ok: false, error: "empty_payload" }, { status: 400 });
    }

    const batch = db.batch();

    if (Object.keys(partial).length > 0) {
      const priceRef = db.collection(PRICING_FS.priceLists).doc(uid);
      const existing = await priceRef.get();
      let nextFull: CalculatorPriceList = { ...DEFAULT_CALCULATOR_PRICES };

      if (existing.exists) {
        const pdata = existing.data() as Record<string, unknown>;
        nextFull = mergeNumericPriceDocument(
          normalizePriceDocForSplitCapacity(pdata),
          DEFAULT_CALCULATOR_PRICES
        );
      }

      nextFull = { ...nextFull, ...partial };

      const numericPayload: Record<string, number> = {};
      for (const k of Object.keys(DEFAULT_CALCULATOR_PRICES) as (keyof CalculatorPriceList)[]) {
        numericPayload[k] = Math.max(0, Math.floor(Number(nextFull[k]) || 0));
      }

      batch.set(
        priceRef,
        {
          ...numericPayload,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }

    if (gift !== null) {
      const userRef = db.collection(PRICING_FS.users).doc(uid);
      batch.set(
        userRef,
        {
          uid,
          giftRouteMeters: gift,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }

    await batch.commit();

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.log("TELEGRAM_MINIAPP_PRICE_POST_FAILED", {
      message: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
