import { getAdminDb } from "@/lib/firebaseAdmin";
import { sendPlainGmailEmail } from "@/lib/server/gmailNodemailer";
import { leadUpdatedAtMillis } from "@/lib/server/leadsFirestore";
import { sendTelegramTextToUser } from "@/lib/server/sendTelegramNotification";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";

const STALE_MS = 5 * 60 * 1000;
const DEFAULT_APP_BASE = "https://hvac-saas-lovat.vercel.app";

function publicAppLoginUrl(): string {
  const raw = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    DEFAULT_APP_BASE
  )
    .trim()
    .replace(/\/$/, "");
  try {
    return `${new URL(raw).origin}/login`;
  } catch {
    return `${DEFAULT_APP_BASE}/login`;
  }
}

/**
 * Дожим «зависших» лидов: status started дольше 5 минут → одно напоминание (Telegram в личку или email).
 */
export async function runLeadRecovery(): Promise<{
  examined: number;
  nudged: number;
  skipped: number;
}> {
  const db = getAdminDb();
  if (!db) {
    console.error("[runLeadRecovery] no_admin");
    return { examined: 0, nudged: 0, skipped: 0 };
  }

  const snap = await db.collection(PRICING_FS.leads).where("status", "==", "started").get();
  const now = Date.now();
  const loginUrl = publicAppLoginUrl();
  let nudged = 0;
  let ignored = 0;

  for (const doc of snap.docs) {
    const d = doc.data() as Record<string, unknown>;
    const updatedMs = leadUpdatedAtMillis(d);
    if (!updatedMs || now - updatedMs < STALE_MS) {
      ignored++;
      continue;
    }
    if (d.recoveryNudgeSentAt) {
      ignored++;
      continue;
    }

    const telegramId = typeof d.telegramId === "string" ? d.telegramId.trim() : "";
    const email = typeof d.email === "string" ? d.email.trim() : "";

    const nudgeIso = new Date().toISOString();

    if (telegramId) {
      const text = `Вы не завершили регистрацию. Вернуться: ${loginUrl}`;
      const r = await sendTelegramTextToUser(telegramId, text);
      if (!r.ok) {
        console.warn("[runLeadRecovery] telegram nudge failed", doc.id, r.error);
      }
      await doc.ref.set({ recoveryNudgeSentAt: nudgeIso, updatedAt: nudgeIso }, { merge: true });
      nudged++;
      continue;
    }

    if (email) {
      const r = await sendPlainGmailEmail({
        to: email,
        subject: "Напоминание: вход в калькулятор",
        text: `Вы не завершили вход\n${loginUrl}`,
      });
      if (!r.ok) {
        console.warn("[runLeadRecovery] email nudge skipped/failed", doc.id, r.reason);
      }
      await doc.ref.set({ recoveryNudgeSentAt: nudgeIso, updatedAt: nudgeIso }, { merge: true });
      nudged++;
      continue;
    }

    ignored++;
  }

  return { examined: snap.size, nudged, skipped: ignored };
}
