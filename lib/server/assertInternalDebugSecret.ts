import { NextResponse } from "next/server";

/**
 * Внутренняя диагностика: секрет из env, заголовок x-internal-debug-secret
 * или Authorization: Bearer <secret>.
 */
export function assertInternalDebugSecret(req: Request): NextResponse | null {
  const expected = String(process.env.INTERNAL_DEBUG_SECRET || "").trim();
  if (!expected) {
    return NextResponse.json({ error: "debug_disabled" }, { status: 503 });
  }
  const header = String(req.headers.get("x-internal-debug-secret") || "").trim();
  const bearer = String(req.headers.get("authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  const provided = header || bearer;
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
