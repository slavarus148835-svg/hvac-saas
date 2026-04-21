const leadSourceAgent = require("../agents/leadSourceAgent");
const qualifierAgent = require("../agents/qualifierAgent");
const offerAgent = require("../agents/offerAgent");
const proposalAgent = require("../agents/proposalAgent");
const storage = require("../services/storage");
const reportAgent = require("../agents/reportAgent");
const logger = require("../services/logger");

const MAX_COMPOSE = 12;

module.exports = async function pipelineCmd(parts, ctx) {
  const city = String(parts[1] || "").trim();
  const segment = String(parts[2] || "").trim().toLowerCase();
  if (!city || !segment) {
    return "Формат: /run_pipeline <город> <segment>\nСильные сегменты: business_center, uk, hotel, clinic";
  }
  if (!leadSourceAgent.isValidSegment(segment)) {
    return `Неизвестный сегмент.\nДопустимо: ${leadSourceAgent.SEGMENTS.join(", ")}\nСильные: business_center, uk, hotel, clinic`;
  }
  const src = await leadSourceAgent.findLeads(city, segment);
  if (!src.ok) return `⚠️ Ошибка поиска: ${src.error}`;
  for (const l of src.leads) {
    await storage.upsertLead(l);
  }
  const refreshed = [];
  for (const l of src.leads) {
    const stored = (await storage.getLeadByPlaceId(l.placeId)) || (await storage.getLeadById(l.id)) || l;
    refreshed.push(stored);
  }
  const qualified = [];
  for (const l of refreshed) {
    const q = await qualifierAgent.qualifyLead(l);
    const savedQ = await storage.upsertLead({ ...q, status: "qualified" });
    qualified.push(savedQ);
  }
  const sorted = [...qualified].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
  const toCompose = sorted.filter((l) => (Number(l.score) || 0) >= 40).slice(0, MAX_COMPOSE);
  for (const l of toCompose) {
    const offer = await offerAgent.buildOffer(l);
    const prop = await proposalAgent.buildProposal(l, offer);
    await storage.upsertLead({
      ...l,
      offerSummary: offer.offerSummary,
      painPoints: offer.painPoints,
      reasonsToContact: offer.reasonsToContact,
      shortMessage: prop.shortMessage,
      longMessage: prop.longMessage,
      proposalText: prop.proposalText,
      followUpMessage: prop.followUpMessage,
      callScript: prop.callScript,
      firstMessage: prop.shortMessage,
      status: "waiting",
      updatedAt: new Date().toISOString(),
    });
  }
  const allInStorage = (await storage.readJson("leads.json")) || [];
  const batchPlaceIds = new Set(refreshed.map((x) => x.placeId).filter(Boolean));
  const mergedView = allInStorage.filter((x) => batchPlaceIds.has(x.placeId));
  logger.info(
    `pipeline: готово found=${src.leads.length} composed=${toCompose.length} demo=${Boolean(src.demo)} mode=${src.mode || "api"}`
  );
  await storage.appendJson("logs.json", {
    type: "pipeline",
    city,
    segment,
    found: src.leads.length,
    composed: toCompose.length,
    demo: Boolean(src.demo),
    mode: src.mode || (src.demo ? "demo" : "google_places"),
  });
  await storage.appendJson("campaigns.json", {
    city,
    segment,
    at: new Date().toISOString(),
    leads: src.leads.length,
  });
  return reportAgent.formatPipelineReport({
    city,
    segment,
    leads: mergedView.length ? mergedView : qualified,
    demo: Boolean(src.demo),
    mode: src.mode || (src.demo ? "demo" : "google_places"),
  });
};
