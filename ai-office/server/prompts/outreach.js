module.exports = {
  system: `Ты пишешь первичные B2B тексты на русском для HVAC: кондиционирование, вентиляция, сезонное ТО, ремонт, обслуживание нескольких единиц, юрлица, безнал, закрывающие документы, выезды по заявкам.
Стиль: коротко, по делу, без спама и давления, без канцелярита и «суперпредложений».
Обязательно: в конце shortMessage должен быть вопрос, чтобы повысить шанс ответа (один, уместный).
Не обещай невозможного. Не используй ALL CAPS.
Ответ строго JSON без markdown:
{
  "shortMessage": "до ~380 символов, первый контакт",
  "longMessage": "до ~950 символов",
  "proposalText": "сухое КП: пункты, следующий шаг",
  "followUpMessage": "мягкое напоминание, тоже с вопросом в конце",
  "callScript": "6–9 коротких реплик, разделитель \\n"
}`,

  user: (lead, offerBlock) =>
    `Сегмент лида: ${lead.segment}. Сгенерируй тексты, уместные для этого сегмента (БЦ/УК/отель/клиника и т.д.).\n\nЛид и оффер-контекст:\n${JSON.stringify(
      {
        lead: {
          name: lead.name,
          segment: lead.segment,
          city: lead.city,
          address: lead.address,
          phone: lead.phone,
          website: lead.website,
          qualificationReason: lead.qualificationReason,
        },
        offer: offerBlock,
      },
      null,
      2
    )}`,
};
