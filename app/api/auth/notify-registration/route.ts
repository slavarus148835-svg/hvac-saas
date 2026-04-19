import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { requireBearerUid } from "@/lib/server/requireBearerUid";
import {
  buildRegistrationNotificationHtml,
  sendTelegramNotification,
} from "@/lib/server/sendTelegramNotification";

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

  const email =
    String(user.email || auth.data.email || "").trim() ||
    String(auth.data.email || "").trim();
  const name = typeof user.name === "string" ? user.name : "";
  const phone = typeof user.phone === "string" ? user.phone : "";

  const date = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
  const html = buildRegistrationNotificationHtml({
    email: email || "—",
    uid,
    name,
    phone,
    date,
  });

  console.log("[telegram] registration notify start");
  const result = await sendTelegramNotification(html);

  const nowIso = new Date().toISOString();

  if (result.ok) {
    console.log("[telegram] registration notify success");
    await userRef.set(
      {
        registrationStage: "telegram_sent",
        telegramNotifiedAt: nowIso,
        telegramNotifyError: null,
        lastRegistrationError: null,
        updatedAt: nowIso,
      },
      { merge: true }
    );
    return NextResponse.json({ ok: true });
  }

  console.error("[telegram] registration notify failed", {
    skipped: result.skipped,
    error: result.error,
    httpStatus: result.httpStatus,
  });

  await userRef.set(
    {
      registrationStage: "telegram_failed",
      telegramNotifyError:
        result.reason === "missing_env"
          ? "telegram_env_missing"
          : result.error || result.telegramDescription || "telegram_send_failed",
      telegramNotifiedAt: null,
      updatedAt: nowIso,
    },
    { merge: true }
  );

  return NextResponse.json(
    {
      ok: false,
      error: result.error || result.telegramDescription || "telegram_send_failed",
      skipped: result.skipped,
    },
    { status: result.skipped ? 503 : 500 }
  );
}
