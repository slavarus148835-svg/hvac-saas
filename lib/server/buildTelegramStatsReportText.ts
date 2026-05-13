import {
  type StatsReport,
  type StatsReportPeriod,
  statsReportPeriodSuffixRu,
  statsReportPeriodTitleRu,
} from "@/lib/server/getStatsReport";

export function buildTelegramStatsReportText(
  period: StatsReportPeriod,
  stats: StatsReport
): string {
  const { registrations, paid, conversion, activePaidAccess } = stats;
  const suf = statsReportPeriodSuffixRu(period);
  return [
    statsReportPeriodTitleRu(period),
    "",
    `👥 Регистрации ${suf}: ${registrations}`,
    `💰 Оплаты ${suf}: ${paid}`,
    `🔓 Имеют доступ (сейчас): ${activePaidAccess}`,
    `📈 Конверсия ${suf}: ${conversion}%`,
  ].join("\n");
}
