import { formatRubles } from "@/lib/calculator/format";

export type MiniAppQuoteLineInput = {
  title: string;
  amount: number;
  /** Игнорируется в тексте для клиента — без технических пояснений. */
  note?: string;
};

function mountLabel(mountType: "standard" | "existing"): string {
  return mountType === "standard" ? "на нашу трассу" : "на чужую трассу";
}

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
 * Текст сметы для Mini App: только позиции и суммы, без примечаний из compute.
 */
export function buildTelegramMiniAppClientQuoteText(params: {
  clientName?: string;
  clientContact?: string;
  capacity: string;
  mountType: "standard" | "existing";
  items: MiniAppQuoteLineInput[];
  total: number;
  capacityDisplay?: "kw" | "btu_typical";
}): string {
  const name = (params.clientName ?? "").trim();
  const contact = (params.clientContact ?? "").trim();
  const cap =
    params.capacityDisplay === "btu_typical"
      ? `${params.capacity} BTU`
      : `${params.capacity} кВт`;

  const lines: string[] = [
    "📋 Смета HVAC-SaaS",
    "",
    `Монтаж ${mountLabel(params.mountType)}, ${cap}`,
    "",
    "Позиции:",
  ];

  for (const it of params.items) {
    const title = mapMiniAppQuoteItemTitle(it.title);
    const sign = it.amount < 0 ? "−" : "";
    const amt = formatRubles(Math.abs(it.amount));
    lines.push(`• ${title} — ${sign}${amt} ₽`);
  }

  lines.push("");
  lines.push(`Итого: ${formatRubles(params.total)} ₽`);
  lines.push("");

  if (name) lines.push(`Клиент: ${name}`);
  if (contact) lines.push(`Контакт: ${contact}`);

  lines.push("");
  lines.push("Монтаж с гарантией. Оплата по договору / на расчётный счёт.");

  return lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").trim();
}
