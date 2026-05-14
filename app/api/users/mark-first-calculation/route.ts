import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { markFirstCalculationIfNeededAndRecordB2B } from "@/lib/server/partnerManager/partnerManagerB2b";
import { requireBearerUid } from "@/lib/server/requireBearerUid";

export const runtime = "nodejs";

/** Идемпотентная отметка первого сохранённого расчёта на users/{uid} + B2B-событие. */
export async function POST(req: Request) {
  const authRes = await requireBearerUid(req);
  if (!authRes.ok) {
    return NextResponse.json(authRes.data, { status: authRes.status });
  }

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ error: "no_admin" }, { status: 503 });
  }

  const uid = authRes.data.uid;

  try {
    const written = await markFirstCalculationIfNeededAndRecordB2B(db, uid);
    return NextResponse.json({
      ok: true,
      written,
    });
  } catch (e) {
    console.error("[mark-first-calculation]", e);
    return NextResponse.json({ error: "transaction_failed" }, { status: 500 });
  }
}
