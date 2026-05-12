import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { firestoreTimeToMs } from "@/lib/server/firestoreTimeMs";
import { requireBearerUid } from "@/lib/server/requireBearerUid";

export const runtime = "nodejs";

/** Идempotентная отметка первого сохранённого расчёта на users/{uid}. */
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
  const ref = db.collection("users").doc(uid);

  try {
    const outcome = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};
      if (firestoreTimeToMs(data.firstCalculationAt) > 0) {
        return "skip" as const;
      }

      tx.set(
        ref,
        {
          firstCalculationAt: Date.now(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      return "write" as const;
    });

    return NextResponse.json({
      ok: true,
      written: outcome === "write",
    });
  } catch (e) {
    console.error("[mark-first-calculation]", e);
    return NextResponse.json({ error: "transaction_failed" }, { status: 500 });
  }
}
