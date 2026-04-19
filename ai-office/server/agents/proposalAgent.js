const openai = require("../services/openai");
const outreachPrompt = require("../prompts/outreach");
const logger = require("../services/logger");
const { segmentFallback } = require("../templates/segmentOutreach");

function fallbackProposal(lead, offer) {
  return segmentFallback(lead, offer);
}

async function buildProposal(lead, offer) {
  const offerBlock = {
    offerSummary: offer.offerSummary,
    painPoints: offer.painPoints,
    reasonsToContact: offer.reasonsToContact,
  };
  const fb = fallbackProposal(lead, offer);
  const ai = await openai.chatJson(
    outreachPrompt.system,
    outreachPrompt.user(lead, offerBlock)
  );
  if (ai.ok && ai.parsed) {
    const p = ai.parsed;
    const sm = String(p.shortMessage || "").trim();
    if (sm) {
      return {
        shortMessage: sm,
        longMessage: String(p.longMessage || fb.longMessage).trim(),
        proposalText: String(p.proposalText || fb.proposalText).trim(),
        followUpMessage: String(p.followUpMessage || fb.followUpMessage).trim(),
        callScript: String(p.callScript || fb.callScript).trim(),
      };
    }
    logger.warn("Proposal: пустой shortMessage, шаблон");
  }
  return fb;
}

module.exports = {
  buildProposal,
  fallbackProposal,
};
