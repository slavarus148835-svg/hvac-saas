import type { AuthProviderStats } from "@/lib/server/authProviderStats";
import type { FunnelStats } from "@/lib/server/getFunnelStats";
import type { TrialStats } from "@/lib/server/getTrialStats";
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
    "📊 Воронка",
    `• Сделали расчёт: ${funnel.usersWithCalculation}`,
    `• Дошли до конца триала: ${funnel.endedTrialUsers}`,
    `• Оплатили: ${funnel.paidUsers}`,
    "",
    "Конверсии:",
    `• Регистрация → Расчёт: ${funnel.conversionSignupToCalc}%`,
    `• Расчёт → Триал закончился: ${funnel.conversionCalcToTrialEnd}%`,
    `• Триал → Оплата: ${funnel.conversionTrialEndToPaid}%`,
    "",
    "📊 Триалы",
    `• Активные: ${trial.activeTrialUsers}`,
    `• Закончились: ${trial.endedTrialUsers}`,
    `• Без оплаты: ${trial.endedWithoutPaymentUsers}`,
    "",
    "📲 Telegram",
    `• Есть Telegram ID: ${auth.telegramUsers}`,
    `• Есть chat_id: ${tg.usersWithTelegramChatId}`,
    `• Можно писать: ${tg.uniqueBroadcastTargets}`,
  ].join("\n");
}
