/** Проверка админ-доступа: ADMIN_TELEGRAM_CHAT_ID может быть chat id и/или user id. */
export function parseAdminTelegramIds(): string[] {
  const raw = String(process.env.ADMIN_TELEGRAM_CHAT_ID || "").trim();
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isTelegramAdmin(params: {
  chatId: string | number;
  fromTelegramUserId?: number | null;
}): boolean {
  const ids = parseAdminTelegramIds();
  if (ids.length === 0) return false;
  const chat = String(params.chatId);
  const from =
    params.fromTelegramUserId != null && Number.isFinite(params.fromTelegramUserId)
      ? String(Math.trunc(params.fromTelegramUserId))
      : "";
  return ids.some((id) => id === chat || (from && id === from));
}
