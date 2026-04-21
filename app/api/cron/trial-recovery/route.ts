import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/server/requireCronSecret";
import { runTrialRecovery } from "@/lib/server/runTrialRecovery";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = requireCronSecret(req);
  if (denied) return denied;

  const result = await runTrialRecovery();
  return NextResponse.json({ ok: true, ...result });
}
