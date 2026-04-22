import { createHash, randomBytes } from "crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";

export type TelegramLoginSessionStatus = "pending" | "confirmed" | "expired";

export type TelegramLoginSessionDoc = {
  sessionId: string;
  purpose: "login";
  status: TelegramLoginSessionStatus;
  createdAt: string;
  updatedAt: string;
  createdAtMs: number;
  expiresAt: string;
  expiresAtMs: number;
  confirmedAt?: string;
  telegramUserId?: string;
  telegramUsername?: string | null;
  telegramFirstName?: string | null;
  telegramLastName?: string | null;
  resolvedUid?: string;
  customTokenIssuedAt?: string;
  consumedAt?: string;
  createdByIpHash?: string;
};

const SESSION_TTL_MS = 10 * 60 * 1000;

export function nowIso() {
  return new Date().toISOString();
}

export function buildTelegramSessionId(): string {
  return randomBytes(24).toString("hex");
}

function ipHash(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 24);
}

export function resolvedIpForRateLimit(req: Request): string {
  const xff = String(req.headers.get("x-forwarded-for") || "")
    .split(",")[0]
    ?.trim();
  const xri = String(req.headers.get("x-real-ip") || "").trim();
  return xff || xri || "unknown";
}

export async function assertTelegramSessionCreateRateLimit(
  db: Firestore,
  req: Request
): Promise<{ ok: true; createdByIpHash: string } | { ok: false; retryAfterSec: number }> {
  const ip = resolvedIpForRateLimit(req);
  const createdByIpHash = ipHash(ip);
  const now = Date.now();
  const minuteAgo = now - 60 * 1000;
  const snap = await db
    .collection(PRICING_FS.telegramLoginSessions)
    .where("createdByIpHash", "==", createdByIpHash)
    .limit(20)
    .get();
  let recent = 0;
  for (const doc of snap.docs) {
    const ms = Number((doc.data() as { createdAtMs?: number }).createdAtMs || 0);
    if (ms > minuteAgo && ms <= now) recent++;
  }
  if (recent >= 5) {
    return { ok: false, retryAfterSec: 60 };
  }
  return { ok: true, createdByIpHash };
}

export async function createTelegramLoginSession(
  db: Firestore,
  opts?: { createdByIpHash?: string }
): Promise<TelegramLoginSessionDoc> {
  const t = Date.now();
  const createdAt = new Date(t).toISOString();
  const expiresAtMs = t + SESSION_TTL_MS;
  const expiresAt = new Date(expiresAtMs).toISOString();
  const sessionId = buildTelegramSessionId();
  const doc: TelegramLoginSessionDoc = {
    sessionId,
    purpose: "login",
    status: "pending",
    createdAt,
    updatedAt: createdAt,
    createdAtMs: t,
    expiresAt,
    expiresAtMs,
    createdByIpHash: opts?.createdByIpHash,
  };
  await db.collection(PRICING_FS.telegramLoginSessions).doc(sessionId).set(doc, { merge: false });
  console.log("[telegram-session/create] created", { sessionId, expiresAtMs, createdByIpHash: opts?.createdByIpHash });
  return doc;
}

export async function getTelegramLoginSession(
  db: Firestore,
  sessionId: string
): Promise<TelegramLoginSessionDoc | null> {
  const id = String(sessionId || "").trim();
  if (!id) return null;
  const ref = db.collection(PRICING_FS.telegramLoginSessions).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() as TelegramLoginSessionDoc;
  if (data.status === "pending" && Number(data.expiresAtMs || 0) <= Date.now()) {
    const t = nowIso();
    await ref.set({ status: "expired", updatedAt: t } satisfies Partial<TelegramLoginSessionDoc>, {
      merge: true,
    });
    return { ...data, status: "expired", updatedAt: t };
  }
  return data;
}

export async function confirmTelegramLoginSession(
  db: Firestore,
  params: {
    sessionId: string;
    telegramUserId: string;
    telegramUsername?: string | null;
    telegramFirstName?: string | null;
    telegramLastName?: string | null;
    resolvedUid: string;
  }
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "expired" | "already_used" }> {
  const id = String(params.sessionId || "").trim();
  if (!id) return { ok: false, reason: "not_found" };
  const ref = db.collection(PRICING_FS.telegramLoginSessions).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "not_found" };
  const data = snap.data() as TelegramLoginSessionDoc;
  if (data.status === "confirmed") {
    // Idempotent confirm: same uid/user can repeat /start without failing.
    if (
      String(data.resolvedUid || "") === String(params.resolvedUid || "") &&
      String(data.telegramUserId || "") === String(params.telegramUserId || "")
    ) {
      return { ok: true };
    }
    return { ok: false, reason: "already_used" };
  }
  if (data.status !== "pending") return { ok: false, reason: "already_used" };
  if (Number(data.expiresAtMs || 0) <= Date.now()) {
    await ref.set({ status: "expired", updatedAt: nowIso() }, { merge: true });
    return { ok: false, reason: "expired" };
  }
  const t = nowIso();
  await ref.set(
    {
      status: "confirmed",
      confirmedAt: t,
      updatedAt: t,
      telegramUserId: params.telegramUserId,
      telegramUsername: params.telegramUsername ?? null,
      telegramFirstName: params.telegramFirstName ?? null,
      telegramLastName: params.telegramLastName ?? null,
      resolvedUid: params.resolvedUid,
    } satisfies Partial<TelegramLoginSessionDoc>,
    { merge: true }
  );
  console.log("[telegram-session/confirm] confirmed", {
    sessionId: id,
    telegramUserId: params.telegramUserId,
    resolvedUid: params.resolvedUid,
  });
  return { ok: true };
}

export async function markTelegramLoginSessionUsed(
  db: Firestore,
  sessionId: string
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "expired" | "pending" | "used" }> {
  const ref = db.collection(PRICING_FS.telegramLoginSessions).doc(String(sessionId || "").trim());
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false as const, reason: "not_found" as const };
    const data = snap.data() as TelegramLoginSessionDoc;
    if (data.status === "pending") {
      if (Number(data.expiresAtMs || 0) <= Date.now()) {
        tx.set(ref, { status: "expired", updatedAt: nowIso() }, { merge: true });
        return { ok: false as const, reason: "expired" as const };
      }
      return { ok: false as const, reason: "pending" as const };
    }
    if (data.status === "expired") return { ok: false as const, reason: "expired" as const };
    if (data.consumedAt) return { ok: false as const, reason: "used" as const };
    const t = nowIso();
    tx.set(
      ref,
      {
        consumedAt: t,
        customTokenIssuedAt: t,
        updatedAt: t,
        consumedCounter: FieldValue.increment(1),
      },
      { merge: true }
    );
    return { ok: true as const };
  });
  if (result.ok) {
    console.log("[telegram-session/used] marked", { sessionId: String(sessionId || "").trim() });
  }
  return result;
}
