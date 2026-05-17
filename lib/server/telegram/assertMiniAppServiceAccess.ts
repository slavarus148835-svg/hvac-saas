import { NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { evaluateMiniAppAccessGate } from "@/lib/server/telegram/evaluateMiniAppAccessGate";
import { loadUserDocByUid } from "@/lib/server/telegram/telegramMiniAppSession";

export async function assertMiniAppServiceAccess(
  db: Firestore,
  uid: string
): Promise<NextResponse | null> {
  const loaded = await loadUserDocByUid(db, uid);
  if (!loaded) {
    return NextResponse.json(
      { ok: false, error: "not_found", accessGate: "no_email" },
      { status: 404 }
    );
  }

  const gate = evaluateMiniAppAccessGate(uid, loaded.data);
  if (gate.allowed) return null;

  return NextResponse.json(
    {
      ok: false,
      error: "access_denied",
      accessGate: gate.reason,
      emailVerifiedByCode: gate.emailVerifiedByCode,
    },
    { status: 403 }
  );
}
