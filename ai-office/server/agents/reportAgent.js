function countPriority(leads) {
  const c = { A: 0, B: 0, C: 0, D: 0 };
  for (const l of leads) {
    const p = l.priority || "D";
    if (c[p] === undefined) c.D += 1;
    else c[p] += 1;
  }
  return c;
}

function formatPipelineReport({ city, segment, leads, demo, mode }) {
  const pri = countPriority(leads);
  const top = [...leads]
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
    .slice(0, 5);

  const lines = [];
  lines.push("Итог pipeline");
  lines.push(`Город: ${city} | Сегмент: ${segment}`);
  if (mode === "google_places") {
    lines.push("Mode: google_places");
    lines.push("Google Places: enabled");
  } else if (mode === "serpapi") {
    lines.push("Mode: serpapi");
    lines.push("Google Places: disabled");
    if (demo) lines.push("Нет SERP_API_KEY: включен demo fallback.");
  } else if (mode === "yandex") {
    lines.push("Mode: yandex");
    lines.push("Google Places: disabled");
  } else if (mode === "demo") {
    lines.push("Mode: demo");
    lines.push("Google Places: disabled");
    lines.push("Веб-поиск не дал лидов: включен demo fallback.");
  } else {
    lines.push(`Mode: ${mode || "yandex"}`);
    lines.push(`Google Places: ${mode === "google_places" ? "enabled" : "disabled"}`);
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
