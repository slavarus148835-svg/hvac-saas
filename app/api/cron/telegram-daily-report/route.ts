import { NextResponse } from "next/server";
import { buildTelegramUltraLightStatsReport } from "@/lib/server/statsGlobalCounters";
import { requireCronSecret } from "@/lib/server/requireCronSecret";
import { sendTelegramMessage } from "@/lib/server/sendTelegramMessage";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = requireCronSecret(req);
  if (denied) return denied;

  const adminChat = String(process.env.ADMIN_TELEGRAM_CHAT_ID ?? "").trim();
  if (!adminChat) {
    return NextResponse.json({ error: "admin_telegram_chat_id_missing" }, { status: 503 });
  }

  const built = await buildTelegramUltraLightStatsReport(Date.now());
  const text = built.text;
  const send = await sendTelegramMessage(adminChat, text);
  if (!send.ok) {
    console.error("[cron/telegram-daily-report] send failed", send.error);
    return NextResponse.json({ ok: false, error: send.error }, { status: 502 });
  }
  console.log("DAILY REPORT SENT");
  return NextResponse.json({ ok: true, period: "yesterday" });
}
