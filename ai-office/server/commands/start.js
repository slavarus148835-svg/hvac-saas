module.exports = async function startCmd(parts, ctx) {
  return [
    "Revenue PRO",
    "",
    "Быстрый старт (деньги):",
    "• /focus — порядок сегментов",
    "• /run_pipeline <город> business_center",
    "• /shortlist",
    "• /compose 1",
    "• /set_status 1 contacted",
    "",
    "Команды:",
    "• /find_leads <город> <segment>",
    "• /shortlist",
    "• /compose <Quick или leadId>",
    "• /run_pipeline <город> <segment>",
    "• /status",
    "• /set_status <Quick или leadId> <статус>",
    "",
    "Сильные сегменты: business_center, uk, hotel, clinic",
    "Остальные: restaurant, store, fitness, office, warehouse",
  ].join("\n");
};
