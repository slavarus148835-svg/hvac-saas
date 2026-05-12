/**
 * Клиентская PNG-карточка сметы (canvas), для превью и шаринга.
 */
export function drawQuoteCardPng(
  canvas: HTMLCanvasElement,
  params: {
    title?: string;
    clientName: string;
    totalRub: string;
    subtitle: string;
    lines: string[];
  }
) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px system-ui, sans-serif";
  ctx.fillText(params.title ?? "HVAC-SaaS", 32, 52);

  ctx.font = "16px system-ui, sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(params.subtitle, 32, 82);

  const name = params.clientName.trim();
  if (name) {
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "18px system-ui, sans-serif";
    ctx.fillText(`Клиент: ${name}`, 32, 118);
  }

  let y = 150;
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillStyle = "#cbd5e1";
  for (const line of params.lines.slice(0, 8)) {
    const t = line.length > 52 ? `${line.slice(0, 49)}…` : line;
    ctx.fillText(t, 32, y);
    y += 22;
  }

  ctx.fillStyle = "#38bdf8";
  ctx.font = "bold 26px system-ui, sans-serif";
  ctx.fillText(`Итого: ${params.totalRub}`, 32, h - 48);

  ctx.fillStyle = "#64748b";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("hvac-saas.ru", w - 120, h - 20);
}

export async function quoteCardToPngBlob(
  canvas: HTMLCanvasElement,
  params: Parameters<typeof drawQuoteCardPng>[1]
): Promise<Blob | null> {
  drawQuoteCardPng(canvas, params);
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/png", 0.92);
  });
}
