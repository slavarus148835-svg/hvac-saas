/**
 * Убирает из текста для клиента строки с именем/телефоном клиента (если попали вручную или из старых шаблонов).
 * На строках со словом «Скидка» убирает визуальный минус перед суммой (математика в расчёте не меняется).
 */
const CLIENT_IDENTITY_LINE =
  /^\s*(\*{0,2})?(Клиент|Контакт|Телефон|Имя|Номер|ФИО|Phone|Contact|Client|WhatsApp|Telegram)(\*{0,2})?(\s+клиента)?\b\s*[:：]/i;

/** Строка похожа на «ключ: значение» с персональными данными клиента (расширение под старые шаблоны). */
const CLIENT_IDENTITY_LOOSE =
  /^\s*(Имя\s+и\s+фамилия|ФИО\s+клиента|Телефон\s+клиента|Номер\s+телефона|Контакт\s+клиента)\b\s*[:：]/i;

function softenDiscountMinusInLine(line: string): string {
  if (!/скидка/i.test(line)) return line;
  let s = line;
  s = s.replace(/([:：]\s*)[−-](?=\d)/g, "$1");
  s = s.replace(/(—\s*)[−-](?=\d)/g, "$1");
  s = s.replace(/(\s)[−-](?=\d)/g, "$1");
  // «• … — −1 000 ₽» в конце строки
  s = s.replace(/(—\s*)[−-](\s*[\d\s\u00A0]+₽\s*)$/u, "— $2");
  return s;
}

export function stripClientIdentityLinesFromPublicQuote(text: string): string {
  const out = String(text || "")
    .split("\n")
    .filter((line) => !CLIENT_IDENTITY_LINE.test(line) && !CLIENT_IDENTITY_LOOSE.test(line))
    .map((line) => softenDiscountMinusInLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return out;
}
