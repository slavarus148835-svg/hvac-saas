import type { AuthProviderStats } from "@/lib/server/authProviderStats";
import type { FunnelStats } from "@/lib/server/getFunnelStats";
import type { TrialStats } from "@/lib/server/getTrialStats";
import { formatRubForTelegram } from "@/lib/server/statsPaidUser";
import type { TelegramAudienceStats } from "@/lib/server/telegramAudience";

export type AdminStatBlocks = {
  trial: TrialStats;
  funnel: FunnelStats;
  auth: AuthProviderStats;
  tg: TelegramAudienceStats;
};

/** Текст ответа бота на /stat (админ). */
export function buildExtendedAdminStatMessage(p: AdminStatBlocks): string {
  const { trial, funnel, auth, tg } = p;
  return [
    "📊 Статистика",
    "",
    "👥 Пользователи",
    `• Всего: ${auth.totalUsers}`,
    `• Telegram: ${auth.telegramUsers}`,
    `• Email: ${auth.emailUsers}`,
    `• Unknown: ${auth.unknownUsers}`,
    "",
    "📊 Воронка — всего по базе",
    `• Всего пользователей: ${funnel.totalUsers}`,
    `• Сделали расчёт: ${funnel.usersWithCalculation}`,
    `• Дошли до конца триала: ${funnel.endedTrialUsers}`,
    `• Реально оплатили: ${funnel.paidUsers}`,
    `• Имеют доступ: ${funnel.accessPaidUsers}`,
    `• 💳 Активных подписок: ${funnel.activeConfirmedBankSubscriptions}`,
    `• 💸 MRR: ${formatRubForTelegram(funnel.mrrRub)}`,
    `• 📈 ARPU: ${formatRubForTelegram(funnel.arpuRub)}`,
    "",
    "Конверсии:",
    `• Регистрация → Расчёт: ${funnel.conversionSignupToCalc}%`,
    `• Конец триала → Оплата: ${funnel.conversionTrialEndToPaid}%`,
    `• Активация: ${funnel.conversionSignupToCalc}% сделали первый расчёт`,
    "",
    "📊 Триалы — всего по базе",
    `• Активный триал: ${trial.activeTrialUsers}`,
    `• Триал закончился: ${trial.endedTrialUsers}`,
    `• Закончился без оплаты: ${trial.endedWithoutPaymentUsers}`,
    `• Реально оплатили после конца триала: ${trial.endedTrialConfirmedBankPaidUsers}`,
    `• Имеют доступ: ${trial.accessPaidUsers}`,
    `• Конверсия конца триала в оплату: ${trial.conversionPercent.toFixed(2)}%`,
    "",
    "📲 Telegram",
    `• Есть Telegram ID: ${auth.telegramUsers}`,
    `• Есть chat_id: ${tg.usersWithTelegramChatId}`,
    `• Можно писать: ${tg.uniqueBroadcastTargets}`,
  ].join("\n");
}
