import { buildStructuredClientQuoteMessage } from "@/lib/clientQuoteStandard";
import {
  clientQuoteItemsWithRoughInHeader,
  normalizeLegacyRoughInHoleLabelsInQuoteText,
} from "@/lib/calculator/roughInMode";
import { normalizeLegacyStrobaLineItemTitle } from "@/lib/calculator/strobaBilling";

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
  "Подъём внешнего блока на плече по лестнице": "Подъём кондиционера на плече по лестнице",
};

export function mapMiniAppQuoteItemTitle(computeTitle: string): string {
  const mapped = TITLE_DISPLAY[computeTitle] ?? computeTitle;
  return normalizeLegacyRoughInHoleLabelsInQuoteText(
    normalizeLegacyStrobaLineItemTitle(mapped)
  );
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
  void params.mountType;
  const items = clientQuoteItemsWithRoughInHeader(
    params.capacity,
    params.items.map((i) => ({ title: i.title, amount: i.amount }))
  );
  return buildStructuredClientQuoteMessage({
    items,
    total: params.total,
    clientName: params.clientName,
    clientContact: params.clientContact,
    mapTitle: mapMiniAppQuoteItemTitle,
  });
}
