const HVAC_SEGMENTS = new Set([
  "business_center",
  "hotel",
  "clinic",
  "restaurant",
  "store",
  "fitness",
  "office",
  "warehouse",
  "uk",
]);

const LARGE_HINTS =
  /центр|tower|плаза|plaza|mall|торгов|бизнес|office|офис|клиник|hospital|отель|hotel|резиденц|campus|паркинг|многоэтаж/i;
const MULTI_SYSTEM_HINTS =
  /бц|бизнес-центр|торговый|трц|тц|отель|гостиниц|клиник|поликлиник|больниц|склад|логистик|фитнес|спортзал|ресторан|столов/i;
const CORP_HINTS =
  /сеть|group|holding|филиал|корп\.|корпоратив|international|инн|ооо\s+[а-яa-z]{2,}\s+(групп|холдинг)|управляющая компания|ук\s/i;

function hasPhone(lead) {
  return Boolean(lead.phone && String(lead.phone).replace(/\D/g, "").length >= 10);
}

function hasWebsite(lead) {
  return Boolean(lead.website && String(lead.website).trim().length > 4);
}

function segmentHvacFit(segment) {
  return HVAC_SEGMENTS.has(segment);
}

function largeObjectHint(lead) {
  const blob = `${lead.name || ""} ${lead.address || ""}`;
  return LARGE_HINTS.test(blob);
}

function multiSystemsLikely(lead) {
  const blob = `${lead.name || ""} ${lead.segment || ""} ${lead.address || ""}`;
  return MULTI_SYSTEM_HINTS.test(blob);
}

function corporateHint(lead) {
  const blob = `${lead.name || ""} ${lead.website || ""}`;
  return CORP_HINTS.test(blob);
}

function computeRuleScore(lead) {
  let score = 0;
  const breakdown = [];
  if (hasPhone(lead)) {
    score += 20;
    breakdown.push("телефон +20");
  }
  if (hasWebsite(lead)) {
    score += 15;
    breakdown.push("сайт +15");
  }
  if (segmentHvacFit(lead.segment)) {
    score += 20;
    breakdown.push("сегмент HVAC +20");
  }
  if (largeObjectHint(lead)) {
    score += 20;
    breakdown.push("крупный объект +20");
  }
  if (multiSystemsLikely(lead)) {
    score += 15;
    breakdown.push("несколько систем вероятно +15");
  }
  if (corporateHint(lead)) {
    score += 10;
    breakdown.push("сеть/корп +10");
  }
  return { score: Math.min(100, score), breakdown };
}

module.exports = {
  computeRuleScore,
  hasPhone,
  hasWebsite,
  segmentHvacFit,
};
