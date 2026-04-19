const logger = require("./logger");

const TELEGRAM_MAX = 3900;

function chunkMessage(text) {
  const s = String(text || "");
  if (s.length <= TELEGRAM_MAX) return [s];
  const parts = [];
  let i = 0;
  while (i < s.length) {
    parts.push(s.slice(i, i + TELEGRAM_MAX));
    i += TELEGRAM_MAX;
  }
  return parts;
}

async function sendStructured(bot, chatId, text) {
  const chunks = chunkMessage(text);
  for (const c of chunks) {
    try {
      await bot.sendMessage(chatId, c, { disable_web_page_preview: true });
    } catch (e) {
      logger.warn("Telegram sendMessage", String(e.message || e));
      try {
        await bot.sendMessage(
          chatId,
          "Не удалось отправить ответ целиком (ошибка Telegram). Попробуйте ещё раз или сократите запрос.",
          { disable_web_page_preview: true }
        );
      } catch (e2) {
        logger.error("Telegram fallback send failed", String(e2.message || e2));
      }
      break;
    }
  }
}

module.exports = {
  chunkMessage,
  sendStructured,
};
