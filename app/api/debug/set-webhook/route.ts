import { NextResponse } from "next/server";
import {
  telegramGetWebhookInfo,
  telegramSetWebhook,
} from "@/lib/server/telegramBotApiDebug";

export const runtime = "nodejs";

const EXPECTED_WEBHOOK_URL =
  "https://hvac-saas-lovat.vercel.app/api/telegram/webhook";

/** GET: setWebhook + getWebhookInfo + явная диагностика шага 2. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const querySecret = url.searchParams.get("secret");
    const authHeader = req.headers.get("authorization");
    const expected = process.env.CRON_SECRET;

    if (
      !expected ||
      (querySecret !== expected && authHeader !== `Bearer ${expected}`)
    ) {
      return NextResponse.json(
        {
          error: "unauthorized",
          hasQuerySecret: !!querySecret,
          hasHeader: !!authHeader,
          hasExpectedSecret: !!expected,
        },
        { status: 401 }
      );
    }

    const webhookTarget = String(url.searchParams.get("url") || EXPECTED_WEBHOOK_URL).trim();
    const setWebhookResult = await telegramSetWebhook(webhookTarget);
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
      webhookUrl: webhookTarget,
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
  } catch (e) {
    console.error("[debug/set-webhook]", e);
    return NextResponse.json(
      {
        error: "internal_error",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
