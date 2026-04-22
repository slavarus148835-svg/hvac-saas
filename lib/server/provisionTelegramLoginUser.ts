import type { App } from "firebase-admin/app";
import type { Firestore } from "firebase-admin/firestore";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { provisionOrUpdateTelegramUser } from "@/lib/server/provisionTelegramUser";

export async function provisionTelegramLoginUser(params: {
  db: Firestore;
  app: App;
  telegramUserId: string;
  telegramUsername?: string | null;
  telegramFirstName?: string | null;
  telegramLastName?: string | null;
}): Promise<{ uid: string; created: boolean }> {
  const telegramId = String(params.telegramUserId || "").replace(/\D/g, "");
  if (!telegramId) throw new Error("invalid_telegram_user_id");
  const out = await provisionOrUpdateTelegramUser({
    db: params.db,
    app: params.app,
    profile: {
      telegramId,
      telegramUsername: params.telegramUsername ?? null,
      firstName: params.telegramFirstName ?? null,
      lastName: params.telegramLastName ?? null,
      photoUrl: null,
    },
  });

  await params.db.collection(PRICING_FS.users).doc(out.uid).set(
    {
      telegramUserId: telegramId,
      telegramUsername: params.telegramUsername ?? null,
      telegramFirstName: params.telegramFirstName ?? null,
      telegramLastName: params.telegramLastName ?? null,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  return out;
}
