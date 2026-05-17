import type { Firestore } from "firebase-admin/firestore";
import { normalizeEmailForAuth } from "@/lib/server/authDuplicateGuards";
import {
  isGmailVerificationSmtpConfigured,
  sendPlainGmailEmail,
} from "@/lib/server/gmailNodemailer";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { sendTelegramTextToUser } from "@/lib/server/sendTelegramNotification";
import { TELEGRAM_MINI_APP_PUBLIC_URL } from "@/lib/telegramMiniAppLinks";

export const MINIAPP_LAUNCH_CAMPAIGN_ID = "telegram_mini_app_launch_2026_05";

const NOTIFICATION_CAMPAIGNS_COLLECTION = "notificationCampaigns";

export type MiniAppLaunchNotifyChannel = "auto" | "telegram" | "email";

export type MiniAppLaunchDeliveryStatus = "pending" | "sent" | "failed" | "skipped";

export type MiniAppLaunchDeliveryChannel = "telegram" | "email";

export type MiniAppLaunchNotifyBody = {
  dryRun?: boolean;
  limit?: number;
  channel?: MiniAppLaunchNotifyChannel;
};

export type MiniAppLaunchCandidate = {
  uid: string;
  email: string | null;
  telegramChatId: string | null;
  channel: MiniAppLaunchDeliveryChannel;
};

export type MiniAppLaunchNotifyResult = {
  campaignId: string;
  dryRun: boolean;
  totalCandidates: number;
  telegramCandidates: number;
  emailCandidates: number;
  skipped: number;
  processed: number;
  sent: number;
  failed: number;
  skippedThisRun: number;
  sampleUsers: Array<{
    uid: string;
    email: string | null;
    telegramChatId: string | null;
    channel: MiniAppLaunchDeliveryChannel;
  }>;
};

const TELEGRAM_MESSAGE = `🚀 Вышло Telegram Mini App для HVAC-SaaS

Теперь калькулятор монтажника работает прямо внутри Telegram — без лишних переходов и долгой загрузки.

Что можно делать:

⚡ считать монтаж кондиционера примерно за 1 минуту
📋 формировать понятную смету для клиента
📚 сохранять историю расчётов
🧮 учитывать трассу, штробу, доп. работы и расходники
📲 отправлять расчёт клиенту в WhatsApp или Telegram
💰 не забывать мелочи, на которых обычно теряются деньги

Особенно удобно на замере: открыл Telegram → посчитал → отправил клиенту.

🎁 Попробовать можно бесплатно.

Открыть Mini App:
${TELEGRAM_MINI_APP_PUBLIC_URL}`;

const EMAIL_SUBJECT = "Вышло Telegram Mini App для HVAC-SaaS";

const EMAIL_BODY = `Привет!

Мы запустили Telegram Mini App для HVAC-SaaS.

Теперь калькулятор монтажника работает прямо внутри Telegram: можно быстро рассчитать монтаж кондиционера, сформировать понятную смету для клиента, сохранить расчёт в истории и сразу отправить его клиенту.

Это удобно на замере, когда нужно быстро посчитать работу и выглядеть профессионально перед клиентом.

Что внутри:

— расчёт монтажа примерно за 1 минуту
— учёт трассы, штробы, доп. работ и расходников
— история расчётов
— отправка текста клиенту в WhatsApp или Telegram
— работа прямо из Telegram

Попробовать Mini App можно бесплатно:

${TELEGRAM_MINI_APP_PUBLIC_URL}

С уважением,
HVAC-SaaS`;

function nowIso(): string {
  return new Date().toISOString();
}

function digitsOnly(s: string): string {
  return String(s ?? "").replace(/\D/g, "");
}

function deliveryRef(db: Firestore, uid: string) {
  return db
    .collection(NOTIFICATION_CAMPAIGNS_COLLECTION)
    .doc(MINIAPP_LAUNCH_CAMPAIGN_ID)
    .collection("deliveries")
    .doc(uid);
}

function resolveTelegramChatId(data: Record<string, unknown>): string | null {
  const chat = digitsOnly(String(data.telegramChatId ?? ""));
  if (chat) return chat;
  const tgUser = digitsOnly(String(data.telegramUserId ?? ""));
  if (tgUser) return tgUser;
  const tgLegacy = digitsOnly(String(data.telegramId ?? ""));
  return tgLegacy || null;
}

