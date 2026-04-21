import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/server/requireCronSecret";
import { telegramGetMe } from "@/lib/server/telegramBotApiDebug";

export const runtime = "nodejs";

/** GET: getMe + явная диагностика шага 1 (токен). */
export async function GET(req: Request) {
  const denied = requireCronSecret(req);
  if (denied) return denied;

  const telegram = (await telegramGetMe()) as { ok?: boolean; error_code?: number; description?: string };
  console.log("TELEGRAM GETME RESULT", JSON.stringify(telegram));

  const tokenOk = telegram.ok === true;
  if (!tokenOk) {
    return NextResponse.json({
      telegram,
      diagnosis: {
        step: 1,
        token: "ERROR",
        problem: "ПРОБЛЕМА: TELEGRAM_BOT_TOKEN НЕВЕРНЫЙ",
        message: "Остановитесь: проверьте TELEGRAM_BOT_TOKEN в Vercel (Project → Settings → Environment Variables), redeploy.",
      },
    });
  }

  return NextResponse.json({
    telegram,
    diagnosis: {
      step: 1,
      token: "OK",
      message: "Токен валиден (getMe ok: true). Переходите к шагу 2: /api/debug/set-webhook",
    },
  });
}
