import type { Firestore } from "firebase-admin/firestore";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import {
  buildRegistrationNotificationHtml,
  sendTelegramNotification,
} from "@/lib/server/sendTelegramNotification";

/**
 * Идемпотентное уведомление о регистрации (как POST /api/auth/notify-registration).
 */
export async function runRegistrationTelegramNotifyIfNeeded(
  db: Firestore,
  uid: string,
  bearerEmail?: string | null
): Promise<void> {
  const userRef = db.collection(PRICING_FS.users).doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) return;

  const user = snap.data() ?? {};
  if (user.telegramNotifiedAt) return;

  const email =
    String(user.email || bearerEmail || "").trim() ||
    String(bearerEmail || "").trim();
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
    return;
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
}
