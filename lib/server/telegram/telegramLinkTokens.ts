import { createHash, randomBytes } from "crypto";
import type { Firestore } from "firebase-admin/firestore";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import {
  TELEGRAM_LINK_TOKEN_PREFIX,
  TELEGRAM_LINK_TOKEN_TTL_MS,
} from "@/lib/server/telegram/telegramLinkShared";

export type TelegramLinkTokenDoc = {
  uid: string;
  email: string;
  createdAt: string;
  expiresAtMs: number;
  usedAt: string | null;
  status: "pending" | "used" | "expired";
};

function nowIso(): string {
  return new Date().toISOString();
}

export function hashLinkToken(rawToken: string): string {
  return createHash("sha256").update(String(rawToken).trim(), "utf8").digest("hex");
}

export function generateRawLinkToken(): string {
  return randomBytes(24).toString("base64url");
}

export function buildTelegramMiniAppLinkUrl(rawToken: string): string {
  const bot = String(process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "hvac_cash_bot").trim();
  const payload = `${TELEGRAM_LINK_TOKEN_PREFIX}${rawToken}`;
  return `https://t.me/${bot}/app?startapp=${encodeURIComponent(payload)}`;
}

export async function createTelegramLinkToken(
  db: Firestore,
  params: { uid: string; email: string }
): Promise<{ rawToken: string; tokenHash: string; linkUrl: string; expiresAtMs: number }> {
  const rawToken = generateRawLinkToken();
  const tokenHash = hashLinkToken(rawToken);
  const t = nowIso();
  const expiresAtMs = Date.now() + TELEGRAM_LINK_TOKEN_TTL_MS;

  const doc: TelegramLinkTokenDoc = {
    uid: params.uid,
    email: params.email,
    createdAt: t,
    expiresAtMs,
    usedAt: null,
    status: "pending",
  };

  await db.collection(PRICING_FS.telegramLinkTokens).doc(tokenHash).set(doc);
  console.log("TELEGRAM_LINK_TOKEN_CREATED", {
    tokenHashPrefix: tokenHash.slice(0, 12),
    uid: params.uid,
  });

  return {
    rawToken,
    tokenHash,
    linkUrl: buildTelegramMiniAppLinkUrl(rawToken),
    expiresAtMs,
  };
}

export type ConsumeLinkTokenResult =
  | { ok: true; uid: string; email: string }
  | {
      ok: false;
      reason: "not_found" | "expired" | "used" | "invalid_status";
    };

export async function consumeTelegramLinkToken(
  db: Firestore,
  rawToken: string
): Promise<ConsumeLinkTokenResult> {
  const tokenHash = hashLinkToken(rawToken);
  const ref = db.collection(PRICING_FS.telegramLinkTokens).doc(tokenHash);
  const snap = await ref.get();
  if (!snap.exists) {
    console.log("TELEGRAM_LINK_TOKEN_EXPIRED", { reason: "not_found", tokenHashPrefix: tokenHash.slice(0, 12) });
    return { ok: false, reason: "not_found" };
  }

  const data = snap.data() as TelegramLinkTokenDoc;
  const now = Date.now();

  if (data.status === "used" || data.usedAt) {
    console.log("TELEGRAM_LINK_TOKEN_USED", { tokenHashPrefix: tokenHash.slice(0, 12) });
    return { ok: false, reason: "used" };
  }

  if (data.expiresAtMs <= now || data.status === "expired") {
    await ref.set({ status: "expired", updatedAt: nowIso() }, { merge: true });
    console.log("TELEGRAM_LINK_TOKEN_EXPIRED", { tokenHashPrefix: tokenHash.slice(0, 12) });
    return { ok: false, reason: "expired" };
  }

  if (data.status !== "pending") {
    return { ok: false, reason: "invalid_status" };
  }

  const t = nowIso();
  await ref.set({ status: "used", usedAt: t, updatedAt: t }, { merge: true });

  return { ok: true, uid: data.uid, email: data.email };
}

export async function listRecentLinkTokensByEmail(
  db: Firestore,
  normalizedEmail: string,
  limit = 10
): Promise<
  Array<{
    tokenHashPrefix: string;
    uid: string;
    email: string;
    createdAt: string;
    expiresAtMs: number;
    usedAt: string | null;
    status: string;
  }>
> {
  const snap = await db.collection(PRICING_FS.telegramLinkTokens).limit(200).get();
  const email = normalizedEmail.trim().toLowerCase();
  const out: Array<{
    tokenHashPrefix: string;
    uid: string;
    email: string;
    createdAt: string;
    expiresAtMs: number;
    usedAt: string | null;
    status: string;
  }> = [];

  for (const doc of snap.docs) {
    const d = doc.data() as TelegramLinkTokenDoc;
    if (String(d.email || "").trim().toLowerCase() !== email) continue;
    out.push({
      tokenHashPrefix: doc.id.slice(0, 12),
      uid: d.uid,
      email: d.email,
      createdAt: d.createdAt,
      expiresAtMs: d.expiresAtMs,
      usedAt: d.usedAt,
      status: d.status,
    });
    if (out.length >= limit) break;
  }
  return out;
}
