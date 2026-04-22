import { NextResponse } from "next/server";
import { telegramGetMe } from "@/lib/server/telegramBotApiDebug";

export const runtime = "nodejs";

/** GET: getMe + явная диагностика шага 1 (токен). */
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

    const telegram = (await telegramGetMe()) as {
      ok?: boolean;
      error_code?: number;
      description?: string;
    };
    console.log("TELEGRAM GETME RESULT", JSON.stringify(telegram));

    const tokenOk = telegram.ok === true;
    if (!tokenOk) {
      return NextResponse.json({
        telegram,
        diagnosis: {
          step: 1,
          token: "ERROR",
          problem: "ПРОБЛЕМА: TELEGRAM_BOT_TOKEN НЕВЕРНЫЙ",
          message:
            "Остановитесь: проверьте TELEGRAM_BOT_TOKEN в Vercel (Project → Settings → Environment Variables), redeploy.",
        },
      });
    }

    return NextResponse.json({
      telegram,
      diagnosis: {
        step: 1,
        token: "OK",
        message:
          "Токен валиден (getMe ok: true). Переходите к шагу 2: /api/debug/set-webhook",
      },
    });
  } catch (e) {
    console.error("[debug/telegram]", e);
    return NextResponse.json(
      {
        error: "internal_error",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
