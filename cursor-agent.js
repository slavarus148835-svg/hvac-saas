import dotenv from "dotenv";
import fetch from "node-fetch";
import { createLogger } from "./shared/logger.js";
import { sendTelegram } from "./shared/telegram.js";
import { executeTask } from "./executor.js";

dotenv.config();

const logger = createLogger("agent");
const BASE = `http://127.0.0.1:${Number(process.env.BRIDGE_PORT || 3031)}`;
const INTERVAL = Math.max(1000, Number(process.env.POLL_INTERVAL_MS || 5000));

if (process.stdout && typeof process.stdout.on === "function") {
  process.stdout.on("error", () => {});
}
if (process.stderr && typeof process.stderr.on === "function") {
  process.stderr.on("error", () => {});
}

let busy = false;
let currentTaskId = null;

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  if (res.status === 204) return null;
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(body?.error || `HTTP ${res.status}`);
  }
  return body;
}

async function processOne() {
  if (busy) return;
  busy = true;
  try {
    const next = await req("/task/next");
    if (!next || !next.id) return;
    if (currentTaskId && currentTaskId === next.id) return;

    await req(`/task/${encodeURIComponent(next.id)}/claim`, { method: "POST" });
    await req(`/task/${encodeURIComponent(next.id)}/running`, { method: "POST" });
    currentTaskId = next.id;
    logger.info(`task picked ${next.id}`);
    sendTelegram(`🛠 Agent started task ${next.id}`, logger);

    try {
      const result = await executeTask(next);
      await req(`/task/${encodeURIComponent(next.id)}/result`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true, result }),
      });
      logger.info(`task success ${next.id}`);
    } catch (taskErr) {
      const msg = taskErr?.message || String(taskErr);
      logger.error(`task failed ${next.id}: ${msg}`);
      await req(`/task/${encodeURIComponent(next.id)}/result`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, errorText: msg }),
      });
    } finally {
      currentTaskId = null;
    }
  } catch (e) {
    logger.error(`agent cycle error: ${e?.message || String(e)}`);
    sendTelegram(`⚠️ Agent error: ${e?.message || String(e)}`, logger);
  } finally {
    busy = false;
  }
}

logger.info(`agent started; poll=${INTERVAL}ms base=${BASE}`);
sendTelegram(`🤖 Agent started; poll ${INTERVAL}ms`, logger);
setInterval(() => {
  processOne();
}, INTERVAL);
processOne();
