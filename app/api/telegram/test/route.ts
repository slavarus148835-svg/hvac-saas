import { NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/telegram";

/**
 * Ручная проверка бота: POST JSON { "secret": "<TELEGRAM_TEST_SECRET>" }
 * TELEGRAM_TEST_SECRET — только server env на Vercel.
 */
export async function POST(req: Request) {
  const expected = String(process.env.TELEGRAM_TEST_SECRET || "").trim();
  if (!expected) {
    console.error("[api/telegram/test] TELEGRAM_TEST_SECRET not set");
    return NextResponse.json({ error: "TELEGRAM_TEST_SECRET not configured" }, { status: 503 });
  }
  const body = (await req.json().catch(() => ({}))) as { secret?: string };
  if (String(body?.secret || "") !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const result = await sendTelegramMessage(
    `TEST HVAC SaaS\nВремя: ${new Date().toISOString()}\nЕсли видите это — sendMessage работает.`
  );
  if (!result.ok) {
    console.error("[api/telegram/test] send failed", result);
  }
  return NextResponse.json(result);
}
