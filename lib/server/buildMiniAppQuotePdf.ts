import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type MiniAppQuotePdfLine = { title: string; amount: number };

export async function buildMiniAppQuotePdfBytes(params: {
  clientName: string;
  clientContact: string;
  capacity: string;
  mountTypeLabel: string;
  lines: MiniAppQuotePdfLine[];
  total: number;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

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

  const drawLine = (text: string, size: number, bold = false, color = rgb(0.12, 0.14, 0.18)) => {
    newPageIfNeeded(size + 8);
    const slice = text.length > 95 ? `${text.slice(0, 92)}…` : text;
    page.drawText(slice, {
      x: margin,
      y,
      size,
      font: bold ? fontBold : font,
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
  drawLine(`Мощность: ${params.capacity} кВт. Монтаж: ${params.mountTypeLabel}`, 11);
  y -= 8;

  drawLine("Позиции", 12, true);
  for (const row of params.lines) {
    const sign = row.amount < 0 ? "−" : "";
    const rub = new Intl.NumberFormat("ru-RU").format(Math.abs(Math.round(row.amount)));
    drawLine(`• ${row.title} — ${sign}${rub} ₽`, 10);
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
