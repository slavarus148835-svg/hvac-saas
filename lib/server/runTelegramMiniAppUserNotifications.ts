import type { Firestore } from "firebase-admin/firestore";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import {
  getTrialEndMs,
  isPaidActive,
  isTrialExpired,
  isTrialRunning,
  trialDaysRemaining,
} from "@/lib/trialSubscription";
import { sendTelegramTextToUser } from "@/lib/server/sendTelegramNotification";

const DAY_MS = 24 * 60 * 60 * 1000;

function chatIdFromUser(data: Record<string, unknown>): string {
  return String(data.telegramChatId ?? "").trim();
}

function asUser(data: Record<string, unknown>) {
  return data as Parameters<typeof getTrialEndMs>[0];
}

/**
 * Пуши пользователю в Telegram (telegramChatId): trial и оплаты.
 * Идемпотентность через поля users/{uid}.tgMiniNotif*
 */
export async function runTelegramMiniAppUserNotifications(db: Firestore): Promise<{
  scanned: number;
  sent: number;
  errors: number;
}> {
  const { isFirestoreHeavyScansDisabled } = await import("@/lib/server/statsGlobalCounters");
  if (isFirestoreHeavyScansDisabled()) {
    console.log("TG_MINIAPP_USER_NOTIFICATIONS_SKIPPED_SAFE_MODE");
    return { scanned: 0, sent: 0, errors: 0 };
  }

  let scanned = 0;
  let sent = 0;
  let errors = 0;

  const snap = await db.collection(PRICING_FS.users).get();

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    scanned += 1;

    const chatId = chatIdFromUser(data);
    if (!chatId || data.telegramBlocked === true) continue;

    const user = asUser(data);
    const ref = doc.ref;

    try {
      if (isPaidActive(user)) {
        const lastOk = data.lastPaymentConfirmed as
          | { orderId?: string }
          | undefined;
        const orderId = String(lastOk?.orderId ?? "").trim();
        const prevOk = String(data.tgMiniNotifPaymentOkOrderId ?? "").trim();
        if (orderId && orderId !== prevOk) {
          const paidUntil = data.paidUntil;
          const r = await sendTelegramTextToUser(
            chatId,
            [
              "✅ Оплата прошла успешно.",
              "Подписка активирована — полный доступ открыт.",
              "",
              `Заказ: ${orderId}`,
              "",
              "Откройте HVAC-SaaS в боте, чтобы продолжить работу.",
            ].join("\n")
          );
          if (r.ok) {
            sent += 1;
            await ref.set({ tgMiniNotifPaymentOkOrderId: orderId }, { merge: true });
          } else errors += 1;
        }
        continue;
      }

      const endMs = getTrialEndMs(user);
      const now = Date.now();

      if (isTrialRunning(user) && endMs > now) {
        const left = trialDaysRemaining(user);
        const sent3 = Boolean(data.tgMiniNotifTrialWarn3);
        const sent1 = Boolean(data.tgMiniNotifTrialWarn1);

        if (left === 3 && !sent3) {
          const r = await sendTelegramTextToUser(
            chatId,
            [
              "⏳ HVAC-SaaS: до конца пробного периода 3 дня.",
              "Продлите доступ, чтобы не потерять сметы и прайс.",
            ].join("\n")
          );
          if (r.ok) {
            sent += 1;
            await ref.set({ tgMiniNotifTrialWarn3: true, tgMiniNotifTrialWarn3At: new Date().toISOString() }, { merge: true });
          } else errors += 1;
        }

        if (left === 1 && !sent1) {
          const r = await sendTelegramTextToUser(
            chatId,
            [
              "⚠️ HVAC-SaaS: до конца пробного периода 1 день.",
              "Успейте оформить подписку.",
            ].join("\n")
          );
          if (r.ok) {
            sent += 1;
            await ref.set({ tgMiniNotifTrialWarn1: true, tgMiniNotifTrialWarn1At: new Date().toISOString() }, { merge: true });
          } else errors += 1;
        }
        continue;
      }

      if (isTrialExpired(user) && !data.tgMiniNotifTrialEnded) {
        const r = await sendTelegramTextToUser(
          chatId,
          [
            "📭 Пробный период HVAC-SaaS закончился.",
            "Оформите подписку, чтобы снова пользоваться калькулятором и прайсом.",
          ].join("\n")
        );
        if (r.ok) {
          sent += 1;
          await ref.set(
            { tgMiniNotifTrialEnded: true, tgMiniNotifTrialEndedAt: new Date().toISOString() },
            { merge: true }
          );
        } else errors += 1;
        continue;
      }

      const intent = data.lastPaymentIntent as { orderId?: string } | undefined;
      const webhook = data.lastWebhook as
        | { orderId?: string; status?: string; receivedAt?: string }
        | undefined;
      const intentOid = String(intent?.orderId ?? "").trim();
      const whOid = String(webhook?.orderId ?? "").trim();
      const whStatus = String(webhook?.status ?? "").trim();
      if (
        intentOid &&
        whOid &&
        intentOid === whOid &&
        whStatus &&
        whStatus !== "CONFIRMED"
      ) {
        const failKey = String(data.tgMiniNotifPaymentFailOrderId ?? "").trim();
        if (failKey === intentOid) continue;

        const receivedAt = webhook?.receivedAt ? Date.parse(String(webhook.receivedAt)) : 0;
        if (!Number.isFinite(receivedAt) || now - receivedAt > 72 * DAY_MS) continue;

        const r = await sendTelegramTextToUser(
          chatId,
          [
            "❌ Оплата не прошла (статус банка не подтверждён).",
            `Попробуйте снова в разделе оплаты на сайте или в Mini App.`,
            "",
            `Заказ: ${intentOid}`,
          ].join("\n")
        );
        if (r.ok) {
          sent += 1;
          await ref.set({ tgMiniNotifPaymentFailOrderId: intentOid }, { merge: true });
        } else errors += 1;
      }
    } catch {
      errors += 1;
    }
  }

  return { scanned, sent, errors };
}
