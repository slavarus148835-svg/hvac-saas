import type { Firestore } from "firebase-admin/firestore";
import { getPartnerSiteOrigin } from "@/lib/partner/constants";
import {
  buildPartnerRecentEventsLinesForAdmin,
  getAllPartnerManagersStats,
  getPartnerManagerByCode,
  getPartnerManagerByTelegramUserId,
  getPartnerManagerStats,
  listPartnerClientsForManager,
  listPartnerPayoutsForManager,
  normalizePartnerManagerCode,
  setPartnerManagerActiveByCode,
  type PartnerManagerStats,
} from "@/lib/server/partnerManager/partnerManagerB2b";
import {
  answerTelegramCallbackQuery,
  editTelegramMessageText,
  sendTelegramMessage,
  type SendTelegramMessageOptions,
} from "@/lib/server/sendTelegramMessage";

function kopToRubStr(kop: number): string {
  const k = Math.round(Number(kop) || 0);
  return (k / 100).toFixed(2);
}

function formatDdMm(ms: number): string {
  if (!ms || ms <= 0) return "—";
  return new Date(ms).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" });
}

export const partnerCabinetInlineKeyboard: NonNullable<
  SendTelegramMessageOptions["replyMarkup"]
> = {
  inline_keyboard: [
    [{ text: "📊 Статистика", callback_data: "partner_stats" }],
    [{ text: "🔗 Мои ссылки", callback_data: "partner_links" }],
    [{ text: "👥 Мои клиенты", callback_data: "partner_clients" }],
    [{ text: "💰 Выплаты", callback_data: "partner_payouts" }],
  ],
};

export function buildPartnerCabinetText(st: PartnerManagerStats): string {
  const pending = Math.max(0, st.commissionAccruedKop - st.commissionPaidOutKop);
  return [
    "📊 Партнёрский кабинет",
    "",
    `Ваш код: ${st.code}`,
    "",
    `Регистрации: ${st.registrations}`,
    `Сделали первый расчёт: ${st.firstCalculations}`,
    `Оплатили: ${st.payments}`,
    "",
    `Начислено: ${kopToRubStr(st.commissionAccruedKop)} ₽`,
    `Выплачено: ${kopToRubStr(st.commissionPaidOutKop)} ₽`,
    `Ожидает выплаты: ${kopToRubStr(pending)} ₽`,
  ].join("\n");
}

function pct(part: number, whole: number): string {
  if (!whole || whole <= 0) return "0";
  return ((100 * part) / whole).toFixed(1);
}

