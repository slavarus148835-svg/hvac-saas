let lastTelegramEvent = null;
let lastTelegramError = null;
let lastTelegramMessageMeta = null;
let telegramEnabled = false;
let allowedChatId = null;

function nowIso() {
  return new Date().toISOString();
}

function syncTelegramDebugEnv({ telegramEnabled: enabled, allowedChatId: chat }) {
  telegramEnabled = Boolean(enabled);
  allowedChatId = chat != null && String(chat).trim() !== "" ? String(chat).trim() : null;
}

function recordTelegramEvent(message) {
  lastTelegramEvent = `${nowIso()} ${String(message || "").slice(0, 500)}`;
}

function formatErrDetail(error) {
  if (!error) return "";
  const msg = error.message || String(error);
  const stack = typeof error.stack === "string" ? error.stack : "";
  if (stack && stack !== msg) {
    return `${msg} | stack: ${stack.slice(0, 1500)}`;
  }
  return msg;
}

function recordTelegramError(message, meta) {
  let line = `${nowIso()} ${String(message || "").slice(0, 600)}`;
  if (meta && typeof meta === "object" && Object.keys(meta).length) {
    try {
      line += ` | meta=${JSON.stringify(meta).slice(0, 500)}`;
    } catch (_e) {
      // ignore
    }
  }
  lastTelegramError = line.slice(0, 2000);
}

function setTelegramMessageMeta(meta) {
  if (meta && typeof meta === "object") {
    lastTelegramMessageMeta = { ...meta, at: nowIso() };
  }
}

function getTelegramDebugSnapshot() {
  return {
    telegramEnabled,
    allowedChatId,
    lastTelegramEvent,
    lastTelegramError,
    lastTelegramMessageMeta,
  };
}

module.exports = {
  syncTelegramDebugEnv,
  recordTelegramEvent,
  recordTelegramError,
  setTelegramMessageMeta,
  getTelegramDebugSnapshot,
  formatErrDetail,
};
