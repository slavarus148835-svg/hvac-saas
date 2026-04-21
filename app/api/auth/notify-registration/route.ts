import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { requireBearerUid } from "@/lib/server/requireBearerUid";
import { runRegistrationTelegramNotifyIfNeeded } from "@/lib/server/runRegistrationTelegramNotify";

/**
 * Уведомление в Telegram после успешного создания аккаунта (server-side).
 * Идемпотентно: повторный вызов не шлёт второе сообщение, если уже есть telegramNotifiedAt.
 */
export async function POST(req: Request) {
  const auth = await requireBearerUid(req);
  if (!auth.ok) {
    return NextResponse.json(auth.data, { status: auth.status });
  }

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ error: "no_admin" }, { status: 503 });
  }

  const { uid } = auth.data;
  const userRef = db.collection(PRICING_FS.users).doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "user_doc_missing" }, { status: 404 });
  }

  const user = snap.data() ?? {};
  if (user.telegramNotifiedAt) {
    return NextResponse.json({ ok: true, skipped: true, reason: "already_notified" });
  }

  await runRegistrationTelegramNotifyIfNeeded(db, uid, auth.data.email);

  const after = await userRef.get();
  const u2 = after.data() ?? {};
  if (u2.telegramNotifiedAt) {
    return NextResponse.json({ ok: true });
  }

  const err = String(u2.telegramNotifyError || "telegram_send_failed");
  return NextResponse.json(
    {
      ok: false,
      error: err,
    },
    { status: err === "telegram_env_missing" ? 503 : 500 }
  );
}
