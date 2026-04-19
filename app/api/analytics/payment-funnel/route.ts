import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

export async function GET() {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json(
        {
          rows: [],
          notice:
            "FIREBASE_SERVICE_ACCOUNT_JSON не задан — аналитика оплат недоступна с сервера.",
        },
        { status: 200 }
      );
    }

    const snap = await adminDb.collection("users").limit(200).get();

    const rows = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    return NextResponse.json({ rows });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "analytics_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
