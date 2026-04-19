import express from "express";
import dotenv from "dotenv";
import {
  STATUS,
  createTask,
  ensureStoreDirs,
  getNextPendingTask,
  getResult,
  getTask,
  saveResult,
  updateTaskStatus,
} from "./shared/task-store.js";
import { createLogger } from "./shared/logger.js";
import { sendTelegram } from "./shared/telegram.js";

dotenv.config();

const logger = createLogger("bridge");
const app = express();

if (process.stdout && typeof process.stdout.on === "function") {
  process.stdout.on("error", () => {});
}
if (process.stderr && typeof process.stderr.on === "function") {
  process.stderr.on("error", () => {});
}

ensureStoreDirs();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/task", (req, res) => {
  try {
    const body = req.body || {};
    const type = String(body.type || "code_task");
    const payload =
      body.payload && typeof body.payload === "object"
        ? body.payload
        : {
            prompt: body.prompt ? String(body.prompt) : "",
            source: body.source ? String(body.source) : "api",
          };
    const task = createTask({ type, payload });
    logger.info(`task created ${task.id} type=${type}`);
    sendTelegram(`📥 Bridge: новая задача ${task.id} (${type})`, logger);
    res.status(201).json(task);
  } catch (e) {
    logger.error(`POST /task failed: ${e?.message || String(e)}`);
    res.status(500).json({ error: "failed to create task" });
  }
});

app.get("/task/next", (_req, res) => {
  const task = getNextPendingTask();
  if (!task) return res.status(204).send();
  return res.json(task);
});

app.post("/task/:id/claim", (req, res) => {
  const id = req.params.id;
  const existing = getTask(id);
  if (!existing) return res.status(404).json({ error: "task not found" });
  if (existing.status !== STATUS.PENDING) {
    return res.status(409).json({ error: `cannot claim from ${existing.status}` });
  }
  const task = updateTaskStatus(id, STATUS.CLAIMED, { claimedAt: new Date().toISOString() });
  logger.info(`task claimed ${id}`);
  sendTelegram(`🤖 Agent claimed ${id}`, logger);
  res.json(task);
});

app.post("/task/:id/running", (req, res) => {
  const id = req.params.id;
  const existing = getTask(id);
  if (!existing) return res.status(404).json({ error: "task not found" });
  if (![STATUS.CLAIMED, STATUS.RUNNING].includes(existing.status)) {
    return res.status(409).json({ error: `cannot set running from ${existing.status}` });
  }
  const task = updateTaskStatus(id, STATUS.RUNNING, { runningAt: new Date().toISOString() });
  logger.info(`task running ${id}`);
  res.json(task);
});

app.post("/task/:id/result", (req, res) => {
  const id = req.params.id;
  const existing = getTask(id);
  if (!existing) return res.status(404).json({ error: "task not found" });

  const body = req.body || {};
  const ok = body.ok !== false;
  const result = body.result || {};
  const errorText = body.errorText ? String(body.errorText) : null;

  saveResult(id, { ok, result, errorText });
  const nextStatus = ok ? STATUS.DONE : STATUS.FAILED;
  const task = updateTaskStatus(id, nextStatus, {
    completedAt: new Date().toISOString(),
    errorText: errorText || null,
  });

  logger.info(`task finished ${id} status=${nextStatus}`);
  if (ok) {
    sendTelegram(`✅ Task ${id} done`, logger);
  } else {
    sendTelegram(`❌ Task ${id} failed: ${errorText || "unknown error"}`, logger);
  }

  res.json(task);
});

app.get("/task/:id", (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "task not found" });
  res.json(task);
});

app.get("/task/:id/result", (req, res) => {
  const result = getResult(req.params.id);
  if (!result) return res.status(404).json({ error: "result not found" });
  res.json(result);
});

app.use((err, _req, res, _next) => {
  logger.error(`bridge unhandled error: ${err?.message || String(err)}`);
  res.status(500).json({ error: "internal error" });
});

const port = Number(process.env.BRIDGE_PORT || 3031);
app.listen(port, () => {
  logger.info(`bridge started on ${port}`);
  sendTelegram(`🚀 Bridge started on port ${port}`, logger);
});
