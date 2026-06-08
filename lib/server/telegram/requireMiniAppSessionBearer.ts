import type { Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyTelegramMiniAppSession } from "@/lib/server/telegram/telegramMiniAppSession";

export function readMiniAppBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h || typeof h !== "string") return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m?.[1]?.trim() || null;
}

export async function requireMiniAppSessionBearer(
  req: Request,
  db: Firestore | null = getAdminDb()
): Promise<
  | { ok: true; uid: string; telegramUserId: string; db: Firestore }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  if (!db) {
    return { ok: false, status: 503, body: { ok: false, error: "server_misconfigured" } };
  }
  const token = readMiniAppBearerToken(req);
  if (!token) {
    return { ok: false, status: 401, body: { ok: false, error: "Unauthorized" } };
  }
  const v = await verifyTelegramMiniAppSession(db, token);
  if (!v.ok) {
    return { ok: false, status: 401, body: { ok: false, error: "Unauthorized" } };
  }
  return { ok: true, uid: v.uid, telegramUserId: v.telegramUserId, db };
}
