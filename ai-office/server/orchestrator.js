const startCmd = require("./commands/start");
const statusCmd = require("./commands/status");
const findLeadsCmd = require("./commands/findLeads");
const shortlistCmd = require("./commands/shortlist");
const composeCmd = require("./commands/compose");
const pipelineCmd = require("./commands/pipeline");
const focusCmd = require("./commands/focus");
const setStatusCmd = require("./commands/setStatus");

function normalizeParts(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const parts = raw.split(/\s+/).filter(Boolean);
  if (!parts.length) return [];
  parts[0] = parts[0].split("@")[0];
  return parts;
}

async function handleMessage(text, chatId) {
  const parts = normalizeParts(text);
  if (!parts.length) return null;
  const cmd = parts[0].toLowerCase();
  const ctx = { chatId: String(chatId || "0") };
  try {
    if (cmd === "/start") return await startCmd(parts, ctx);
    if (cmd === "/status") return await statusCmd(parts, ctx);
    if (cmd === "/focus") return await focusCmd(parts, ctx);
    if (cmd === "/find_leads") return await findLeadsCmd(parts, ctx);
    if (cmd === "/shortlist") return await shortlistCmd(parts, ctx);
    if (cmd === "/compose") return await composeCmd(parts, ctx);
    if (cmd === "/run_pipeline") return await pipelineCmd(parts, ctx);
    if (cmd === "/set_status") return await setStatusCmd(parts, ctx);
    return "Неизвестная команда. /start /focus /status /find_leads /run_pipeline /shortlist /compose /set_status";
  } catch (e) {
    return `Ошибка: ${e.message || e}`;
  }
}

module.exports = {
  handleMessage,
  normalizeParts,
};
