import { buildStructuredClientQuoteMessage } from "@/lib/clientQuoteStandard";
import { normalizeLegacyStrobaLabelsInQuoteText } from "@/lib/calculator/strobaBilling";

export type QuoteLineItem = {
  title: string;
  amount: number;
  note?: string;
};

export type BuildClientQuoteTextParams = {
  clientName?: string;
  clientContact?: string;
  capacity: string;
  mountType: "standard" | "existing";
  items: QuoteLineItem[];
  total: number;
  /**
   * @deprecated Раньше различали кВт и BTU; теперь везде полные BTU (7000 BTU и т.д.).
   * Параметр оставлен для обратной совместимости вызовов.
   */
  capacityDisplay?: "kw" | "btu_typical";
};

/**
 * Текст сметы для мессенджеров и share (единый формат с основным калькулятором).
 * Заголовки позиций должны уже содержать полные BTU, если там указана мощность.
 */
export function buildClientQuoteText(params: BuildClientQuoteTextParams): string {
  const text = buildStructuredClientQuoteMessage({
    items: params.items.map((i) => ({
      title: normalizeLegacyStrobaLabelsInQuoteText(i.title),
      amount: i.amount,
    })),
    total: params.total,
    clientName: params.clientName,
    clientContact: params.clientContact,
  });
  return normalizeLegacyStrobaLabelsInQuoteText(text);
}

function encode(text: string): string {
  return encodeURIComponent(text);
}

export function buildWhatsAppShareUrl(phoneDigits: string, text: string): string {
  const d = String(phoneDigits || "").replace(/\D/g, "");
  if (!d) return "";
  let n = d;
  if (n.length === 11 && n.startsWith("8")) n = `7${n.slice(1)}`;
  return `https://wa.me/${n}?text=${encode(text)}`;
}

/**
 * Общий share (не диалог с клиентом). Для отправки клиенту используйте
 * copyQuoteThenOpenTelegramClient из @/lib/telegramClientContact.
 */
export function buildTelegramShareUrl(text: string, url?: string): string {
  const u = (url ?? "").trim();
  return `https://t.me/share/url?url=${encode(u)}&text=${encode(text)}`;
}
