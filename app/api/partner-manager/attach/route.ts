import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getAdminApp, getAdminDb } from "@/lib/firebaseAdmin";
import {
  attachPartnerToUserIfEmpty,
  type PartnerSource,
} from "@/lib/server/partnerManager/partnerManagerB2b";
import { verifyTelegramMiniAppSession } from "@/lib/server/telegram/telegramMiniAppSession";

export const runtime = "nodejs";

async function resolveUidForPartnerAttach(req: Request): Promise<
  | { ok: true; uid: string }
  | { ok: false; status: number; data: { error: string } }
> {
  const raw = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!raw) {
    return { ok: false, status: 401, data: { error: "no_token" } };
  }

  const app = getAdminApp();
  if (app) {
    try {
      const decoded = await getAuth(app).verifyIdToken(raw);
      return { ok: true, uid: decoded.uid };
    } catch {
      /* Mini App session token */
    }
  }

  const db = getAdminDb();
  if (!db) {
    return { ok: false, status: 503, data: { error: "no_admin" } };
  }

  const mini = await verifyTelegramMiniAppSession(db, raw);
  if (!mini.ok) {
    return { ok: false, status: 401, data: { error: "invalid_token" } };
  }
  return { ok: true, uid: mini.uid };
}

export async function POST(req: Request) {
  const auth = await resolveUidForPartnerAttach(req);
  if (!auth.ok) {
    return NextResponse.json(auth.data, { status: auth.status });
  }

  let body: { code?: string; source?: string; firstTouchMs?: number; referralIntent?: boolean } =
    {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const sourceRaw = String(body.source ?? "web").trim();
  const source: PartnerSource =
    sourceRaw === "telegram_miniapp" ? "telegram_miniapp" : "web";

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ error: "no_admin" }, { status: 503 });
  }

  const result = await attachPartnerToUserIfEmpty(
    db,
    auth.uid,
    String(body.code ?? ""),
    source,
    {
      firstTouchMs:
        typeof body.firstTouchMs === "number" && Number.isFinite(body.firstTouchMs)
          ? body.firstTouchMs
          : undefined,
      referralIntent: body.referralIntent === true,
    }
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    attached: result.attached,
    reason: result.reason,
  });
}
