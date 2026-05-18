import { buildTelegramUltraLightStatsReport } from "@/lib/server/statsGlobalCounters";
import { isFirestoreCapacityError } from "@/lib/server/statsUsersSnapshot";
import {
  sendTelegramMessage,
  sendTelegramMessageChunks,
} from "@/lib/server/sendTelegramMessage";

const STAT_BUILD_TIMEOUT_MS = 28_000;

const STAT_ERROR_USER_TEXT =
  "❌ Ошибка получения статистики.\nПодробности записаны в server logs.";

export type HandleStatCommandParams = {
  chatId: string;
  telegramUserId?: number;
};

function logStat(event: string, payload: Record<string, unknown>): void {
  console.log(event, payload);
}

export async function handleTelegramStatCommand(
  params: HandleStatCommandParams
): Promise<void> {
  const startedAt = Date.now();
  const chatId = String(params.chatId);
  const telegramUserId = params.telegramUserId ?? null;

  logStat("STAT_COMMAND_RECEIVED", { chatId, telegramUserId });
  logStat("STAT_COMMAND_AUTHORIZED", { chatId, telegramUserId });

  const ack = await sendTelegramMessage(chatId, "⏳ Собираю статистику…");
  if (!ack.ok) {
    logStat("STAT_COMMAND_ERROR", {
      chatId,
      stage: "ack_send",
      error: ack.error,
    });
  }

  try {
    logStat("STAT_COMMAND_BUILD_STARTED", { chatId });
    const funnelStartedAt = Date.now();

    const built = await Promise.race([
      buildTelegramUltraLightStatsReport(Date.now()),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("STAT_BUILD_TIMEOUT")), STAT_BUILD_TIMEOUT_MS);
      }),
    ]);

    logStat("STAT_COMMAND_FUNNEL_DONE", {
      chatId,
      funnelDurationMs: Date.now() - funnelStartedAt,
      reportLength: built.text.length,
      firestoreReads: built.meta.reads,
      readDurationMs: built.meta.durationMs,
      globalFound: built.meta.globalFound,
    });

    const chunks = await sendTelegramMessageChunks(chatId, built.text);
    const allOk = chunks.every((c) => c.ok);

    if (!allOk) {
      const firstErr = chunks.find((c) => !c.ok)?.error;
      logStat("STAT_COMMAND_ERROR", {
        chatId,
        stage: "response_send",
        error: firstErr,
        chunks: chunks.length,
      });
      await sendTelegramMessage(chatId, STAT_ERROR_USER_TEXT);
      return;
    }

    logStat("STAT_COMMAND_RESPONSE_SENT", {
      chatId,
      telegramUserId,
      executionMs: Date.now() - startedAt,
      chunks: chunks.length,
    });
  } catch (e) {
    const stack = e instanceof Error ? e.stack : undefined;
    const firestoreCapacity = isFirestoreCapacityError(e);
    logStat("STAT_COMMAND_ERROR", {
      chatId,
      telegramUserId,
      executionMs: Date.now() - startedAt,
      firestoreCapacity,
      message: e instanceof Error ? e.message : String(e),
      stack,
    });
    await sendTelegramMessage(chatId, STAT_ERROR_USER_TEXT);
  }
}
