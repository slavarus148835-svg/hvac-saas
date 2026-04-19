const storage = require("../services/storage");
const reasonSummary = require("../services/reasonSummary");

module.exports = async function shortlistCmd(parts, ctx) {
  const chatId = ctx.chatId;
  const top = await storage.getTopLeads(10);
  if (!top.length) {
    return "Пока нет лидов. Запустите /find_leads или /run_pipeline.\nСильные сегменты: business_center, uk, hotel, clinic.";
  }
  const ids = top.map((l) => l.id);
  await storage.saveLastShortlist(chatId, ids);

  const lines = ["Топ-10", ""];
  top.forEach((l, i) => {
    const n = i + 1;
    const reason = reasonSummary.humanLine(l);
    lines.push(`${n}) ${l.name}`);
    lines.push(`   • Quick: ${n}`);
    lines.push(`   • ID: ${l.id}`);
    lines.push(`   • ${l.segment} | ${l.score} | ${l.priority} | ${l.status}`);
    lines.push(`   • ${l.phone || "—"} | ${l.website || "—"}`);
    lines.push(`   • Причина: ${reason}`);
    lines.push("");
  });
  lines.push("Для генерации сообщения используйте: /compose 1");
  return lines.join("\n");
};
