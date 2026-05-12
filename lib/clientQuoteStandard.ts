import { formatRubles } from "@/lib/calculator/format";

/** Единое начало клиентского текста сметы (веб, Mini App, share, сохранение). */
export const CLIENT_QUOTE_GREETING =
  "Здравствуйте, подготовили расчет по вашим параметрам.";

/** Завершение клиентского текста: материалы и гарантия производителя. */
export const CLIENT_QUOTE_MATERIALS_BLOCK =
  "В монтаже используются только качественные материалы по ГОСТ: толстостенные медные трубки и кабель с заземлением. Это помогает избежать преждевременного износа системы, снижает риск поломок и сохраняет официальную гарантию производителя.";

export type ClientQuoteLine = { title: string; amount: number };

/**
 * Основной блок сообщения клиенту: приветствие, позиции с суммами, итого, опционально контакты, блок про материалы.
 * Примечания к позициям (технические) не включаются.
 */
export function buildStructuredClientQuoteMessage(params: {
  items: ClientQuoteLine[];
  total: number;
  clientName?: string;
  clientContact?: string;
  formatMoney?: (n: number) => string;
  mapTitle?: (title: string) => string;
}): string {
  const fmt = params.formatMoney ?? formatRubles;
  const map = params.mapTitle ?? ((t: string) => t);
  const name = (params.clientName ?? "").trim();
  const contact = (params.clientContact ?? "").trim();

  const lines: string[] = [CLIENT_QUOTE_GREETING, ""];

  for (const it of params.items) {
    const title = map(it.title);
    const sign = it.amount < 0 ? "−" : "";
    lines.push(`• ${title} — ${sign}${fmt(Math.abs(it.amount))} ₽`);
  }

  lines.push("", `Итого: ${fmt(params.total)} ₽`);

  if (name) lines.push("", `Клиент: ${name}`);
  if (contact) lines.push(`Контакт: ${contact}`);

  lines.push("", CLIENT_QUOTE_MATERIALS_BLOCK);

  return lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").trim();
}
