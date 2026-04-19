const scoring = require("./scoring");

function humanLine(lead) {
  const phone = scoring.hasPhone(lead);
  const site = scoring.hasWebsite(lead);
  const blob = `${lead.name || ""} ${lead.address || ""}`.toLowerCase();
  const seg = String(lead.segment || "");
  const multi = /филиал|сеть|корп|управляющ|ук\s|бц|бизнес|трц|отель|гостиниц|клиник|склад|логистик/i.test(blob);

  if (seg === "business_center") {
    if (phone && site) return "Крупный коммерческий объект, есть телефон и сайт";
    return "БЦ-профиль: вероятно несколько систем, удобно закрыть регламентным ТО";
  }
  if (seg === "uk") return "Сетевой или управляющий объект, подходит под регулярное ТО";
  if (multi && phone) return "Похоже на объект с несколькими системами, есть прямой контакт";
  if ((seg === "hotel" || seg === "clinic") && phone) {
    return "Коммерческий объект с нагрузкой на климат, есть телефон";
  }
  if (phone && site) return "Коммерческий объект, есть телефон и сайт";
  if (phone) return "Есть телефон — быстрый вход в контакт";
  if (site) return "Есть сайт — проще оценить масштаб HVAC";
  if (seg === "warehouse") return "Логистика/склад — часто несколько сплит-узлов, выезды по заявкам";
  if (seg === "restaurant" || seg === "store") return "HoReCa/ритейл — важна стабильность кондиционирования";
  if (seg === "fitness") return "Фитнес — нагрузка на вентиляцию и кондиционирование";
  if (seg === "office") return "Офис — удобно закрыть сервисом на юрлице и документами";
  return "Коммерческий объект под HVAC B2B";
}

module.exports = { humanLine };
