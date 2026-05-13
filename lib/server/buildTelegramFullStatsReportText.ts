import {
  buildFunnelTelegramBlock,
  getFunnelStats,
} from "@/lib/server/getFunnelStats";
import { buildTrialStatsTelegramBlock, getTrialStats } from "@/lib/server/getTrialStats";
import {
  getReport,
  statsReportPeriodSuffixRu,
  type StatsReportPeriod,
} from "@/lib/server/getStatsReport";
import { formatRubForTelegram } from "@/lib/server/statsPaidUser";

export type FullStatsTopPeriod = Extract<
  StatsReportPeriod,
  "yesterday" | "today" | "week"
>;

function fmtPct(value: number): string {
  return `${value.toFixed(2)}%`;
}

/**
 * Полный текст команды /stat: шапка — метрики `getReport` за выбранный период;
 * блоки «Всего», «Триалы», «Воронка» — накопительно по базе (`getFunnelStats` / `getTrialStats`).
 * Реальные оплаты: `userHasConfirmedBankPayment`; доступ: `isPaidUserForStatsTotals`.
 */
export async function buildTelegramFullStatsReportText(
  nowMs = Date.now(),
  opts?: { topPeriod?: FullStatsTopPeriod }
): Promise<string> {
  const topPeriod: FullStatsTopPeriod = opts?.topPeriod ?? "yesterday";

  const [report, trial, funnel] = await Promise.all([
    getReport(topPeriod),
    getTrialStats(nowMs),
    getFunnelStats(nowMs),
  ]);

  const suf = statsReportPeriodSuffixRu(topPeriod);
  const convTop = fmtPct(report.conversion);

  const header = [
    `👥 Регистрации ${suf}: ${report.registrations}`,
    `💰 Оплаты ${suf}: ${report.paid}`,
    `📈 Конверсия ${suf}: ${convTop}`,
  ].join("\n");

  const totalsBlock = [
    "📊 Всего",
    `• Всего пользователей: ${funnel.totalUsers}`,
    `• Реально оплатили: ${funnel.paidUsers}`,
    `• Имеют доступ: ${funnel.accessPaidUsers}`,
    `• 💳 Активных подписок: ${funnel.activeConfirmedBankSubscriptions}`,
    `• 💸 MRR: ${formatRubForTelegram(funnel.mrrRub)}`,
    `• 📈 ARPU: ${formatRubForTelegram(funnel.arpuRub)}`,
  ].join("\n");

  const trialBlock = buildTrialStatsTelegramBlock(trial);
  const funnelBlock = buildFunnelTelegramBlock(funnel);

  return [header, "", totalsBlock, "", trialBlock, "", funnelBlock].join("\n");
}
