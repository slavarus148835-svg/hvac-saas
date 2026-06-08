import type { App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { isEmailVerificationSatisfied } from "@/lib/emailVerificationSatisfied";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";

/**
 * Если в Firestore нет подтверждения кода, но Firebase Auth уже emailVerified —
 * синхронизируем (legacy web-аккаунты до flow с кодом).
 */
export async function ensureUserEmailVerificationFromAuth(
  app: App,
  db: Firestore,
  uid: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (isEmailVerificationSatisfied(data)) return data;

  try {
    const authUser = await getAuth(app).getUser(uid);
    if (!authUser.emailVerified) return data;

    const now = new Date().toISOString();
    const patch = {
      emailVerifiedByCode: true,
      emailVerified: true,
      emailVerifiedAt:
        typeof data.emailVerifiedAt === "string" && data.emailVerifiedAt.trim()
          ? data.emailVerifiedAt
          : now,
      updatedAt: now,
    };
    await db.collection(PRICING_FS.users).doc(uid).set(patch, { merge: true });
    return { ...data, ...patch };
  } catch {
    return data;
  }
}
