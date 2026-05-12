import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { attachPartnerReferralByCode } from "@/lib/server/attachPartnerReferral";
import { requireBearerUid } from "@/lib/server/requireBearerUid";

export async function POST(req: Request) {
  const auth = await requireBearerUid(req);
  if (!auth.ok) {
    return NextResponse.json(auth.data, { status: auth.status });
  }

  let body: { code?: string } = {};
  try {
    body = (await req.json()) as { code?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ error: "no_admin" }, { status: 503 });
  }

  const result = await attachPartnerReferralByCode(db, auth.data.uid, String(body.code ?? ""));
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    attached: result.attached,
    reason: result.reason,
  });
}
