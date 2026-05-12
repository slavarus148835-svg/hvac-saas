import { buildStructuredClientQuoteMessage } from "@/lib/clientQuoteStandard";

export type MiniAppQuoteLineInput = {
  title: string;
  amount: number;
  /** Игнорируется в тексте для клиента — без технических пояснений. */
  note?: string;
};

/** Соответствие подписей строк сметы веб-версии и коммерческих формулировок Mini App. */
const TITLE_DISPLAY: Record<string, string> = {
  "Кронштейны и крепежи": "Кронштейны",
  "Демонтаж / монтаж стеклопакета": "Демонтаж и монтаж стеклопакета",
  "Резка фасадной плитки": "Демонтаж, резка и монтаж фасадной плитки",
};

export function mapMiniAppQuoteItemTitle(computeTitle: string): string {
  return TITLE_DISPLAY[computeTitle] ?? computeTitle;
}

/**
 * Текст сметы для Mini App: тот же каркас, что и в основном калькуляторе.
 * Хвост из textSettings добавляется на странице калькулятора.
 */
export function buildTelegramMiniAppClientQuoteText(params: {
  clientName?: string;
  clientContact?: string;
  capacity: string;
  mountType: "standard" | "existing";
  items: MiniAppQuoteLineInput[];
  total: number;
  /** @deprecated не используется — мощность в строках позиций из compute. */
  capacityDisplay?: "kw" | "btu_typical";
}): string {
  void params.capacity;
  void params.mountType;
  return buildStructuredClientQuoteMessage({
    items: params.items.map((i) => ({ title: i.title, amount: i.amount })),
    total: params.total,
    clientName: params.clientName,
    clientContact: params.clientContact,
    mapTitle: mapMiniAppQuoteItemTitle,
  });
}
