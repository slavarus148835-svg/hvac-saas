import { createHmac, timingSafeEqual } from "crypto";

export type VerifiedTelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type VerifyTelegramInitDataResult =
  | { ok: true; telegramUser: VerifiedTelegramUser; chatId: number | null }
  | { ok: false; error: string };

/**
 * Проверка initData по алгоритму Telegram Web Apps (HMAC-SHA-256).
 * @see https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyTelegramInitData(initData: string): VerifyTelegramInitDataResult {
  if (typeof initData !== "string" || !initData.trim()) {
    return { ok: false, error: "empty_init_data" };
  }

  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!botToken) {
    return { ok: false, error: "missing_bot_token" };
  }

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, error: "invalid_init_data" };
  }

  const hash = params.get("hash");
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) {
    return { ok: false, error: "missing_or_invalid_hash" };
  }

  const dataCheckParts: string[] = [];
  const keys = [...params.keys()]
    .filter((k) => k !== "hash")
    .sort((a, b) => a.localeCompare(b));

  for (const key of keys) {
    const value = params.get(key);
    if (value === null) continue;
    dataCheckParts.push(`${key}=${value}`);
  }

  const dataCheckString = dataCheckParts.join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculated = createHmac("sha256", secretKey).update(dataCheckString).digest();

  let hashBuf: Buffer;
  try {
    hashBuf = Buffer.from(hash, "hex");
  } catch {
    return { ok: false, error: "invalid_hash_encoding" };
  }

  if (hashBuf.length !== calculated.length) {
    return { ok: false, error: "hash_mismatch" };
  }

  if (!timingSafeEqual(hashBuf, calculated)) {
    return { ok: false, error: "hash_mismatch" };
  }

  const authDateRaw = params.get("auth_date");
  const authDate = Number(authDateRaw);
  if (!Number.isFinite(authDate) || authDate <= 0) {
    return { ok: false, error: "missing_auth_date" };
  }
  const authAgeSec = Math.floor(Date.now() / 1000) - Math.trunc(authDate);
  const maxAuthAgeSec = Number(process.env.TELEGRAM_INITDATA_MAX_AGE_SEC || 86400);
  if (authAgeSec > maxAuthAgeSec) {
    return { ok: false, error: "auth_date_expired" };
  }

  const userRaw = params.get("user");
  if (!userRaw) {
    return { ok: false, error: "missing_user" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(userRaw) as unknown;
  } catch {
    return { ok: false, error: "invalid_user_json" };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "invalid_user_shape" };
  }

  const u = parsed as Record<string, unknown>;
  const id = Number(u.id);
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, error: "invalid_user_id" };
  }

  const telegramUser: VerifiedTelegramUser = {
    id: Math.trunc(id),
    first_name: typeof u.first_name === "string" ? u.first_name : undefined,
    last_name: typeof u.last_name === "string" ? u.last_name : undefined,
    username: typeof u.username === "string" ? u.username : undefined,
  };

  let chatId: number | null = null;
  const chatRaw = params.get("chat");
  if (chatRaw) {
    try {
      const c = JSON.parse(chatRaw) as { id?: unknown };
      if (typeof c.id === "number" && Number.isFinite(c.id)) {
        chatId = Math.trunc(c.id);
      }
    } catch {
      /* ignore */
    }
  }

  return { ok: true, telegramUser, chatId };
}
