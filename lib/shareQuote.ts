import { formatRubles } from "@/lib/calculator/format";
import { buildStructuredClientQuoteMessage } from "@/lib/clientQuoteStandard";

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
  return buildStructuredClientQuoteMessage({
    items: params.items.map((i) => ({ title: i.title, amount: i.amount })),
    total: params.total,
    clientName: params.clientName,
    clientContact: params.clientContact,
    formatMoney: formatRubles,
  });
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

/** Поделиться текстом в Telegram (внешняя ссылка). */
export function buildTelegramShareUrl(text: string, url?: string): string {
  const u = (url ?? "").trim();
  return `https://t.me/share/url?url=${encode(u)}&text=${encode(text)}`;
}

export function buildSmsShareUrl(text: string): string {
  return `sms:?body=${encode(text)}`;
}
