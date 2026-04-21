import type { StatsReport, StatsReportPeriod } from "@/lib/server/getStatsReport";

function periodTitleRu(period: StatsReportPeriod): string {
  if (period === "today") return "📊 Отчёт за сегодня";
  if (period === "yesterday") return "📊 Отчёт за вчера";
  if (period === "week") return "📊 Отчёт за неделю";
  return "📊 Отчёт за месяц";
}

export function buildTelegramStatsReportText(
  period: StatsReportPeriod,
  stats: StatsReport
): string {
  const { registrations, paid, conversion } = stats;
  return [
    periodTitleRu(period),
    "",
    `👥 Регистрации: ${registrations}`,
    `💰 Оплатили: ${paid}`,
    `📈 Конверсия: ${conversion}%`,
  ].join("\n");
}
