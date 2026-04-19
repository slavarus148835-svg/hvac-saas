const https = require("https");
const {
  recordTelegramEvent,
  recordTelegramError,
  formatErrDetail,
} = require("./telegramDebug");

function requestJson(url, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const request = https.request(
      url,
      {
        method,
        headers: payload
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload),
            }
          : {},
      },
      (response) => {
        let data = "";
        response.on("data", (chunk) => {
          data += chunk;
        });
        response.on("end", () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            resolve(parsed);
          } catch (error) {
            reject(new Error(`Telegram response parse error: ${error.message}`));
          }
        });
      }
    );

    request.on("error", (error) => {
      reject(error);
    });

    if (payload) {
      request.write(payload);
    }
    request.end();
  });
}

/** Long polling: любое входящее сообщение → ответ «Бот работает». Нужен только TELEGRAM_BOT_TOKEN. */
function startTelegramBot(config) {
  const { token, logger = console } = config || {};

  if (!token) {
    recordTelegramEvent("telegram bot not started: missing token");
    return {
      enabled: false,
      stop() {},
    };
  }

  recordTelegramEvent("telegram bot started (minimal echo, long polling)");
  logger.log("[telegram] bot started — minimal echo mode");

  const baseUrl = `https://api.telegram.org/bot${token}`;
  let offset = 0;
  let stopped = false;

  async function sendMessage(chatId, text, contextLabel) {
    const label = contextLabel || "reply";
    try {
      const data = await requestJson(`${baseUrl}/sendMessage`, "POST", {
        chat_id: chatId,
        text: String(text || "").slice(0, 4000),
      });
      if (data && data.ok) {
        recordTelegramEvent(`telegram reply sent (${label})`);
        logger.log(`[telegram] telegram reply sent (${label})`);
        return { ok: true, data };
      }
      const desc = data && data.description ? data.description : "unknown API error";
      recordTelegramError(`telegram reply failed (${label}): ${desc}`, {
        context: label,
        telegramDescription: desc,
        errorCode: data && data.error_code,
      });
      logger.error(`[telegram] telegram reply failed (${label}): ${desc}`);
      return { ok: false, error: desc };
    } catch (error) {
      const detail = formatErrDetail(error) || "unknown error";
      recordTelegramError(`telegram reply failed (${label}): ${detail}`, {
        context: label,
      });
      logger.error(`[telegram] telegram reply failed (${label}): ${detail}`);
      return { ok: false, error: detail };
    }
  }

  async function handleMessage(message) {
    if (!message || typeof message !== "object") return;
    const chatId = message.chat && message.chat.id;
    if (chatId == null) return;

    recordTelegramEvent("message received");
    logger.log(`[telegram] message chat_id=${chatId}`);

    await sendMessage(chatId, "Бот работает", "echo");
  }

  async function poll() {
    if (stopped) return;
    try {
      const data = await requestJson(
        `${baseUrl}/getUpdates?timeout=25&offset=${offset}`,
        "GET"
      );
      if (data && data.ok === false) {
        const desc = data.description || "getUpdates failed";
        recordTelegramError(`getUpdates: ${desc}`, { errorCode: data.error_code });
        logger.error(`[telegram] getUpdates failed: ${desc}`);
      }
      const updates = Array.isArray(data?.result) ? data.result : [];
      for (const update of updates) {
        const updateId = Number(update?.update_id || 0);
        if (updateId >= offset) {
          offset = updateId + 1;
        }
        try {
          await handleMessage(update?.message);
        } catch (loopErr) {
          const detail = formatErrDetail(loopErr);
          recordTelegramError(`handleMessage failed: ${detail}`, {});
          logger.error(`[telegram] handleMessage failed: ${detail}`);
        }
      }
    } catch (error) {
      const detail = formatErrDetail(error);
      recordTelegramError(`telegram polling error: ${detail}`, {});
      logger.error(`[telegram] telegram polling error: ${detail}`);
    } finally {
      setTimeout(poll, 1200);
    }
  }

  (async function bootTelegram() {
    try {
      const me = await requestJson(`${baseUrl}/getMe`, "GET");
      if (me && me.ok) {
        const username = me.result && me.result.username ? `@${me.result.username}` : "bot";
        recordTelegramEvent(`getMe ok ${username}`);
        logger.log(`[telegram] telegram bot token ok (${username})`);
      } else {
        const desc = me && me.description ? me.description : "unknown";
        recordTelegramError(`getMe failed: ${desc}`, { errorCode: me && me.error_code });
        logger.error(`[telegram] telegram getMe failed: ${desc}`);
      }
    } catch (error) {
      const detail = formatErrDetail(error);
      recordTelegramError(`getMe error: ${detail}`, {});
      logger.error(`[telegram] telegram getMe error: ${detail}`);
    }
    recordTelegramEvent("telegram bot polling loop starting");
    logger.log("[telegram] telegram bot polling started");
    poll();
  })();

  return {
    enabled: true,
    stop() {
      stopped = true;
      recordTelegramEvent("telegram bot polling stopped");
      logger.log("[telegram] telegram bot polling stopped");
    },
  };
}

