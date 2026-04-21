import { NextResponse } from "next/server";
import { buildTelegramStatsReportText } from "@/lib/server/buildTelegramStatsReportText";
import { getReport } from "@/lib/server/getStatsReport";
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

  const report = await getReport("week");
  const text = buildTelegramStatsReportText("week", report);
  const send = await sendTelegramMessage(adminChat, text);
  if (!send.ok) {
    console.error("[cron/telegram-weekly-report] send failed", send.error);
    return NextResponse.json({ ok: false, error: send.error }, { status: 502 });
  }
  console.log("WEEKLY REPORT SENT");
  return NextResponse.json({ ok: true, period: "week", ...report });
}
