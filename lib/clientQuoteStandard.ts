import { formatAmountRu } from "@/lib/calculator/format";

/** Единое начало клиентского текста сметы (веб, Mini App, share, сохранение). */
export const CLIENT_QUOTE_GREETING =
  "Здравствуйте, подготовили расчет по вашим параметрам.";

/** Завершение клиентского текста: материалы и гарантия производителя. */
export const CLIENT_QUOTE_MATERIALS_BLOCK =
  "В монтаже используются только качественные материалы по ГОСТ: толстостенные медные трубки и кабель с заземлением. Это помогает избежать преждевременного износа системы, снижает риск поломок и сохраняет официальную гарантию производителя.";

export type ClientQuoteLine = { title: string; amount: number };

export type ClientQuoteRoomBlock = {
  roomName: string;
  items: ClientQuoteLine[];
  subtotal: number;
};

/**
 * Основной блок сообщения клиенту: приветствие, позиции с суммами, итого, блок про материалы.
 * Имя и контакт клиента в текст не включаются (WhatsApp / Telegram / копирование).
 * Поля clientName / clientContact оставлены для совместимости вызовов и игнорируются.
 * Примечания к позициям (технические) не включаются.
 */
export function buildStructuredClientQuoteMessage(params: {
  items: ClientQuoteLine[];
  total: number;
  clientName?: string;
  clientContact?: string;
  mapTitle?: (title: string) => string;
}): string {
  const fmtNum = (n: number) => formatAmountRu(Math.abs(n));
  const map = params.mapTitle ?? ((t: string) => t);
  void params.clientName;
  void params.clientContact;

  const lines: string[] = [CLIENT_QUOTE_GREETING, ""];

  for (const it of params.items) {
    const title = map(it.title);
    lines.push(`• ${title} — ${fmtNum(it.amount)} ₽`);
  }

  lines.push("", `Итого: ${fmtNum(params.total)} ₽`);

  lines.push("", CLIENT_QUOTE_MATERIALS_BLOCK);

  return lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").trim();
}

/**
 * Смета по нескольким комнатам: заголовок комнаты, позиции, итого по комнате; затем общий итог и блок про материалы.
 * Имя и контакт клиента в текст не включаются.
 */
export function buildMultiRoomClientQuoteMessage(params: {
  rooms: ClientQuoteRoomBlock[];
  total: number;
  clientName?: string;
  clientContact?: string;
  mapTitle?: (title: string) => string;
  discountLine?: { title: string; amount: number } | null;
}): string {
  const fmtNum = (n: number) => formatAmountRu(Math.abs(n));
  const map = params.mapTitle ?? ((t: string) => t);
  void params.clientName;
  void params.clientContact;

  const lines: string[] = [CLIENT_QUOTE_GREETING, ""];

  for (const room of params.rooms) {
    const label = (room.roomName || "Комната").trim() || "Комната";
    lines.push(`${label}:`, "");
    for (const it of room.items) {
      const title = map(it.title);
      lines.push(`• ${title} — ${fmtNum(it.amount)} ₽`);
    }
    lines.push("", `Итого по комнате: ${fmtNum(room.subtotal)} ₽`, "");
  }

  if (params.discountLine && params.discountLine.amount !== 0) {
    const t = map(params.discountLine.title);
    lines.push(`• ${t} — ${fmtNum(params.discountLine.amount)} ₽`, "");
  }

  lines.push(`Итого по всем комнатам: ${fmtNum(params.total)} ₽`);

  lines.push("", CLIENT_QUOTE_MATERIALS_BLOCK);

  return lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").trim();
}
