import { NextResponse } from "next/server";
import { runLeadRecovery } from "@/lib/server/runLeadRecovery";

export const runtime = "nodejs";

/**
 * Периодический дожим лидов (Vercel Cron или ручной вызов с секретом).
 * Заголовок: Authorization: Bearer <LEAD_RECOVERY_CRON_SECRET или CRON_SECRET>
 */
export async function GET(req: Request) {
  const expected =
    String(process.env.LEAD_RECOVERY_CRON_SECRET ?? process.env.CRON_SECRET ?? "").trim();
  if (!expected) {
    console.error("[cron/lead-recovery] LEAD_RECOVERY_CRON_SECRET or CRON_SECRET not set");
    return NextResponse.json({ error: "cron_secret_not_configured" }, { status: 503 });
  }

  const auth = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runLeadRecovery();
  return NextResponse.json({ ok: true, ...result });
}
