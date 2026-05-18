import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { handleTelegramStatCommand } from "@/lib/server/telegram/handleStatCommand";
import { telegramGetWebhookInfo } from "@/lib/server/telegramBotApiDebug";
import { isTelegramAdmin, parseAdminTelegramIds } from "@/lib/server/telegram/telegramAdminAuth";
import { sendTelegramMessage } from "@/lib/server/sendTelegramMessage";

export const runtime = "nodejs";

function authorize(req: Request): boolean {
  const expected = String(process.env.CRON_SECRET || process.env.INTERNAL_DEBUG_SECRET || "").trim();
  if (!expected) return false;
  const url = new URL(req.url);
  const q = url.searchParams.get("secret");
  const h = req.headers.get("authorization");
  return q === expected || h === `Bearer ${expected}` || h === expected;
}

/** GET — диагностика webhook + опциональный dry-run stat handler */
export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const chatId = String(url.searchParams.get("chatId") || process.env.ADMIN_TELEGRAM_CHAT_ID || "").trim();
  const runStat = url.searchParams.get("runStat") === "1";

  const webhookInfo = await telegramGetWebhookInfo();
  const db = getAdminDb();

  const result: Record<string, unknown> = {
    ok: true,
    deployedMarkers: {
      webhookHitLog: true,
      statFastPath: true,
      miniAppBootstrapV2: true,
    },
    vercel: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      env: process.env.VERCEL_ENV ?? null,
    },
    telegram: {
      botTokenConfigured: !!String(process.env.TELEGRAM_BOT_TOKEN || "").trim(),
      adminIds: parseAdminTelegramIds(),
      webhookInfo,
    },
    firestore: { adminDb: Boolean(db) },
  };

  if (runStat && chatId && db) {
    const allowed = isTelegramAdmin({ chatId });
    result.statDryRun = { chatId, allowed };
    if (allowed) {
      await handleTelegramStatCommand({ chatId });
      result.statDryRun = { ...(result.statDryRun as object), invoked: true };
    }
  } else if (chatId && url.searchParams.get("ping") === "1") {
    const ping = await sendTelegramMessage(chatId, "DEBUG: telegram-webhook-test ping OK");
    result.ping = ping;
  }

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
