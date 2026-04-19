module.exports = async function focusCmd(parts, ctx) {
  return [
    "Фокус HVAC B2B",
    "",
    "Порядок запуска (обычно лучший ROI):",
    "1) business_center — много сплит-узлов, регламент ТО",
    "2) uk — вход к инженерке на пуле объектов",
    "3) hotel — пики нагрузки, важен SLA",
    "4) clinic — стабильность + документы",
    "",
    "Дальше:",
    "• /run_pipeline <город> business_center",
    "• /shortlist",
    "• /compose 1",
    "• /set_status 1 contacted",
  ].join("\n");
};