async function sendTelegramText({ token, chatId, text, logger = console, context = "push" }) {
  if (!token || chatId == null || chatId === "") return { ok: false, error: "missing token or chat" };
  const baseUrl = `https://api.telegram.org/bot${token}`;
  try {
    const data = await requestJson(`${baseUrl}/sendMessage`, "POST", {
      chat_id: chatId,
      text: String(text || "").slice(0, 4000),
    });
    if (data && data.ok) {
      recordTelegramEvent(`telegram reply sent (${context})`);
      logger.log(`[telegram] telegram reply sent (${context})`);
      return { ok: true, data };
    }
    const desc = data && data.description ? data.description : "unknown API error";
    recordTelegramError(`telegram reply failed (${context}): ${desc}`, {
      context,
      telegramDescription: desc,
      errorCode: data && data.error_code,
    });
    logger.error(`[telegram] telegram reply failed (${context}): ${desc}`);
    return { ok: false, error: desc };
  } catch (error) {
    const detail = formatErrDetail(error) || "unknown error";
    recordTelegramError(`telegram reply failed (${context}): ${detail}`, { context });
    logger.error(`[telegram] telegram reply failed (${context}): ${detail}`);
    return { ok: false, error: detail };
  }
}

function buildTelegramExecutionBody(task, statusLabel, errorText) {
  const goal = task.goal || task.title || "—";
  const lines = [`задача: ${goal}`, `статус: ${statusLabel}`];
  const res = task.result && typeof task.result === "object" ? task.result : {};
  const summary = typeof res.summary === "string" && res.summary.trim() ? res.summary.trim() : "—";
  lines.push(`summary: ${summary}`);
  if (Array.isArray(res.changedFiles) && res.changedFiles.length > 0) {
    const preview = res.changedFiles.slice(0, 5).join(", ");
    lines.push(`файлы: ${preview}${res.changedFiles.length > 5 ? " …" : ""}`);
  }
  if (statusLabel === "error" && errorText) {
    lines.push(`ошибка: ${String(errorText).slice(0, 1500)}`);
  }
  return lines.join("\n");
}

/**
 * Sends a formatted update to the user chat for tasks created from Telegram.
 * @param {"execution_done"|"execution_error"|"revise"} kind
 */
async function sendTelegramTaskUpdate(task, kind, options = {}) {
  const logger = options.logger || console;
  if (!task || task.source !== "telegram" || !task.telegramChatId) return;
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) return;

  const chatId = String(task.telegramChatId);

  if (kind === "revise") {
    await sendTelegramText({
      token,
      chatId,
      text: "Задача отправлена на доработку",
      logger,
      context: "revise_notice",
    });
    return;
  }

  if (kind === "execution_error") {
    const err = options.errorText || "Неизвестная ошибка";
    const goal = task.goal || task.title || "—";
    const text = [
      `задача: ${goal}`,
      `статус: error`,
      `summary: —`,
      `ошибка: ${String(err).slice(0, 1500)}`,
    ].join("\n");
    await sendTelegramText({ token, chatId, text, logger, context: "execution_error" });
    return;
  }

  if (kind === "execution_done") {
    const text = buildTelegramExecutionBody(task, "done", null);
    await sendTelegramText({ token, chatId, text, logger, context: "execution_done" });
  }
}

module.exports = {
  startTelegramBot,
  sendTelegramText,
  sendTelegramTaskUpdate,
};
