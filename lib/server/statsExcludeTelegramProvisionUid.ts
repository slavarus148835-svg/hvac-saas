/**
 * Ранее авто-создавались users/{uid} с uid = tg_{telegramNumericId}.
 * Такие записи не считаем полноценной регистрацией в агрегатах и уведомлениях.
 */
export function isStatsExcludedTelegramProvisionUid(uid: string): boolean {
  return String(uid ?? "").startsWith("tg_");
}
