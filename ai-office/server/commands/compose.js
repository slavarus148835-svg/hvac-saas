const storage = require("../services/storage");
const offerAgent = require("../agents/offerAgent");
const proposalAgent = require("../agents/proposalAgent");

module.exports = async function composeCmd(parts, ctx) {
  const chatId = ctx.chatId;
  const raw = String(parts[1] || "").trim();
  if (!raw) {
    return "Формат: /compose <Quick или leadId>\nСначала /shortlist, затем например /compose 1";
  }
  let leadId = await storage.resolveLeadRef(chatId, raw);
  if (!leadId && raw.startsWith("lead_")) leadId = raw;
  if (!leadId) {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 1) {
      return "Сначала выполните /shortlist, чтобы привязать Quick-номер.";
    }
    return "Лид не найден. /shortlist или полный leadId.";
  }
  const lead = await storage.getLeadById(leadId);
  if (!lead) return "Лид не найден.";
  const offer = await offerAgent.buildOffer(lead);
  const prop = await proposalAgent.buildProposal(lead, offer);
  const merged = await storage.upsertLead({
    ...lead,
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
  await storage.appendJson("logs.json", { type: "compose", leadId: merged.id });
  return [
    "Сборка готова",
    "",
    `${merged.name}`,
    `ID: ${merged.id}`,
    "",
    "КП (кратко)",
    merged.offerSummary,
    "",
    "Первый контакт",
    merged.shortMessage,
    "",
    "Follow-up",
    merged.followUpMessage,
    "",
    "Статус: waiting",
  ].join("\n");
};
