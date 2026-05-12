import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { buildMiniAppQuotePdfBytes } from "@/lib/server/buildMiniAppQuotePdf";
import { verifyTelegramMiniAppSession } from "@/lib/server/telegram/telegramMiniAppSession";

export const runtime = "nodejs";

function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h || typeof h !== "string") return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m?.[1]?.trim() || null;
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

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const clientName =
      typeof body.clientName === "string" ? body.clientName.trim().slice(0, 200) : "";
    const clientContact =
      typeof body.clientContact === "string" ? body.clientContact.trim().slice(0, 200) : "";
    const capacity = typeof body.capacity === "string" ? body.capacity.trim() || "—" : "—";
    const mountType = body.mountType === "existing" ? "existing" : "standard";
    const mountTypeLabel =
      mountType === "standard" ? "на нашу трассу" : "на чужую трассу";

    const rawLines = body.lines;
    const lines: { title: string; amount: number }[] = [];
    if (Array.isArray(rawLines)) {
      for (const x of rawLines.slice(0, 80)) {
        if (!x || typeof x !== "object") continue;
        const o = x as Record<string, unknown>;
        const title = typeof o.title === "string" ? o.title.trim().slice(0, 300) : "";
        const amt =
          typeof o.amount === "number"
            ? o.amount
            : typeof o.amount === "string"
              ? Number(o.amount)
              : NaN;
        if (!title || !Number.isFinite(amt)) continue;
        lines.push({ title, amount: amt });
      }
    }

    const totalRaw = body.total;
    const total =
      typeof totalRaw === "number"
        ? totalRaw
        : typeof totalRaw === "string"
          ? Number(totalRaw)
          : NaN;
    const totalSafe = Number.isFinite(total) ? Math.max(0, Math.round(total)) : 0;

    if (lines.length === 0) {
      return NextResponse.json({ ok: false, error: "no_lines" }, { status: 400 });
    }

    const bytes = await buildMiniAppQuotePdfBytes({
      clientName,
      clientContact,
      capacity,
      mountTypeLabel,
      lines,
      total: totalSafe,
    });

    console.log("TELEGRAM_MINIAPP_QUOTE_PDF_OK", { uid: v.uid, lines: lines.length });

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="hvac-saas-smeta.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.log("TELEGRAM_MINIAPP_QUOTE_PDF_FAILED", {
      message: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
