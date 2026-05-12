import { PDFDocument, rgb } from "pdf-lib";
import { mapMiniAppQuoteItemTitle } from "@/lib/telegramMiniAppQuoteText";

export type MiniAppQuotePdfLine = { title: string; amount: number };

const NOTO_REGULAR_URL =
  "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Regular.ttf";
const NOTO_BOLD_URL =
  "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Bold.ttf";

let notoFontBytesPromise: Promise<{ regular: Uint8Array; bold: Uint8Array }> | null = null;

async function loadNotoFontBytes(): Promise<{ regular: Uint8Array; bold: Uint8Array }> {
  if (!notoFontBytesPromise) {
    notoFontBytesPromise = (async () => {
      const [regularRes, boldRes] = await Promise.all([
        fetch(NOTO_REGULAR_URL, { redirect: "follow" }),
        fetch(NOTO_BOLD_URL, { redirect: "follow" }),
      ]);
      if (!regularRes.ok) throw new Error(`noto_regular_fetch_${regularRes.status}`);
      if (!boldRes.ok) throw new Error(`noto_bold_fetch_${boldRes.status}`);
      const [regularBuf, boldBuf] = await Promise.all([
        regularRes.arrayBuffer(),
        boldRes.arrayBuffer(),
      ]);
      return { regular: new Uint8Array(regularBuf), bold: new Uint8Array(boldBuf) };
    })();
  }
  return notoFontBytesPromise;
}

function truncateDisplayLine(text: string, maxChars: number): string {
  const chars = [...text];
  if (chars.length <= maxChars) return text;
  return `${chars.slice(0, maxChars - 1).join("")}…`;
}

export async function buildMiniAppQuotePdfBytes(params: {
  clientName: string;
  clientContact: string;
  capacity: string;
  mountTypeLabel: string;
  lines: MiniAppQuotePdfLine[];
  total: number;
}): Promise<Uint8Array> {
  const { regular, bold } = await loadNotoFontBytes();
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(regular, { subset: true });
  const fontBold = await pdf.embedFont(bold, { subset: true });

  const pageWidth = 595;
  const pageHeight = 842;
  let page = pdf.addPage([pageWidth, pageHeight]);
  const margin = 50;
  let y = pageHeight - margin;

  const newPageIfNeeded = (need: number) => {
    if (y < margin + need) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  };

  const drawLine = (text: string, size: number, useBold = false, color = rgb(0.12, 0.14, 0.18)) => {
    newPageIfNeeded(size + 8);
    const slice = truncateDisplayLine(text, 95);
    page.drawText(slice, {
      x: margin,
      y,
      size,
      font: useBold ? fontBold : font,
      color,
    });
    y -= size + 6;
  };

  drawLine("HVAC-SaaS", 18, true, rgb(0.06, 0.09, 0.16));
  drawLine("Смета монтажа кондиционера", 13, true);
  y -= 6;

  const cn = params.clientName.trim();
  const cc = params.clientContact.trim();
  if (cn) drawLine(`Клиент: ${cn}`, 11);
  if (cc) drawLine(`Контакт: ${cc}`, 11);
  drawLine(`Мощность: ${params.capacity} BTU. Монтаж: ${params.mountTypeLabel}`, 11);
  y -= 8;

  drawLine("Позиции", 12, true);
  for (const row of params.lines) {
    const sign = row.amount < 0 ? "−" : "";
    const rub = new Intl.NumberFormat("ru-RU").format(Math.abs(Math.round(row.amount)));
    const title = mapMiniAppQuoteItemTitle(row.title);
    drawLine(`• ${title} — ${sign}${rub} ₽`, 10);
  }

  y -= 10;
  const totalRub = new Intl.NumberFormat("ru-RU").format(Math.round(params.total));
  drawLine(`Итого: ${totalRub} ₽`, 14, true, rgb(0.05, 0.22, 0.12));

  y -= 12;
  drawLine(
    "Гарантия на монтаж по договору. Оплата возможна на расчётный счёт.",
    9,
    false,
    rgb(0.35, 0.38, 0.42)
  );

  return pdf.save();
}