function resolveEmail(data: Record<string, unknown>): string | null {
  const norm = normalizeEmailForAuth(String(data.normalizedEmail ?? data.email ?? ""));
  return norm && norm.includes("@") ? norm : null;
}

function shouldExcludeUser(uid: string, data: Record<string, unknown>): boolean {
  if (data.isMergedDuplicate === true) return true;
  if (uid.startsWith("tg_") && data.isMergedDuplicate === true) return true;
  return false;
}

function pickChannel(
  data: Record<string, unknown>,
  mode: MiniAppLaunchNotifyChannel
): MiniAppLaunchDeliveryChannel | null {
  const chatId = resolveTelegramChatId(data);
  const email = resolveEmail(data);
  if (mode === "telegram") return chatId ? "telegram" : null;
  if (mode === "email") return email ? "email" : null;
  if (chatId) return "telegram";
  if (email) return "email";
  return null;
}

async function loadFinishedDeliveryUids(db: Firestore): Promise<Set<string>> {
  const snap = await db
    .collection(NOTIFICATION_CAMPAIGNS_COLLECTION)
    .doc(MINIAPP_LAUNCH_CAMPAIGN_ID)
    .collection("deliveries")
    .get();
  const done = new Set<string>();
  for (const doc of snap.docs) {
    const st = String((doc.data() as { status?: string }).status ?? "");
    if (st === "sent" || st === "skipped") done.add(doc.id);
  }
  return done;
}

export async function buildMiniAppLaunchCandidates(
  db: Firestore,
  channelMode: MiniAppLaunchNotifyChannel
): Promise<{ candidates: MiniAppLaunchCandidate[]; skipped: number }> {
  const usersSnap = await db.collection(PRICING_FS.users).get();
  const finished = await loadFinishedDeliveryUids(db);
  const candidates: MiniAppLaunchCandidate[] = [];
  let skipped = 0;

  for (const doc of usersSnap.docs) {
    const uid = doc.id;
    const data = doc.data() as Record<string, unknown>;
    if (shouldExcludeUser(uid, data)) {
      skipped++;
      continue;
    }
    if (finished.has(uid)) {
      skipped++;
      continue;
    }

    const channel = pickChannel(data, channelMode);
    const email = resolveEmail(data);
    const telegramChatId = resolveTelegramChatId(data);
    if (!channel) {
      skipped++;
      continue;
    }

    candidates.push({ uid, email, telegramChatId, channel });
  }

  return { candidates, skipped };
}

async function writeDelivery(
  db: Firestore,
  params: {
    uid: string;
    email: string | null;
    telegramChatId: string | null;
    channel: MiniAppLaunchDeliveryChannel;
    status: MiniAppLaunchDeliveryStatus;
    error?: string | null;
    sentAt?: string | null;
  }
): Promise<void> {
  const t = nowIso();
  const ref = deliveryRef(db, params.uid);
  const existing = await ref.get();
  const createdAt =
    existing.exists && typeof existing.data()?.createdAt === "string"
      ? String(existing.data()?.createdAt)
      : t;
  await ref.set(
    {
      uid: params.uid,
      email: params.email,
      telegramChatId: params.telegramChatId,
      channel: params.channel,
      status: params.status,
      error: params.error ?? null,
      sentAt: params.sentAt ?? null,
      createdAt,
      updatedAt: t,
    },
    { merge: true }
  );
}

