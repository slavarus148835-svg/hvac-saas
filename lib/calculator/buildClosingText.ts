export function buildCalculatorClosingText(name: string) {
  const clientLine = name.trim() ? `Клиент: ${name.trim()}` : "";
  return [
    clientLine,
    "При необходимости возможно составление договора с гарантией на монтаж.",
    "Оплата возможна через расчётный счёт.",
  ]
    .filter(Boolean)
    .join("\n");
}
