const storage = require("../services/storage");
const crmAgent = require("../agents/crmAgent");

const STATUS_LIST = [...crmAgent.STATUSES].join(", ");

module.exports = async function setStatusCmd(parts, ctx) {
  const chatId = ctx.chatId;
  const ref = String(parts[1] || "").trim();
  const status = String(parts[2] || "").trim().toLowerCase();
  if (!ref || !status) {
    return `Формат: /set_status <Quick или leadId> <status>\nСтатусы: ${STATUS_LIST}`;
  }
  if (!crmAgent.STATUSES.has(status)) {
    return `Неизвестный статус. Допустимо: ${STATUS_LIST}`;
  }
  let leadId = await storage.resolveLeadRef(chatId, ref);
  if (!leadId && ref.startsWith("lead_")) leadId = ref;
  if (!leadId) {
    return "Лид не найден. Сначала /shortlist или укажите полный leadId.";
  }
  const r = await crmAgent.setStatus(leadId, status);
  if (!r.ok) {
    if (r.error === "not_found") return "Лид не найден.";
    return "Не удалось обновить статус.";
  }
  return [
    "Статус обновлён",
    "",
    r.lead.name,
    `Статус: ${status}`,
    `ID: ${r.lead.id}`,
  ].join("\n");
};
