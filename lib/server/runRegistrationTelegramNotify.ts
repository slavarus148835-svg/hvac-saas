import type { Firestore } from "firebase-admin/firestore";
import {
  notifyAdminNewUserIfNeeded,
  type AdminNewUserNotifySource,
} from "@/lib/server/notifyAdminNewUser";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { isStatsExcludedTelegramProvisionUid } from "@/lib/server/statsExcludeTelegramProvisionUid";

/**
 * Идемпотентное уведомление админу о регистрации (POST /api/auth/notify-registration).
 */
export async function runRegistrationTelegramNotifyIfNeeded(
  db: Firestore,
  uid: string,
  bearerEmail?: string | null
): Promise<void> {
  if (isStatsExcludedTelegramProvisionUid(uid)) return;

  const snap = await db.collection(PRICING_FS.users).doc(uid).get();
  if (!snap.exists) return;

  const user = snap.data() ?? {};
  const source: AdminNewUserNotifySource =
    user.registrationSource === "telegram_mini_app" ? "telegram_mini_app" : "web";

  await notifyAdminNewUserIfNeeded(db, {
    uid,
    email: String(user.email || bearerEmail || "").trim(),
    source,
    telegramUserId:
      typeof user.telegramUserId === "string"
        ? user.telegramUserId
        : typeof user.telegramId === "string"
          ? user.telegramId
          : null,
    telegramUsername:
      typeof user.telegramUsername === "string" ? user.telegramUsername : null,
    createdAt: typeof user.createdAt === "string" ? user.createdAt : null,
  });
}
