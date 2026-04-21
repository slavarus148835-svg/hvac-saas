import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { markLeadCompletedForUid } from "@/lib/server/leadsFirestore";
import { requireBearerUid } from "@/lib/server/requireBearerUid";

export const runtime = "nodejs";

/** После успешного входа (email/пароль или клиент после Telegram) — закрыть лид по uid. */
export async function POST(req: Request) {
  const auth = await requireBearerUid(req);
  if (!auth.ok) {
    return NextResponse.json(auth.data, { status: auth.status });
  }
  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ error: "no_admin" }, { status: 503 });
  }
  try {
    await markLeadCompletedForUid(db, auth.data.uid);
  } catch (e) {
    console.warn("[complete-lead] mark failed", e);
  }
  return NextResponse.json({ ok: true });
}
