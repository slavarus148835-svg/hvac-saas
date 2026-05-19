import type { Firestore } from "firebase-admin/firestore";
import { MiniAppLaunchDeliveryQueueCache } from "@/lib/server/miniAppLaunchDeliveryQueue";
import {
  classifyDeliveryError,
  isPermanentErrorCode,
  isRetryableErrorCode,
  MAX_MINIAPP_LAUNCH_RETRY_COUNT,
  normalizeRetryCount,
  type MiniAppLaunchDeliveryChannel,
  type MiniAppLaunchErrorCode,
} from "@/lib/server/miniAppLaunchNotifyRetry";
import {
  MINIAPP_LAUNCH_CAMPAIGN_ID,
  NOTIFICATION_CAMPAIGNS_COLLECTION,
} from "@/lib/server/miniAppLaunchNotifyConstants";
import { normalizeEmailForAuth } from "@/lib/server/authDuplicateGuards";
import {
  isGmailVerificationSmtpConfigured,
  sendPlainGmailEmail,
} from "@/lib/server/gmailNodemailer";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { sendTelegramTextToUser } from "@/lib/server/sendTelegramNotification";
import { TELEGRAM_MINI_APP_PUBLIC_URL } from "@/lib/telegramMiniAppLinks";

export { MINIAPP_LAUNCH_CAMPAIGN_ID } from "@/lib/server/miniAppLaunchNotifyConstants";

export type MiniAppLaunchNotifyChannel = "auto" | "telegram" | "email";

export type MiniAppLaunchDeliveryStatus = "pending" | "sent" | "failed" | "skipped";

export type { MiniAppLaunchDeliveryChannel };

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

