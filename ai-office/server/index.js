const path = require("path");
const config = require("./config");
const logger = require("./services/logger");
const storage = require("./services/storage");

function exitNoTelegram() {
  logger.error("Не задан TELEGRAM_BOT_TOKEN в .env");
  logger.error("Скопируйте .env.example в .env и вставьте токен от @BotFather.");
  process.exit(1);
}

(async function main() {
  try {
    await storage.ensureDataFiles();
    logger.info(`Старт Revenue PRO cwd=${path.join(__dirname, "..")}`);
    logger.info("Данные: каталог data проверен");
    logger.info(
      `Режим Places: ${config.googlePlacesApiKey ? "live" : "demo (без GOOGLE_PLACES_API_KEY)"}`
    );
    console.log(
      `[AI OFFICE] Google Places: ${config.googlePlacesApiKey ? "live mode" : "demo mode"}`
    );
    logger.info(`Режим OpenAI: ${config.openaiApiKey ? "live" : "шаблоны (без OPENAI_API_KEY)"}`);

    if (!config.telegramToken) {
      exitNoTelegram();
      return;
    }

    const TelegramBot = require("node-telegram-bot-api");
    const orchestrator = require("./orchestrator");
    const telegram = require("./services/telegram");

    let bot;
    try {
      bot = new TelegramBot(config.telegramToken, { polling: true });
    } catch (e) {
      logger.error("Telegram: ошибка инициализации", String(e.message || e));
      process.exit(1);
      return;
    }

    bot.on("message", async (msg) => {
      const text = msg.text;
      if (!text || !text.startsWith("/")) return;
      const chatId = msg.chat.id;
      const head = String(text.split(/\s+/)[0] || "").split("@")[0];
      const who = msg.from && msg.from.username ? `@${msg.from.username}` : String(msg.from && msg.from.id || "");
      logger.info(`Команда ${head} chat=${chatId} ${who}`);
      let reply;
      try {
        reply = await orchestrator.handleMessage(text, chatId);
      } catch (e) {
        logger.warn("Ошибка обработчика", String(e.message || e));
        reply = "Внутренняя ошибка. Повторите позже или /start";
      }
      if (reply) {
        await telegram.sendStructured(bot, chatId, reply);
      }
    });

    bot.on("polling_error", (err) => {
      const code = err && err.code;
      const msg = err && err.message ? err.message : String(err);
      logger.warn("Telegram polling", code ? `${code} ${msg}` : msg);
    });

    logger.info("Бот", "polling запущен");
  } catch (e) {
    logger.error("Фатальная ошибка старта", String(e.message || e));
    process.exit(1);
  }
})();
