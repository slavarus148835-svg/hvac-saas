import { getAuth } from "firebase-admin/auth";
import { getAdminApp } from "@/lib/firebaseAdmin";

export type BearerAuthOk = { uid: string; email: string; emailVerified: boolean };
export type BearerAuthFail = { error: "no_admin" | "no_token" | "invalid_token" };

export async function requireBearerUid(
  req: Request
): Promise<{ ok: true; data: BearerAuthOk } | { ok: false; status: number; data: BearerAuthFail }> {
  const app = getAdminApp();
  if (!app) {
    return { ok: false, status: 503, data: { error: "no_admin" } };
  }

  const raw = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!raw) {
    return { ok: false, status: 401, data: { error: "no_token" } };
  }

  try {
    const decoded = await getAuth(app).verifyIdToken(raw);
    const email = String(decoded.email || "").trim();
    const emailVerified = decoded.email_verified === true;
    return { ok: true, data: { uid: decoded.uid, email, emailVerified } };
  } catch (e) {
    console.error("[requireBearerUid] verifyIdToken failed", e);
    return { ok: false, status: 401, data: { error: "invalid_token" } };
  }
}
