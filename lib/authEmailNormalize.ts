/** Trim + lowercase для сопоставления email (клиент и сервер). */
export function normalizeEmailForAuth(raw: string): string {
  return String(raw ?? "").trim().toLowerCase();
}
