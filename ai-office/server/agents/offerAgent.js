const openai = require("../services/openai");
const offerPrompt = require("../prompts/offer");
const logger = require("../services/logger");

function fallbackOffer(lead) {
  const name = lead.name || "объект";
  return {
    offerSummary: `ТО и ремонт сплит/мультисплит и вентиляции для «${name}»: сезонная проверка, диагностика, безнал для юрлиц, акты/счета.`,
    painPoints: [
      "Риск простоя при пиковой нагрузке из-за отсутствия регламентного ТО.",
      "Разнородный парк оборудования — сложно контролировать исполнителей.",
      "Документооборот и прозрачность работ для бухгалтерии/эксплуатации.",
    ],
    reasonsToContact: [
      "ИП-формат: быстрые выезды, понятная смета, закрывающие документы.",
      "Работаем с бытовыми и полупромышленными системами, пакетное обслуживание нескольких блоков.",
      "Диагностика и ремонт без «лишних» услуг — по факту неисправности.",
    ],
  };
}

async function buildOffer(lead) {
  const fb = fallbackOffer(lead);
  const ai = await openai.chatJson(offerPrompt.system, offerPrompt.user(lead));
  const sum = ai.parsed && String(ai.parsed.offerSummary || "").trim();
  if (ai.ok && ai.parsed && sum) {
    return {
      offerSummary: sum,
      painPoints: Array.isArray(ai.parsed.painPoints)
        ? ai.parsed.painPoints.map(String).slice(0, 3)
        : fb.painPoints,
      reasonsToContact: Array.isArray(ai.parsed.reasonsToContact)
        ? ai.parsed.reasonsToContact.map(String).slice(0, 3)
        : fb.reasonsToContact,
    };
  }
  if (ai.ok) logger.warn("Offer: ответ OpenAI без offerSummary, шаблон");
  return fb;
}

module.exports = {
  buildOffer,
  fallbackOffer,
};
