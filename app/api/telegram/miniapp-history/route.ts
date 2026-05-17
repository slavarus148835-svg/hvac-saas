import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { assertMiniAppServiceAccess } from "@/lib/server/telegram/assertMiniAppServiceAccess";
import { verifyTelegramMiniAppSession } from "@/lib/server/telegram/telegramMiniAppSession";

export const runtime = "nodejs";

function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h || typeof h !== "string") return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m?.[1]?.trim() || null;
}

function parseCreatedMs(raw: unknown): number {
  if (typeof raw === "string") {
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : 0;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  return 0;
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

    const url = new URL(req.url);
    const historyId = url.searchParams.get("historyId")?.trim();

    if (historyId) {
      const ref = db.collection("calculationHistory").doc(historyId);
      const snap = await ref.get();
      if (!snap.exists) {
        return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
      }
      const data = snap.data() as Record<string, unknown>;
      if (String(data.uid || "") !== v.uid) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.json({ ok: true, doc: { id: snap.id, ...data } });
    }

    const q = await db
      .collection("calculationHistory")
      .where("uid", "==", v.uid)
      .limit(200)
      .get();

    const items = q.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const roomCountRaw = data.roomCount;
      const roomsLen = Array.isArray(data.rooms) ? data.rooms.length : 0;
      const roomCount =
        typeof roomCountRaw === "number" && roomCountRaw > 0
          ? roomCountRaw
          : data.multiRoom === true && roomsLen > 0
            ? roomsLen
            : 1;
      return {
        id: d.id,
        createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
        clientName: typeof data.clientName === "string" ? data.clientName : "",
        total: typeof data.total === "number" ? data.total : 0,
        mountType: data.mountType === "existing" ? "existing" : "standard",
        capacity: typeof data.capacity === "string" ? data.capacity : "",
        roomCount,
      };
    });

    items.sort((a, b) => parseCreatedMs(b.createdAt) - parseCreatedMs(a.createdAt));

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    console.log("TELEGRAM_MINIAPP_HISTORY_FAILED", {
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
    const historyId = url.searchParams.get("historyId")?.trim();
    if (!historyId) {
      return NextResponse.json({ ok: false, error: "historyId_required" }, { status: 400 });
    }

    const ref = db.collection("calculationHistory").doc(historyId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    const data = snap.data() as Record<string, unknown>;
    if (String(data.uid || "") !== v.uid) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.log("TELEGRAM_MINIAPP_HISTORY_DELETE_FAILED", {
      message: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
