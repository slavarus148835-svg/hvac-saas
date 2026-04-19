const storage = require("../services/storage");
const crmAgent = require("../agents/crmAgent");
const config = require("../config");

module.exports = async function statusCmd(parts, ctx) {
  const leads = (await storage.readJson("leads.json")) || [];
  const by = {};
  for (const s of crmAgent.STATUSES) by[s] = 0;
  for (const l of leads) {
    by[l.status] = (by[l.status] || 0) + 1;
  }
  const logs = (await storage.readJson("logs.json")) || [];
  const pipe = Array.isArray(logs)
    ? logs.filter((x) => x && x.type === "pipeline").slice(-10).reverse().slice(0, 3)
    : [];

  const placesMode = config.googlePlacesApiKey ? "live mode" : "demo mode";
  const openaiMode = config.openaiApiKey ? "live mode" : "template mode";

  const lines = ["Статус", ""];
  lines.push(`Лидов всего: ${leads.length}`);
  lines.push(`waiting: ${by.waiting || 0} | interested: ${by.interested || 0} | contacted: ${by.contacted || 0}`);
  lines.push(`Google Places: ${placesMode}`);
  lines.push(`OpenAI: ${openaiMode}`);
  lines.push("");
  if (pipe.length) {
    lines.push("Последние pipeline:");
    pipe.forEach((p) => {
      lines.push(`• ${p.city || "?"} / ${p.segment || "?"} (${p.at || ""})`);
    });
    lines.push("");
  }
  if (placesMode === "demo") {
    lines.push("Подсказка: для реальных лидов добавьте GOOGLE_PLACES_API_KEY (launch спросит при пустом ключе).");
  } else {
    lines.push("Подсказка: /focus → /run_pipeline <город> business_center → /shortlist.");
  }
  return lines.join("\n");
};
