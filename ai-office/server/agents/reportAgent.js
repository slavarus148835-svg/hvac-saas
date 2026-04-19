function countPriority(leads) {
  const c = { A: 0, B: 0, C: 0, D: 0 };
  for (const l of leads) {
    const p = l.priority || "D";
    if (c[p] === undefined) c.D += 1;
    else c[p] += 1;
  }
  return c;
}

function formatPipelineReport({ city, segment, leads, demo }) {
  const pri = countPriority(leads);
  const top = [...leads]
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
    .slice(0, 5);

  const lines = [];
  lines.push("Итог pipeline");
  lines.push(`Город: ${city} | Сегмент: ${segment}`);
  if (demo) {
    lines.push("Google Places: demo mode");
    lines.push("Реальные лиды: задайте GOOGLE_PLACES_API_KEY (launch при старте или .env).");
  } else {
    lines.push("Google Places: live mode");
  }
  lines.push("");
  lines.push(`Лидов: ${leads.length} | A/B/C/D: ${pri.A}/${pri.B}/${pri.C}/${pri.D}`);
  lines.push("");
  lines.push("Топ-5");
  top.forEach((l, idx) => {
    lines.push(`${idx + 1}) ${l.name}`);
    lines.push(`   ${l.segment} | ${l.score} ${l.priority} | ${l.phone || "—"} | ${l.website || "—"}`);
    const why = (l.qualificationReason || "").split("\n")[0].slice(0, 160);
    lines.push(`   ${why || "—"}`);
    lines.push("");
  });
  lines.push("Дальше: /shortlist → /compose 1");
  return lines.join("\n");
}

module.exports = {
  formatPipelineReport,
  countPriority,
};
