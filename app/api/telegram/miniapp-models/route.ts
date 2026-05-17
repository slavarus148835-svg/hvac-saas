import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { assertMiniAppServiceAccess } from "@/lib/server/telegram/assertMiniAppServiceAccess";
import { verifyTelegramMiniAppSession } from "@/lib/server/telegram/telegramMiniAppSession";

export const runtime = "nodejs";

const CAPACITY_KW = new Set(["7", "9", "12", "18", "24", "30", "36"]);

function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h || typeof h !== "string") return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m?.[1]?.trim() || null;
}

function normalizeCapacityKw(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return CAPACITY_KW.has(s) ? s : null;
}

function normalizeComment(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, 500);
}

function parsePrice(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.floor(raw));
  }
  if (typeof raw === "string") {
    const n = Number(String(raw).replace(/\D/g, ""));
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  return null;
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

    const snap = await db
      .collection(PRICING_FS.users)
      .doc(v.uid)
      .collection(PRICING_FS.modelsSubcollection)
      .get();

    const models = snap.docs.map((d) => {
      const x = d.data() as {
        name?: unknown;
        price?: unknown;
        capacityKw?: unknown;
        comment?: unknown;
      };
      const price = parsePrice(x.price);
      return {
        id: d.id,
        name: String(x.name ?? "").trim(),
        price: price ?? 0,
        capacityKw: normalizeCapacityKw(x.capacityKw) ?? "",
        comment: typeof x.comment === "string" ? x.comment.trim().slice(0, 500) : "",
      };
    });
    models.sort((a, b) => a.name.localeCompare(b.name, "ru"));

    return NextResponse.json({ ok: true, models });
  } catch (e) {
    console.log("TELEGRAM_MINIAPP_MODELS_GET_FAILED", {
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

    let body: Record<string, unknown>;
    try {
      const j = await req.json();
      body = j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : {};
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });
    }

    const price = parsePrice(body.price);
    if (price === null || price <= 0) {
      return NextResponse.json({ ok: false, error: "price_invalid" }, { status: 400 });
    }

    const capacityKw = normalizeCapacityKw(body.capacityKw);
    const comment = normalizeComment(body.comment);

    const col = db
      .collection(PRICING_FS.users)
      .doc(v.uid)
      .collection(PRICING_FS.modelsSubcollection);

    const docRef = col.doc();
    await docRef.set({
      name,
      price,
      ...(capacityKw ? { capacityKw } : {}),
      ...(comment ? { comment } : {}),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (e) {
    console.log("TELEGRAM_MINIAPP_MODELS_POST_FAILED", {
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

    const denied = await assertMiniAppServiceAccess(db, v.uid);
    if (denied) return denied;

    let body: Record<string, unknown>;
    try {
      const j = await req.json();
      body = j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : {};
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) {
      return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
    }

    const ref = db
      .collection(PRICING_FS.users)
      .doc(v.uid)
      .collection(PRICING_FS.modelsSubcollection)
      .doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const patch: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if ("name" in body) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) {
        return NextResponse.json({ ok: false, error: "name_invalid" }, { status: 400 });
      }
      patch.name = name;
    }

    if ("price" in body) {
      const price = parsePrice(body.price);
      if (price === null || price <= 0) {
        return NextResponse.json({ ok: false, error: "price_invalid" }, { status: 400 });
      }
      patch.price = price;
    }

    if ("capacityKw" in body) {
      const ck = normalizeCapacityKw(body.capacityKw);
      if (body.capacityKw != null && String(body.capacityKw).trim() && !ck) {
        return NextResponse.json({ ok: false, error: "capacity_invalid" }, { status: 400 });
      }
      if (ck) patch.capacityKw = ck;
      else patch.capacityKw = FieldValue.delete();
    }

    if ("comment" in body) {
      const c = normalizeComment(body.comment);
      if (c) patch.comment = c;
      else patch.comment = FieldValue.delete();
    }

    await ref.update(patch);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.log("TELEGRAM_MINIAPP_MODELS_PATCH_FAILED", {
      message: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
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

    const url = new URL(req.url);
    const id = (url.searchParams.get("id") || "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
    }

    const ref = db
      .collection(PRICING_FS.users)
      .doc(v.uid)
      .collection(PRICING_FS.modelsSubcollection)
      .doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    await ref.delete();

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.log("TELEGRAM_MINIAPP_MODELS_DELETE_FAILED", {
      message: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