function buildPartnerStatsExtendedText(st: PartnerManagerStats): string {
  const pending = Math.max(0, st.commissionAccruedKop - st.commissionPaidOutKop);
  return [
    "📊 Ваша статистика",
    "",
    `Регистрации: ${st.registrations}`,
    `Сделали первый расчёт: ${st.firstCalculations}`,
    `Оплатили: ${st.payments}`,
    "",
    `Конверсия регистрация → расчёт: ${pct(st.firstCalculations, st.registrations)}%`,
    `Конверсия регистрация → оплата: ${pct(st.payments, st.registrations)}%`,
    "",
    `Начислено: ${kopToRubStr(st.commissionAccruedKop)} ₽`,
    `Выплачено: ${kopToRubStr(st.commissionPaidOutKop)} ₽`,
    `Ожидает выплаты: ${kopToRubStr(pending)} ₽`,
  ].join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Значение HTML-атрибута href (кавычки и &). */
function escapeHtmlAttrHref(url: string): string {
  return url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function telegramBotUsername(): string {
  return String(process.env.TELEGRAM_BOT_USERNAME || "")
    .trim()
    .replace(/^@+/, "");
}

/**
 * Продающий текст + персональная web/Mini App ссылка (HTML для Telegram).
 */
export function buildPartnerSellingMessageHtml(code: string): {
  html: string;
  webUrl: string;
  miniUrl: string | null;
} {
  const origin = getPartnerSiteOrigin().replace(/\/+$/, "");
  const webUrl = `${origin}/?partner=${encodeURIComponent(code)}`;
  const bot = telegramBotUsername();
  const miniUrl = bot ? `https://t.me/${bot}/app?startapp=partner_${code}` : null;

  const webVisible = escapeHtml(webUrl);
  const webHref = escapeHtmlAttrHref(webUrl);

  const body: string[] = [
    "<b>🔥 HVAC-SAAS — калькулятор для монтажников кондиционеров</b>",
    "",
    "Помогает:",
    "— быстро делать расчёты",
    "— не терять деньги на мелочах",
    "— выглядеть профессионально перед клиентом",
    "— отправлять клиенту грамотно оформленный расчёт прямо из кабинета",
    "",
    "Попробовать:",
    `<a href="${webHref}">${webVisible}</a>`,
  ];

  if (miniUrl) {
    const miniVis = escapeHtml(miniUrl);
    const miniHref = escapeHtmlAttrHref(miniUrl);
    body.push("", "<b>📲 Mini App:</b>", `<a href="${miniHref}">${miniVis}</a>`);
  } else {
    body.push("", "<i>Mini App: задайте TELEGRAM_BOT_USERNAME в окружении сервера.</i>");
  }

  return { html: body.join("\n"), webUrl, miniUrl };
}

export function buildPartnerLinksUrlReplyMarkup(
  webUrl: string,
  miniUrl: string | null
): NonNullable<SendTelegramMessageOptions["replyMarkup"]> {
  const rows: NonNullable<SendTelegramMessageOptions["replyMarkup"]>["inline_keyboard"] = [
    [{ text: "🌐 Открыть веб-версию", url: webUrl }],
  ];
  if (miniUrl) {
    rows.push([{ text: "📲 Открыть Mini App", url: miniUrl }]);
  }
  return { inline_keyboard: rows };
}

export async function buildPartnerClientsText(
  db: Firestore,
  managerId: string
): Promise<string> {
  const rows = await listPartnerClientsForManager(db, managerId, 10, {
    maskClientPrivacy: true,
  });
  if (!rows.length) {
    return ["👥 Мои клиенты", "", "Пока нет закреплённых клиентов."].join("\n");
  }
  const lines = rows.map((r, i) => {
    const d = formatDdMm(r.dateMs);
    return `${i + 1}. ${r.displayLine}\nСтатус: ${r.statusLine}\nДата: ${d}`;
  });
  return ["👥 Мои клиенты", "", ...lines].join("\n\n");
}

export async function buildPartnerPayoutsText(
  db: Firestore,
  managerId: string,
  st: PartnerManagerStats
): Promise<string> {
  const pending = Math.max(0, st.commissionAccruedKop - st.commissionPaidOutKop);
  const payouts = await listPartnerPayoutsForManager(db, managerId, 5);
  const head = [
    "💰 Выплаты",
    "",
    `Начислено: ${kopToRubStr(st.commissionAccruedKop)} ₽`,
    `Выплачено: ${kopToRubStr(st.commissionPaidOutKop)} ₽`,
    `Ожидает выплаты: ${kopToRubStr(pending)} ₽`,
  ];
  if (!payouts.length) {
    return [...head, "", "История выплат пока пуста."].join("\n");
  }
  const plines = payouts.map((p, i) => {
    const d = formatDdMm(p.createdAtMs);
    const note = p.note ? ` — ${p.note}` : "";
    return `${i + 1}. ${p.amountRub.toFixed(2)} ₽ (${d})${note}`;
  });
  return [...head, "", "Последние выплаты:", ...plines].join("\n");
}

export async function sendPartnerCabinet(
  db: Firestore,
  chatId: string,
  fromTelegramUserId: number
): Promise<void> {
  const mgr = await getPartnerManagerByTelegramUserId(db, fromTelegramUserId);
  if (!mgr) {
    await sendTelegramMessage(
      chatId,
      "Вы не зарегистрированы как B2B-партнёр. Обратитесь к администратору."
    );
    return;
  }
  const st = await getPartnerManagerStats(db, mgr.id);
  if (!st) {
    await sendTelegramMessage(chatId, "Не удалось загрузить статистику.");
    return;
  }
  await sendTelegramMessage(chatId, buildPartnerCabinetText(st), {
    replyMarkup: partnerCabinetInlineKeyboard,
  });
}

export async function handlePartnerManagerCallback(params: {
  db: Firestore;
  callbackQueryId: string;
  fromTelegramUserId: number;
  chatId: number;
  messageId: number;
  data: string;
}): Promise<void> {
  const allowed = new Set([
    "partner_stats",
    "partner_links",
    "partner_clients",
    "partner_payouts",
  ]);
  if (!allowed.has(params.data)) return;

  const mgr = await getPartnerManagerByTelegramUserId(
    params.db,
    params.fromTelegramUserId
  );
  if (!mgr) {
    await answerTelegramCallbackQuery(params.callbackQueryId);
    return;
  }

  const st = await getPartnerManagerStats(params.db, mgr.id);
  if (!st) {
    await answerTelegramCallbackQuery(params.callbackQueryId);
    await sendTelegramMessage(
      String(params.chatId),
      "Не удалось загрузить статистику."
    );
    return;
  }

  await answerTelegramCallbackQuery(params.callbackQueryId);

  if (params.data === "partner_links") {
    const { html, webUrl, miniUrl } = buildPartnerSellingMessageHtml(st.code);
    const replyMarkup = buildPartnerLinksUrlReplyMarkup(webUrl, miniUrl);
    const edit = await editTelegramMessageText(
      String(params.chatId),
      params.messageId,
      html,
      { replyMarkup, parseMode: "HTML" }
    );
    if (!edit.ok) {
      await sendTelegramMessage(String(params.chatId), html, {
        replyMarkup,
        parseMode: "HTML",
      });
    }
    return;
  }

  let text: string;
  switch (params.data) {
    case "partner_stats":
      text = buildPartnerStatsExtendedText(st);
      break;
    case "partner_clients":
      text = await buildPartnerClientsText(params.db, mgr.id);
      break;
    case "partner_payouts":
      text = await buildPartnerPayoutsText(params.db, mgr.id, st);
      break;
    default:
      return;
  }

  const edit = await editTelegramMessageText(
    String(params.chatId),
    params.messageId,
    text,
    { replyMarkup: partnerCabinetInlineKeyboard }
  );
  if (!edit.ok) {
    await sendTelegramMessage(String(params.chatId), text, {
      replyMarkup: partnerCabinetInlineKeyboard,
    });
  }
}

export function formatAdminPartnersListText(stats: PartnerManagerStats[]): string {
  const lines = stats.map((r, i) => {
    const pend = Math.max(0, r.commissionAccruedKop - r.commissionPaidOutKop);
    const active = r.active ? "да" : "нет";
    return [
      `${i + 1}. ${r.name}`,
      `Код: ${r.code}`,
      `Регистрации: ${r.registrations}`,
      `Расчёты: ${r.firstCalculations}`,
      `Оплаты: ${r.payments}`,
      `Начислено: ${kopToRubStr(r.commissionAccruedKop)} ₽`,
      `Ожидает выплаты: ${kopToRubStr(pend)} ₽`,
      `Активен: ${active}`,
    ].join("\n");
  });
  return [
    "📊 B2B менеджеры",
    "",
    ...lines,
    "",
    "Команды: /partner_detail CODE · /disable_partner CODE · /enable_partner CODE",
  ].join("\n\n");
}

export async function sendAdminPartnersList(
  db: Firestore,
  chatId: string
): Promise<void> {
  const all = await getAllPartnerManagersStats(db);
  if (!all.length) {
    await sendTelegramMessage(chatId, "Менеджеров пока нет.");
    return;
  }
  const body = formatAdminPartnersListText(all);
  const chunks = body.match(/[\s\S]{1,3800}/g) || [body];
  for (const c of chunks) {
    await sendTelegramMessage(chatId, c);
  }
}

export async function sendAdminPartnerDetail(
  db: Firestore,
  chatId: string,
  rawCode: string
): Promise<void> {
  const code = normalizePartnerManagerCode(rawCode);
  if (!code) {
    await sendTelegramMessage(chatId, "Укажите код: /partner_detail CODE");
    return;
  }
  const m = await getPartnerManagerByCode(db, code);
  if (!m) {
    await sendTelegramMessage(chatId, "Менеджер с таким кодом не найден.");
    return;
  }
  const st = await getPartnerManagerStats(db, m.id);
  if (!st) {
    await sendTelegramMessage(chatId, "Не удалось загрузить данные.");
    return;
  }
  const pend = Math.max(0, st.commissionAccruedKop - st.commissionPaidOutKop);
  const recent = await buildPartnerRecentEventsLinesForAdmin(db, m.id, 12);
  const lines = [
    `👤 Менеджер: ${st.name}`,
    `Код: ${st.code}`,
    `Telegram ID: ${m.data.telegramUserId}`,
    `Активен: ${st.active ? "да" : "нет"}`,
    "",
    `Регистрации: ${st.registrations}`,
    `Первые расчёты: ${st.firstCalculations}`,
    `Оплаты: ${st.payments}`,
    "",
    `Начислено: ${kopToRubStr(st.commissionAccruedKop)} ₽`,
    `Выплачено: ${kopToRubStr(st.commissionPaidOutKop)} ₽`,
    `Ожидает выплаты: ${kopToRubStr(pend)} ₽`,
    "",
    "Последние события:",
    ...(recent.length ? recent : ["—"]),
  ];
  await sendTelegramMessage(chatId, lines.join("\n"));
}

export async function sendAdminPartnerToggle(
  db: Firestore,
  chatId: string,
  rawCode: string,
  active: boolean
): Promise<void> {
  const code = normalizePartnerManagerCode(rawCode);
  if (!code) {
    await sendTelegramMessage(
      chatId,
      `Укажите код: /${active ? "enable" : "disable"}_partner CODE`
    );
    return;
  }
  const r = await setPartnerManagerActiveByCode(db, code, active);
  if (!r.ok) {
    await sendTelegramMessage(chatId, "Менеджер с таким кодом не найден.");
    return;
  }
  await sendTelegramMessage(
    chatId,
    active ? `Менеджер «${code}» включён.` : `Менеджер «${code}» отключён.`
  );
}

export function parseSlashPartnerAdminCode(
  textRaw: string,
  command: "/partner_detail" | "/disable_partner" | "/enable_partner"
): string | null {
  const parts = String(textRaw || "").trim().split(/\s+/);
  const head = (parts[0] || "").split("@")[0].toLowerCase();
  if (head !== command) return null;
  const code = parts[1]?.trim();
  return code || null;
}
