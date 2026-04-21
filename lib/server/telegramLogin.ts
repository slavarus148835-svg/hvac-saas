import crypto from "node:crypto";

/**
 * Проверка данных Telegram Login Widget по
 * https://core.telegram.org/widgets/login#checking-authorization
 */
export function verifyTelegramLoginPayload(
  payload: Record<string, string>,
  botToken: string
): boolean {
  const hash = payload.hash;
  if (!hash || !botToken) return false;

  const pairs = Object.entries(payload)
    .filter(([k]) => k !== "hash")
    .sort(([a], [b]) => a.localeCompare(b));

  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join("\n");

  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const hmac = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(hmac, "hex"), Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}

/** auth_date в секундах с эпохи; не старше maxAgeSeconds. */
export function isTelegramAuthFresh(
  authDateSeconds: number,
  maxAgeSeconds = 600
): boolean {
  if (!Number.isFinite(authDateSeconds) || authDateSeconds <= 0) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  return nowSec - authDateSeconds <= maxAgeSeconds;
}
