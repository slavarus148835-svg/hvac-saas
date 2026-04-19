import dotenv from "dotenv";
import fetch from "node-fetch";
import fs from "fs-extra";
import path from "node:path";
import { createLogger } from "./shared/logger.js";
import { RESULTS_DIR, ensureStoreDirs } from "./shared/task-store.js";

dotenv.config();

const logger = createLogger("telegram");
const TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
const CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || "").trim();
const BRIDGE_BASE = `http://127.0.0.1:${Number(process.env.BRIDGE_PORT || 3031)}`;

const ROOT = path.resolve(".");
const RUNTIME_DIR = path.join(ROOT, "runtime");
const STATE_FILE = path.join(RUNTIME_DIR, "telegram-bot-state.json");
const RESULTS_SCAN_MS = 5000;
const TELEGRAM_POLL_TIMEOUT_S = 25;

if (process.stdout && typeof process.stdout.on === "function") {
  process.stdout.on("error", () => {});
}
if (process.stderr && typeof process.stderr.on === "function") {
  process.stderr.on("error", () => {});
}

ensureStoreDirs();
fs.ensureDirSync(RUNTIME_DIR);

if (!TOKEN || !CHAT_ID) {
  logger.error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in .env");
  process.exit(1);
}

const state = loadState();
if (!state.resultsBootstrapped) {
  bootstrapResultsState();
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return { offset: 0, sentResults: {}, resultsBootstrapped: false };
    }
    const parsed = fs.readJsonSync(STATE_FILE);
    return {
      offset: Number(parsed.offset || 0),
      sentResults: parsed.sentResults && typeof parsed.sentResults === "object" ? parsed.sentResults : {},
      resultsBootstrapped: parsed.resultsBootstrapped === true,
    };
  } catch (error) {
    logger.error(`state read failed: ${error?.message || String(error)}`);
    return { offset: 0, sentResults: {}, resultsBootstrapped: false };
  }
}

function saveState() {
  try {
    fs.writeJsonSync(STATE_FILE, state, { spaces: 2 });
  } catch (error) {
    logger.error(`state write failed: ${error?.message || String(error)}`);
  }
}

function bootstrapResultsState() {
  try {
    const files = fs
      .readdirSync(RESULTS_DIR)
      .filter((name) => name.endsWith(".json"))
      .map((name) => path.basename(name, ".json"));
    for (const id of files) {
      state.sentResults[id] = true;
    }
    state.resultsBootstrapped = true;
    saveState();
    logger.info(`results bootstrap complete: ${files.length} existing files marked`);
  } catch (error) {
    logger.error(`results bootstrap failed: ${error?.message || String(error)}`);
  }
}

async function telegramApi(method, payload) {
  const url = `https://api.telegram.org/bot${TOKEN}/${method}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) {
      throw new Error(body?.description || `telegram HTTP ${res.status}`);
    }
    return body.result;
  } catch (error) {
    logger.error(`telegram api ${method} failed: ${error?.message || String(error)}`);
    return null;
  }
}

async function sendTelegramMessage(text) {
  const msg = String(text || "").trim();
  if (!msg) return false;
  const result = await telegramApi("sendMessage", {
    chat_id: CHAT_ID,
    text: msg.slice(0, 4090),
  });
  return !!result;
}

async function createBridgeTask(promptText) {
  try {
    const res = await fetch(`${BRIDGE_BASE}/task`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: promptText,
        source: "telegram",
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body?.error || `bridge HTTP ${res.status}`);
    }
    return body;
  } catch (error) {
    logger.error(`bridge task create failed: ${error?.message || String(error)}`);
    return null;
  }
}

async function handleUpdate(update) {
  const message = update?.message;
  if (!message || typeof message.text !== "string") return;

  const chatId = String(message?.chat?.id ?? "");
  if (chatId !== CHAT_ID) return;
  if (message?.from?.is_bot) return;

  const prompt = message.text.trim();
  if (!prompt) return;

  const task = await createBridgeTask(prompt);
  if (!task?.id) {
    await sendTelegramMessage("Не удалось создать задачу, попробуйте позже.");
    return;
  }

  logger.info(`task created from telegram update=${update.update_id} id=${task.id}`);
  await sendTelegramMessage("Задача принята в обработку");
}

async function pollTelegram() {
  const updates = await telegramApi("getUpdates", {
    timeout: TELEGRAM_POLL_TIMEOUT_S,
    offset: state.offset,
    allowed_updates: ["message"],
  });

  if (!Array.isArray(updates) || updates.length === 0) return;
  for (const update of updates) {
    try {
      await handleUpdate(update);
    } catch (error) {
      logger.error(`update handler failed: ${error?.message || String(error)}`);
    } finally {
      state.offset = Math.max(state.offset, Number(update.update_id || 0) + 1);
      saveState();
    }
  }
}

function buildSummary(result) {
  const summary =
    result?.result?.summary ||
    result?.summary ||
    result?.errorText ||
    (result?.ok === false ? "Задача завершилась с ошибкой." : "Задача выполнена.");
  return String(summary || "Задача выполнена.").slice(0, 3500);
}

async function sendNewResults() {
  let files = [];
  try {
    files = fs
      .readdirSync(RESULTS_DIR)
      .filter((name) => name.endsWith(".json"))
      .map((name) => path.join(RESULTS_DIR, name))
      .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
  } catch (error) {
    logger.error(`results scan failed: ${error?.message || String(error)}`);
    return;
  }

  for (const filePath of files) {
    const taskId = path.basename(filePath, ".json");
    if (state.sentResults[taskId]) continue;

    try {
      const result = fs.readJsonSync(filePath);
      const text = `✅ Готово:\n\n${buildSummary(result)}`;
      const sent = await sendTelegramMessage(text);
      if (!sent) {
        logger.warn(`result ${taskId} was not sent to telegram`);
        continue;
      }
      state.sentResults[taskId] = true;
      saveState();
      logger.info(`result sent to telegram task=${taskId}`);
    } catch (error) {
      logger.error(`result send failed ${taskId}: ${error?.message || String(error)}`);
    }
  }
}

async function start() {
  logger.info(`telegram bot started; bridge=${BRIDGE_BASE}; chat=${CHAT_ID}`);
  setInterval(() => {
    sendNewResults().catch((error) => logger.error(`results timer failed: ${error?.message || String(error)}`));
  }, RESULTS_SCAN_MS);

  while (true) {
    await pollTelegram();
  }
}

start().catch((error) => {
  logger.error(`fatal telegram bot error: ${error?.message || String(error)}`);
});
