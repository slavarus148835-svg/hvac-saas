/**
 * Убирает из текста для клиента строки с именем/телефоном клиента (если попали вручную или из старых шаблонов).
 * Не меняет суммы и не трогает сохранение в истории — только внешнюю отправку / копирование.
 */
const CLIENT_IDENTITY_LINE =
  /^\s*(Клиент|Контакт|Телефон|Имя|Номер|Phone|Contact|Client)\b\s*[:：]/i;

export function stripClientIdentityLinesFromPublicQuote(text: string): string {
  const out = String(text || "")
    .split("\n")
    .filter((line) => !CLIENT_IDENTITY_LINE.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return out;
}
