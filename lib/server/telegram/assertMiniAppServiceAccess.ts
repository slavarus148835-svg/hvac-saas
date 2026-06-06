import { NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { evaluateMiniAppAccessGate } from "@/lib/server/telegram/evaluateMiniAppAccessGate";
import { evaluateMiniAppSubscriptionAccess } from "@/lib/server/evaluateMiniAppSubscriptionAccess";
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
  if (!gate.allowed) {
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

  const subscription = evaluateMiniAppSubscriptionAccess(loaded.data);
  if (!subscription.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "access_denied",
        accessGate: subscription.reason,
        subscriptionAllowed: false,
        emailVerifiedByCode: gate.emailVerifiedByCode,
      },
      { status: 403 }
    );
  }

  return null;
}
