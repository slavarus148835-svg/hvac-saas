"use strict";

const path = require("path");
const fs = require("fs");
const chokidar = require("chokidar");
const dotenv = require("dotenv");
const fetch = require("node-fetch");

if (process.stdout && typeof process.stdout.on === "function") {
  process.stdout.on("error", () => {});
}
if (process.stderr && typeof process.stderr.on === "function") {
  process.stderr.on("error", () => {});
}

const projectRoot = path.resolve(__dirname, "..");
const envPath = path.join(projectRoot, ".env");
const logsDir = path.join(projectRoot, "logs");
const logFile = path.join(logsDir, "worker.log");

dotenv.config({ path: fs.existsSync(envPath) ? envPath : undefined });

const DEBOUNCE_MS = Math.max(500, Number(process.env.DEBOUNCE_MS) || 4000);
const watchRel = process.env.WATCH_PATH || ".";
const watchPath = path.resolve(projectRoot, watchRel);

const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
const chatId = String(process.env.TELEGRAM_CHAT_ID || "").trim();

function ensureLogsDir() {
  try {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
  } catch (_e) {
    // ignore
  }
}

function log(message) {
  ensureLogsDir();
  const line = `[${new Date().toISOString()}] ${String(message)}\n`;
  try {
    fs.appendFileSync(logFile, line, "utf8");
  } catch (_e) {
    // ignore — нет диска / прав
  }
}

function logError(err, context) {
  const ctx = context != null && context !== "" ? String(context) + ": " : "";
  let body;
  if (err instanceof Error) {
    body = err.stack || err.message || String(err);
  } else {
    body = typeof err === "string" ? err : JSON.stringify(err);
  }
  log(ctx + body);
}

function localTimeStr() {
  try {
    return new Date().toLocaleString("ru-RU", { hour12: false });
  } catch (_e) {
    return new Date().toISOString();
  }
}

function toDisplayPath(absPath) {
  const rel = path.relative(projectRoot, absPath);
  if (!rel || rel === "") return ".";
  return rel.split(path.sep).join("/");
}

async function safeSendTelegram(text) {
  if (!token || !chatId) {
    log("Telegram: пропущена отправка — нет TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID в .env");
    return;
  }
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: String(text).slice(0, 4090),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) {
      log("Telegram API error: " + JSON.stringify(data));
      return;
    }
    const mid = data.result && data.result.message_id;
    log("Telegram ok message_id=" + (mid != null ? mid : "?"));
  } catch (e) {
    logError(e, "Telegram send");
  }
}

/** @type {{ event: string, file: string }[]} */
let pending = [];
let debounceTimer = null;

function flushBatch() {
  debounceTimer = null;
  if (pending.length === 0) return;
  const lines = pending.map((p) => `* ${p.event}: ${p.file}`);
  pending = [];
  const body = [
    "🚀 Изменения в проекте",
    `Папка: ${projectRoot}`,
    "События:",
    "",
    ...lines,
    "",
    `Время: ${localTimeStr()}`,
  ].join("\n");
  void safeSendTelegram(body);
}

function scheduleFlush() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(flushBatch, DEBOUNCE_MS);
}

function enqueue(event, absPath) {
  const file = toDisplayPath(absPath);
  pending.push({ event, file });
  scheduleFlush();
}

const ignored = [
  "**/node_modules/**",
  "**/.git/**",
  "**/.next/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/*.log",
  "**/logs/**",
  "**/logs.txt",
  "**/_wout.txt",
  "**/_werr.txt",
  "**/.worker-out.txt",
  "**/.worker-err.txt",
];

log("Telegram autoworker: loading");
log("Watch path: " + watchPath + " | debounce ms: " + DEBOUNCE_MS);

void safeSendTelegram(
  `✅ Авто-воркер запущен\nПапка: ${projectRoot}\nВремя: ${localTimeStr()}`
);

const watcher = chokidar.watch(watchPath, {
  ignored,
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 },
});

const tracked = new Set(["add", "change", "unlink", "addDir", "unlinkDir"]);

watcher.on("all", (event, absPath) => {
  if (!tracked.has(event)) return;
  enqueue(event, absPath);
});

watcher.on("error", (err) => {
  logError(err, "chokidar");
  void safeSendTelegram(
    `❌ Ошибка watcher (chokidar)\n${String(err && err.message ? err.message : err)}\nВремя: ${localTimeStr()}`
  );
});

watcher.on("ready", () => {
  log("chokidar ready, watching: " + watchPath);
});

let isHandlingFatal = false;

async function notifyFatal(kind, err) {
  if (isHandlingFatal) {
    try {
      log("[notifyFatal re-entry suppressed] " + kind);
      logError(err, "re-entry");
    } catch (_e) {
      // ignore
    }
    return;
  }
  isHandlingFatal = true;
  try {
    logError(err, kind);
    await safeSendTelegram(
      `❌ ${kind}\n${String(err && err.stack ? err.stack : err && err.message ? err.message : err).slice(0, 3500)}\nВремя: ${localTimeStr()}`
    );
  } catch (e) {
    try {
      logError(e, "notifyFatal inner");
    } catch (_e2) {
      // ignore
    }
  } finally {
    isHandlingFatal = false;
  }
}

process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  void notifyFatal("unhandledRejection", err);
});

process.on("uncaughtException", (err) => {
  void notifyFatal("uncaughtException", err);
});
