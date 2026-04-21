import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/server/requireCronSecret";
import {
  telegramGetWebhookInfo,
  telegramSetWebhook,
} from "@/lib/server/telegramBotApiDebug";

export const runtime = "nodejs";

const EXPECTED_WEBHOOK_URL =
  "https://hvac-saas-lovat.vercel.app/api/telegram/webhook";

/** GET: setWebhook + getWebhookInfo + явная диагностика шага 2. */
export async function GET(req: Request) {
  const denied = requireCronSecret(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const url = String(searchParams.get("url") || EXPECTED_WEBHOOK_URL).trim();
  const setWebhookResult = await telegramSetWebhook(url);
  const getWebhookInfoResult = (await telegramGetWebhookInfo()) as {
    url?: string;
    last_error_message?: string;
    last_error_date?: number;
    pending_update_count?: number;
  };

  const currentUrl = String(getWebhookInfoResult.url || "");
  const urlMatches = currentUrl === EXPECTED_WEBHOOK_URL;
  const lastErr = getWebhookInfoResult.last_error_message;

  const problems: string[] = [];
  if (!urlMatches) {
    problems.push("ПРОБЛЕМА: WEBHOOK НЕ УСТАНОВЛЕН ИЛИ НЕПРАВИЛЬНЫЙ URL");
  }
  if (lastErr) {
    problems.push(`last_error_message: ${String(lastErr)}`);
  }

  return NextResponse.json({
    webhookUrl: url,
    expectedUrl: EXPECTED_WEBHOOK_URL,
    setWebhookResult,
    getWebhookInfoResult,
    diagnosis: {
      step: 2,
      urlMatches,
      currentUrl: currentUrl || "(пусто)",
      last_error_message: lastErr ?? null,
      webhook: urlMatches && !lastErr ? "OK" : "ERROR",
      problems: problems.length ? problems : null,
      message: urlMatches
        ? "URL webhook совпадает с ожидаемым."
        : "Вызовите этот endpoint ещё раз после исправления URL или проверьте ответ setWebhookResult.",
    },
  });
}