async function sendToCandidate(
  db: Firestore,
  candidate: MiniAppLaunchCandidate,
  emailConfigured: boolean
): Promise<"sent" | "failed" | "skipped"> {
  if (candidate.channel === "email" && !emailConfigured) {
    await writeDelivery(db, {
      ...candidate,
      status: "skipped",
      error: "email_sender_not_configured",
      sentAt: null,
    });
    console.log("MINIAPP_LAUNCH_NOTIFY_FAILED", {
      uid: candidate.uid,
      channel: candidate.channel,
      error: "email_sender_not_configured",
    });
    return "skipped";
  }

  await writeDelivery(db, { ...candidate, status: "pending", error: null, sentAt: null });

  try {
    if (candidate.channel === "telegram") {
      const chatId = candidate.telegramChatId;
      if (!chatId) {
        await writeDelivery(db, {
          ...candidate,
          status: "skipped",
          error: "missing_telegram_chat_id",
          sentAt: null,
        });
        return "skipped";
      }
      const r = await sendTelegramTextToUser(chatId, TELEGRAM_MESSAGE);
      if (!r.ok) {
        await writeDelivery(db, {
          ...candidate,
          status: "failed",
          error: r.error || "telegram_send_failed",
          sentAt: null,
        });
        console.log("MINIAPP_LAUNCH_NOTIFY_FAILED", {
          uid: candidate.uid,
          channel: "telegram",
          error: r.error,
        });
        return "failed";
      }
    } else {
      const email = candidate.email;
      if (!email) {
        await writeDelivery(db, {
          ...candidate,
          status: "skipped",
          error: "missing_email",
          sentAt: null,
        });
        return "skipped";
      }
      const r = await sendPlainGmailEmail({
        to: email,
        subject: EMAIL_SUBJECT,
        text: EMAIL_BODY,
      });
      if (!r.ok) {
        await writeDelivery(db, {
          ...candidate,
          status: "failed",
          error: r.reason || "email_send_failed",
          sentAt: null,
        });
        console.log("MINIAPP_LAUNCH_NOTIFY_FAILED", {
          uid: candidate.uid,
          channel: "email",
          error: r.reason,
        });
        return "failed";
      }
    }

    const sentAt = nowIso();
    await writeDelivery(db, {
      ...candidate,
      status: "sent",
      error: null,
      sentAt,
    });
    console.log("MINIAPP_LAUNCH_NOTIFY_SENT", {
      uid: candidate.uid,
      channel: candidate.channel,
    });
    return "sent";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await writeDelivery(db, {
      ...candidate,
      status: "failed",
      error: msg,
      sentAt: null,
    });
    console.log("MINIAPP_LAUNCH_NOTIFY_FAILED", {
      uid: candidate.uid,
      channel: candidate.channel,
      error: msg,
    });
    return "failed";
  }
}

export async function runMiniAppLaunchNotify(
  db: Firestore,
  body: MiniAppLaunchNotifyBody
): Promise<MiniAppLaunchNotifyResult> {
  const dryRun = body.dryRun !== false;
  const limit = Math.min(500, Math.max(1, Math.trunc(Number(body.limit) || 50)));
  const channelMode: MiniAppLaunchNotifyChannel = body.channel ?? "auto";

  console.log("MINIAPP_LAUNCH_NOTIFY_START", {
    campaignId: MINIAPP_LAUNCH_CAMPAIGN_ID,
    dryRun,
    limit,
    channel: channelMode,
  });

  const { candidates, skipped } = await buildMiniAppLaunchCandidates(db, channelMode);
  const telegramCandidates = candidates.filter((c) => c.channel === "telegram").length;
  const emailCandidates = candidates.filter((c) => c.channel === "email").length;
  const sampleUsers = candidates.slice(0, 10).map((c) => ({ ...c }));

  if (dryRun) {
    console.log("MINIAPP_LAUNCH_NOTIFY_DRY_RUN", {
      totalCandidates: candidates.length,
      telegramCandidates,
      emailCandidates,
      skipped,
    });
    return {
      campaignId: MINIAPP_LAUNCH_CAMPAIGN_ID,
      dryRun: true,
      totalCandidates: candidates.length,
      telegramCandidates,
      emailCandidates,
      skipped,
      processed: 0,
      sent: 0,
      failed: 0,
      skippedThisRun: 0,
      sampleUsers,
    };
  }

  const emailConfigured = isGmailVerificationSmtpConfigured();
  const batch = candidates.slice(0, limit);
  let sent = 0;
  let failed = 0;
  let skippedThisRun = 0;

  for (const candidate of batch) {
    const outcome = await sendToCandidate(db, candidate, emailConfigured);
    if (outcome === "sent") sent++;
    else if (outcome === "failed") failed++;
    else skippedThisRun++;
  }

  console.log("MINIAPP_LAUNCH_NOTIFY_DONE", {
    processed: batch.length,
    sent,
    failed,
    skippedThisRun,
    remaining: Math.max(0, candidates.length - batch.length),
  });

  return {
    campaignId: MINIAPP_LAUNCH_CAMPAIGN_ID,
    dryRun: false,
    totalCandidates: candidates.length,
    telegramCandidates,
    emailCandidates,
    skipped,
    processed: batch.length,
    sent,
    failed,
    skippedThisRun,
    sampleUsers,
  };
}
