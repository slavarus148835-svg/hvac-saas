export function normalizeBotCommandToken(textRaw: string): string {
  const t = String(textRaw || "").trim().toLowerCase();
  const first = t.split(/\s+/)[0] || "";
  return first.split("@")[0] || first;
}

/** /stat и /stat@BotName */
export function isStatTelegramCommand(textRaw: string, cmd0?: string): boolean {
  const cmd = cmd0 ?? normalizeBotCommandToken(textRaw);
  if (cmd === "/stat") return true;
  const normalized = String(textRaw || "").trim().toLowerCase();
  return normalized.startsWith("/stat@") || normalized.startsWith("/stat ");
}
