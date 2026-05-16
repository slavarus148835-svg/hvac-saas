import { NextResponse } from "next/server";
import { assertInternalDebugSecret } from "@/lib/server/assertInternalDebugSecret";
import {
  adminNotificationEnvPresent,
  resolveAdminNotificationChatIdSource,
} from "@/lib/server/notifyAdminNewUser";
import { escapeTelegramHtml, sendTelegramNotification } from "@/lib/server/sendTelegramNotification";

export const runtime = "nodejs";

/**
 * GET /api/debug/admin-notification-check?secret=...
 * Проверка env и тестовая отправка в админ-чат.
 */
export async function GET(req: Request) {
  const denied = assertInternalDebugSecret(req);
  if (denied) return denied;

  const env = adminNotificationEnvPresent();
  const chatIdSource = resolveAdminNotificationChatIdSource();
  if (!env.botTokenPresent || !env.chatIdPresent) {
    return NextResponse.json({
      botTokenPresent: env.botTokenPresent,
      chatIdPresent: env.chatIdPresent,
      chatIdSource,
      sendOk: false,
      errorMessage: "missing_env",
    });
  }

  const result = await sendTelegramNotification(
    `<b>${escapeTelegramHtml("✅ Тест уведомлений HVAC-SaaS")}</b>\n\n<i>admin-notification-check</i>`
  );

  return NextResponse.json({
    botTokenPresent: env.botTokenPresent,
    chatIdPresent: env.chatIdPresent,
    chatIdSource,
    sendOk: result.ok,
    errorMessage: result.ok
      ? null
      : result.error || result.telegramDescription || result.reason || "send_failed",
    httpStatus: result.httpStatus ?? null,
  });
}
