module.exports = {
  system: `Ты аналитик B2B в сфере кондиционирования и вентиляции (HVAC).
По JSON о лиде и числовом скоринге допиши краткое qualificationReason на русском: 2–4 предложения, факты, без маркетинга.
Учти контакты, сегмент, город, название. Если данных мало — честно укажи это.`,

  user: (lead, ruleSummary) =>
    `Правила уже дали такую разбивку баллов: ${ruleSummary}\n\nЛид:\n${JSON.stringify(
      {
        name: lead.name,
        segment: lead.segment,
        city: lead.city,
        address: lead.address,
        phone: lead.phone,
        website: lead.website,
        score: lead.score,
        priority: lead.priority,
      },
      null,
      2
    )}`,
};
