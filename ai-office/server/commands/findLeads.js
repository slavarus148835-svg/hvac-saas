const leadSourceAgent = require("../agents/leadSourceAgent");
const storage = require("../services/storage");
const logger = require("../services/logger");

module.exports = async function findLeadsCmd(parts, ctx) {
  const city = String(parts[1] || "").trim();
  const segment = String(parts[2] || "").trim().toLowerCase();
  if (!city || !segment) {
    return "⚠️ Формат: /find_leads <city> <segment>";
  }
  if (!leadSourceAgent.isValidSegment(segment)) {
    return `Неизвестный сегмент.\nДопустимо: ${leadSourceAgent.SEGMENTS.join(", ")}\nСильные: business_center, uk, hotel, clinic`;
  }
  const res = await leadSourceAgent.findLeads(city, segment);
  if (!res.ok) return `⚠️ Ошибка: ${res.error}`;
  for (const l of res.leads) {
    await storage.upsertLead(l);
  }
  const storedPreview = [];
  for (const l of res.leads.slice(0, 5)) {
    const s = (await storage.getLeadByPlaceId(l.placeId)) || (await storage.getLeadById(l.id)) || l;
    storedPreview.push(s);
  }
  logger.info(`find_leads: сохранено ${res.leads.length} demo=${Boolean(res.demo)} mode=${res.mode || "api"}`);
  await storage.appendJson("logs.json", {
    type: "find_leads",
    city,
    segment,
    count: res.leads.length,
    demo: Boolean(res.demo),
  });
  let head = "Mode: yandex\nGoogle Places: disabled\n\n";
  if (res.mode === "google_places" || res.mode === "api") head = "Mode: google_places\nGoogle Places: enabled\n\n";
  else if (res.mode === "serpapi") head = "Mode: serpapi\nGoogle Places: disabled\n\n";
  else if (res.mode === "demo") head = "Mode: demo\nGoogle Places: disabled\n\n";
  const preview = storedPreview.map((l) => `• ${l.id} — ${l.name}`).join("\n");
  const tail = res.mode === "demo" ? "\n\nРежим demo: веб-поиск не дал результатов." : "";
  return (
    head +
    [
      `Найдено: ${res.leads.length}`,
      `Сегмент: ${segment}`,
      "",
      "Примеры:",
      preview || "—",
    ].join("\n") + tail
  );
};
