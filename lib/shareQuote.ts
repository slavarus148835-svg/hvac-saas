import { formatRubles } from "@/lib/calculator/format";

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
};

function mountLabel(mountType: "standard" | "existing"): string {
  return mountType === "standard" ? "на нашу трассу" : "на чужую трассу";
}

/**
 * Аккуратный текст сметы для мессенджеров и Telegram share.
 */
export function buildClientQuoteText(params: BuildClientQuoteTextParams): string {
  const name = (params.clientName ?? "").trim();
  const contact = (params.clientContact ?? "").trim();
  const lines: string[] = [
    "📋 Смета HVAC-SaaS",
    "",
    `Монтаж ${mountLabel(params.mountType)}, ${params.capacity} кВт`,
    "",
    "Позиции:",
  ];

  for (const it of params.items) {
    const sign = it.amount < 0 ? "−" : "";
    const amt = formatRubles(Math.abs(it.amount));
    lines.push(`• ${it.title} — ${sign}${amt}`);
    if (it.note?.trim()) {
      lines.push(`  (${it.note.trim()})`);
    }
  }

  lines.push("");
  lines.push(`💰 Итого: ${formatRubles(params.total)}`);
  lines.push("");

  if (name) lines.push(`Клиент: ${name}`);
  if (contact) lines.push(`Контакт: ${contact}`);

  lines.push("");
  lines.push("Монтаж с гарантией. Оплата по договору / на расчётный счёт.");

  return lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").trim();
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