export async function buildMiniAppLaunchCandidates(
  db: Firestore,
  channelMode: MiniAppLaunchNotifyChannel,
  queueCache: MiniAppLaunchDeliveryQueueCache
): Promise<{ candidates: MiniAppLaunchCandidate[]; skipped: number }> {
  const { isFirestoreHeavyScansDisabled } = await import("@/lib/server/statsGlobalCounters");
  if (isFirestoreHeavyScansDisabled()) {
    console.log("MINIAPP_LAUNCH_NOTIFY_SKIPPED_SAFE_MODE", { channel: channelMode });
    return { candidates: [], skipped: 0 };
  }

  await queueCache.load(db);

  const usersSnap = await db.collection(PRICING_FS.users).get();
  const candidates: MiniAppLaunchCandidate[] = [];
  let skipped = 0;

  for (const doc of usersSnap.docs) {
    const uid = doc.id;
    const data = doc.data() as Record<string, unknown>;
    if (shouldExcludeUser(uid, data)) {
      skipped++;
      continue;
    }
    if (queueCache.isExcluded(uid)) {
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

type WriteDeliveryParams = {
  uid: string;
  email: string | null;
  telegramChatId: string | null;
  channel: MiniAppLaunchDeliveryChannel;
  status: MiniAppLaunchDeliveryStatus;
  error?: string | null;
  lastErrorCode?: MiniAppLaunchErrorCode | null;
  retryCount?: number;
  sentAt?: string | null;
};

async function writeDelivery(
  db: Firestore,
  params: WriteDeliveryParams,
  queueCache: MiniAppLaunchDeliveryQueueCache
): Promise<void> {
  const t = nowIso();
  const ref = deliveryRef(db, params.uid);
  const isNew = !queueCache.hasDeliveryDoc(params.uid);
  const payload: Record<string, unknown> = {
    uid: params.uid,
    email: params.email,
    telegramChatId: params.telegramChatId,
    channel: params.channel,
    status: params.status,
    error: params.error ?? null,
    lastErrorCode: params.lastErrorCode ?? null,
    retryCount: normalizeRetryCount(params.retryCount),
    sentAt: params.sentAt ?? null,
    updatedAt: t,
  };
  if (isNew) payload.createdAt = t;

  await ref.set(payload, { merge: true });
  queueCache.noteDeliveryDoc(params.uid);

  if (params.status === "sent" || params.status === "skipped") {
    queueCache.markExcluded(params.uid);
  } else if (params.status === "failed") {
    const code = params.lastErrorCode ?? "unknown";
    const permanent =
      isPermanentErrorCode(code, params.channel) ||
      normalizeRetryCount(params.retryCount) > MAX_MINIAPP_LAUNCH_RETRY_COUNT;
    if (permanent) {
      queueCache.markExcluded(params.uid);
    } else if (isRetryableErrorCode(code)) {
      queueCache.markRetryable(params.uid, {
        retryCount: normalizeRetryCount(params.retryCount),
        lastErrorCode: params.lastErrorCode ?? null,
        channel: params.channel,
      });
    } else {
      queueCache.markExcluded(params.uid);
    }
  }
}

async function recordFailure(
  db: Firestore,
  candidate: MiniAppLaunchCandidate,
  rawError: string,
  queueCache: MiniAppLaunchDeliveryQueueCache,
  existingRetryCount: number
): Promise<"failed"> {
  const lastErrorCode = classifyDeliveryError(rawError, candidate.channel);
  const retryCount = existingRetryCount + 1;
  const permanent =
    isPermanentErrorCode(lastErrorCode, candidate.channel) ||
    retryCount > MAX_MINIAPP_LAUNCH_RETRY_COUNT;
  const retryable = isRetryableErrorCode(lastErrorCode) && !permanent;

  if (permanent) {
    console.log("MINIAPP_NOTIFY_PERMANENT_FAILURE", {
      uid: candidate.uid,
      channel: candidate.channel,
      lastErrorCode,
      retryCount,
    });
  } else if (retryable) {
    console.log("MINIAPP_NOTIFY_RETRY_ALLOWED", {
      uid: candidate.uid,
      channel: candidate.channel,
      lastErrorCode,
      retryCount,
    });
  } else {
    console.log("MINIAPP_NOTIFY_RETRY_BLOCKED", {
      uid: candidate.uid,
      channel: candidate.channel,
      lastErrorCode,
      retryCount,
      reason: "not_retryable",
    });
  }

  await writeDelivery(
    db,
    {
      ...candidate,
      status: "failed",
      error: rawError,
      lastErrorCode,
      retryCount,
      sentAt: null,
    },
    queueCache
  );

  console.log("MINIAPP_LAUNCH_NOTIFY_FAILED", {
    uid: candidate.uid,
    channel: candidate.channel,
    error: rawError,
    lastErrorCode,
    retryCount,
  });
  return "failed";
}

async function sendToCandidate(
  db: Firestore,
  candidate: MiniAppLaunchCandidate,
  emailConfigured: boolean,
  queueCache: MiniAppLaunchDeliveryQueueCache
): Promise<"sent" | "failed" | "skipped"> {
  const prior = queueCache.getRetryMeta(candidate.uid);
  const existingRetryCount = prior?.retryCount ?? 0;

  if (candidate.channel === "email" && !emailConfigured) {
    await writeDelivery(
      db,
      {
        ...candidate,
        status: "skipped",
        error: "email_sender_not_configured",
        lastErrorCode: "email_sender_not_configured",
        retryCount: existingRetryCount,
        sentAt: null,
      },
      queueCache
    );
    console.log("MINIAPP_LAUNCH_NOTIFY_FAILED", {
      uid: candidate.uid,
      channel: candidate.channel,
      error: "email_sender_not_configured",
    });
    return "skipped";
  }

  try {
    if (candidate.channel === "telegram") {
      const chatId = candidate.telegramChatId;
      if (!chatId) {
        await writeDelivery(
          db,
          {
            ...candidate,
            status: "skipped",
            error: "missing_telegram_chat_id",
            lastErrorCode: "missing_telegram_chat_id",
            retryCount: existingRetryCount,
            sentAt: null,
          },
          queueCache
        );
        return "skipped";
      }
      const r = await sendTelegramTextToUser(chatId, TELEGRAM_MESSAGE);
      if (!r.ok) {
        return recordFailure(
          db,
          candidate,
          r.error || "telegram_send_failed",
          queueCache,
          existingRetryCount
        );
      }
    } else {
      const email = candidate.email;
      if (!email) {
        await writeDelivery(
          db,
          {
            ...candidate,
            status: "skipped",
            error: "missing_email",
            lastErrorCode: "missing_email",
            retryCount: existingRetryCount,
            sentAt: null,
          },
          queueCache
        );
        return "skipped";
      }
      const r = await sendPlainGmailEmail({
        to: email,
        subject: EMAIL_SUBJECT,
        text: EMAIL_BODY,
      });
      if (!r.ok) {
        return recordFailure(
          db,
          candidate,
          r.reason || "email_send_failed",
          queueCache,
          existingRetryCount
        );
      }
    }

    const sentAt = nowIso();
    await writeDelivery(
      db,
      {
        ...candidate,
        status: "sent",
        error: null,
        lastErrorCode: null,
        retryCount: existingRetryCount,
        sentAt,
      },
      queueCache
    );
    console.log("MINIAPP_LAUNCH_NOTIFY_SENT", {
      uid: candidate.uid,
      channel: candidate.channel,
    });
    return "sent";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return recordFailure(db, candidate, msg, queueCache, existingRetryCount);
  }
}

export async function runMiniAppLaunchNotify(
  db: Firestore,
  body: MiniAppLaunchNotifyBody
): Promise<MiniAppLaunchNotifyResult> {
  const { isFirestoreHeavyScansDisabled } = await import("@/lib/server/statsGlobalCounters");
  if (isFirestoreHeavyScansDisabled() && body.dryRun === false) {
    console.log("MINIAPP_LAUNCH_NOTIFY_BLOCKED_SAFE_MODE");
    return {
      campaignId: MINIAPP_LAUNCH_CAMPAIGN_ID,
      dryRun: false,
      totalCandidates: 0,
      telegramCandidates: 0,
      emailCandidates: 0,
      skipped: 0,
      processed: 0,
      sent: 0,
      failed: 0,
      skippedThisRun: 0,
      sampleUsers: [],
    };
  }

  const dryRun = body.dryRun !== false;
  const limit = Math.min(500, Math.max(1, Math.trunc(Number(body.limit) || 50)));
  const channelMode: MiniAppLaunchNotifyChannel = body.channel ?? "auto";
  const queueCache = new MiniAppLaunchDeliveryQueueCache();

  console.log("MINIAPP_LAUNCH_NOTIFY_START", {
    campaignId: MINIAPP_LAUNCH_CAMPAIGN_ID,
    dryRun,
    limit,
    channel: channelMode,
  });

  const { candidates, skipped } = await buildMiniAppLaunchCandidates(db, channelMode, queueCache);
  const telegramCandidates = candidates.filter((c) => c.channel === "telegram").length;
  const emailCandidates = candidates.filter((c) => c.channel === "email").length;
  const sampleUsers = candidates.slice(0, 10).map((c) => ({ ...c }));

  if (candidates.length === 0) {
    console.log("MINIAPP_NOTIFY_QUEUE_EXHAUSTED", {
      campaignId: MINIAPP_LAUNCH_CAMPAIGN_ID,
      channel: channelMode,
      deliveryCacheSize: queueCache.size,
    });
  }

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
    const outcome = await sendToCandidate(db, candidate, emailConfigured, queueCache);
    if (outcome === "sent") sent++;
    else if (outcome === "failed") failed++;
    else skippedThisRun++;
  }

  const remaining = Math.max(0, candidates.length - batch.length);

  console.log("MINIAPP_LAUNCH_NOTIFY_DONE", {
    processed: batch.length,
    sent,
    failed,
    skippedThisRun,
    remaining,
  });

  if (remaining === 0 && candidates.length > 0) {
    console.log("MINIAPP_NOTIFY_QUEUE_EXHAUSTED", {
      campaignId: MINIAPP_LAUNCH_CAMPAIGN_ID,
      channel: channelMode,
      processedThisRun: batch.length,
    });
  }

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
