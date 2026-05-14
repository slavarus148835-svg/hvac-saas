import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Диагностика production: какой commit реально задеплоен на Vercel.
 * Без секретов. После деплоя открыть GET /api/debug/version
 */
export async function GET() {
  const body = {
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    env: process.env.VERCEL_ENV ?? null,
    time: new Date().toISOString(),
  };
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}
