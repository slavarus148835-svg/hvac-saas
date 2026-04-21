import { NextResponse } from "next/server";

export function requireCronSecret(req: Request): NextResponse | null {
  const expected = String(process.env.CRON_SECRET ?? "").trim();
  if (!expected) {
    console.error("[cron] CRON_SECRET not set");
    return NextResponse.json({ error: "cron_secret_not_configured" }, { status: 503 });
  }
  const auth = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
