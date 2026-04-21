import { getAdminDb } from "@/lib/firebaseAdmin";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import {
  firestoreTimeToMs,
  getTrialEndMsFromRecord,
} from "@/lib/server/firestoreTimeMs";
import { sendTelegramMessage } from "@/lib/server/sendTelegramMessage";

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function publicPricingUrl(): string {
  const raw = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://hvac-saas-lovat.vercel.app"
  )
    .trim()
    .replace(/\/$/, "");
  try {
    return `${new URL(raw).origin}/pricing`;
  } catch {
    return "https://hvac-saas-lovat.vercel.app/pricing";
  }
}

/**
 * Конец пробного/бесплатного доступа: приоритет у paidUntil (если > 0),
 * иначе расчётный конец триала (trialEndsAt / started+days / created+days).
 */
function accessEndedAtMs(data: Record<string, unknown>): number {
  const pu = firestoreTimeToMs(data.paidUntil);
  if (pu > 0) return pu;
  return getTrialEndMsFromRecord(data);
}

function hasActivePaidAccess(data: Record<string, unknown>): boolean {
  const plan = String(data.plan || "");
  const pu = firestoreTimeToMs(data.paidUntil);
  if (plan !== "standard" && plan !== "pro") return false;
  return pu > Date.now();
}

function buildTrialRecoveryText(): string {
  const url = publicPricingUrl();
  return [
    "💰 Пробный период закончился",
    "",
    "Ты уже пользовался калькулятором и видел как он упрощает работу",
    "",
    "Сейчас доступ отключён",
    "",
    "👇 верни доступ:",
    "Открыть и оплатить:",
    url,
  ].join("\n");
}

export type TrialRecoveryResult = {
  examined: number;
  sent: number;
  skipped: number;
};

/**
 * Дожим после окончания триала: 5–30 суток после конца доступа, не оплатил,
 * есть telegramId, ещё не слали (trialRecoverySentAt).
 */
export async function runTrialRecovery(): Promise<TrialRecoveryResult> {
  const db = getAdminDb();
  if (!db) {
    return { examined: 0, sent: 0, skipped: 0 };
  }
  const now = Date.now();
  const snap = await db.collection(PRICING_FS.users).get();
  let examined = 0;
  let sent = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    examined++;
    const d = doc.data() as Record<string, unknown>;
    if (d.hasPaid === true || hasActivePaidAccess(d)) {
      skipped++;
      continue;
    }
    if (d.trialRecoverySentAt != null) {
      skipped++;
      continue;
    }
    const tg = String(d.telegramId ?? "").replace(/\D/g, "");
    if (!tg) {
      skipped++;
      continue;
    }

    const endMs = accessEndedAtMs(d);
    if (endMs <= 0 || endMs >= now) {
      skipped++;
      continue;
    }

    const elapsed = now - endMs;
    if (elapsed <= FIVE_DAYS_MS) {
      skipped++;
      continue;
    }
    if (elapsed > THIRTY_DAYS_MS) {
      skipped++;
      continue;
    }

    const text = buildTrialRecoveryText();
    const r = await sendTelegramMessage(tg, text);
    if (!r.ok) {
      console.error("[trial-recovery] send failed", doc.id, r.error);
      skipped++;
      continue;
    }

    await doc.ref.set(
      {
        trialRecoverySentAt: Date.now(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    console.log("TRIAL RECOVERY SENT", doc.id);
    sent++;
  }

  return { examined, sent, skipped };
}
