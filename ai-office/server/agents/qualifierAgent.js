const openai = require("../services/openai");
const storage = require("../services/storage");
const scoring = require("../services/scoring");
const qualifierPrompt = require("../prompts/qualifier");

function buildRuleSummary(rule) {
  return `итог ${rule.score}/100: ${rule.breakdown.join("; ") || "без явных бонусов"}`;
}

function fallbackReason(lead, rule) {
  const parts = [
    `Сегмент: ${lead.segment}, город: ${lead.city}.`,
    buildRuleSummary(rule) + ".",
  ];
  if (scoring.hasPhone(lead)) parts.push("Есть телефон для связи.");
  if (scoring.hasWebsite(lead)) parts.push("Есть сайт — проще проверить масштаб объекта.");
  if (!scoring.hasPhone(lead) && !scoring.hasWebsite(lead)) {
    parts.push("Контакты ограничены — уточнение по телефону/сайту повысит качество лида.");
  }
  return parts.join(" ");
}

async function qualifyLead(lead) {
  const rule = scoring.computeRuleScore(lead);
  let qualificationReason = fallbackReason(lead, rule);
  const ai = await openai.chatText(
    qualifierPrompt.system,
    qualifierPrompt.user(lead, buildRuleSummary(rule))
  );
  if (ai.ok && ai.text) {
    qualificationReason = `${ai.text.trim()}\n\n(${buildRuleSummary(rule)})`;
  }
  const updated = {
    ...lead,
    score: rule.score,
    priority: storage.priorityFromScore(rule.score),
    qualificationReason,
    updatedAt: new Date().toISOString(),
  };
  return updated;
}

async function qualifyMany(leads) {
  const out = [];
  for (const l of leads) {
    out.push(await qualifyLead(l));
  }
  return out;
}

module.exports = {
  qualifyLead,
  qualifyMany,
};
