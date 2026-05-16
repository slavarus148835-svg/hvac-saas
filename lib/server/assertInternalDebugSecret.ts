import { NextResponse } from "next/server";

/**
 * Внутренняя диагностика: INTERNAL_DEBUG_SECRET через
 * x-internal-debug-secret, x-debug-secret, ?secret=, Authorization: Bearer.
 */
export function readInternalDebugSecret(req: Request): string {
  const url = new URL(req.url);
  return (
    String(req.headers.get("x-internal-debug-secret") || "").trim() ||
    String(req.headers.get("x-debug-secret") || "").trim() ||
    String(url.searchParams.get("secret") || "").trim() ||
    String(req.headers.get("authorization") || "")
      .replace(/^Bearer\s+/i, "")
      .trim()
  );
}

export function assertInternalDebugSecret(req: Request): NextResponse | null {
  const expected = String(process.env.INTERNAL_DEBUG_SECRET || "").trim();
  if (!expected) {
    return NextResponse.json({ error: "debug_disabled" }, { status: 503 });
  }
  const provided = readInternalDebugSecret(req);
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
