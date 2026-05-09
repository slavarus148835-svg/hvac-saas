import {
  buildFunnelTelegramBlock,
  getFunnelStats,
} from "@/lib/server/getFunnelStats";
import { buildTrialStatsTelegramBlock, getTrialStats } from "@/lib/server/getTrialStats";
import type { StatsReportPeriod } from "@/lib/server/getStatsReport";
import { getReport } from "@/lib/server/getStatsReport";

export type FullStatsTopPeriod = Extract<
  StatsReportPeriod,
  "yesterday" | "today" | "week"
>;

function fmtPct(value: number): string {
  return `${value.toFixed(2)}%`;
}

/**
 * Полный текст как у команды /stat: блок «вчера/сегодня/неделя» + триалы + воронка.
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

  const convTop = fmtPct(report.conversion);

  const header = [
    `👥 Регистрации: ${report.registrations}`,
    `💰 Оплатили: ${report.paid}`,
    `📈 Конверсия: ${convTop}`,
  ].join("\n");

  const trialBlock = buildTrialStatsTelegramBlock(trial);
  const funnelBlock = buildFunnelTelegramBlock(funnel);

  return [header, "", trialBlock, "", funnelBlock].join("\n");
}
