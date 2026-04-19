import "./loadEnv.js";
import path from "node:path";
import fs from "node:fs";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { prisma } from "@bridge/db";
import { logLine } from "./log.js";
import { ROOT as root } from "./loadEnv.js";

const PORT = Number(process.env.PORT || 8787);

function ensureDataDir() {
  const dataDir = path.join(root, "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

async function maybeCallback(taskId: string, body: unknown) {
  const url = process.env.TASK_CALLBACK_URL?.trim();
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, ...((body as object) || {}) }),
    });
  } catch (e) {
    logLine(`callback failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const app = Fastify({ logger: false });
await app.register(cors, { origin: true });

app.get("/health", async () => ({ ok: true, service: "bridge-server" }));

app.post("/api/tasks", async (req, reply) => {
  const body = req.body as { type?: string; payload?: unknown };
  if (!body?.type || typeof body.type !== "string") {
    return reply.status(400).send({ error: "type required" });
  }
  let payloadJson: string;
  try {
    payloadJson = JSON.stringify(body.payload ?? {});
  } catch {
    return reply.status(400).send({ error: "invalid payload" });
  }
  const task = await prisma.task.create({
    data: {
      type: body.type,
      payloadJson,
      status: "new",
    },
  });
  logLine(`task created ${task.id} type=${task.type}`);
  return { id: task.id, status: task.status, type: task.type };
});

app.get("/api/tasks/:id", async (req, reply) => {
  const id = (req.params as { id: string }).id;
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return reply.status(404).send({ error: "not found" });
  let payload: unknown;
  let result: unknown = null;
  try {
    payload = JSON.parse(task.payloadJson);
  } catch {
    payload = task.payloadJson;
  }
  if (task.resultJson) {
    try {
      result = JSON.parse(task.resultJson);
    } catch {
      result = task.resultJson;
    }
  }
  return {
    id: task.id,
    type: task.type,
    status: task.status,
    payload,
    result,
    errorText: task.errorText,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
});

app.post("/api/worker/claim", async (_req, reply) => {
  const out = await prisma.$transaction(async (tx) => {
    const row = await tx.task.findFirst({
      where: { status: "new" },
      orderBy: { createdAt: "asc" },
    });
    if (!row) return null;
    await tx.task.update({
      where: { id: row.id },
      data: { status: "running" },
    });
    return row;
  });
  if (!out) return reply.status(204).send();
  let payload: unknown;
  try {
    payload = JSON.parse(out.payloadJson);
  } catch {
    payload = out.payloadJson;
  }
  logLine(`task claimed ${out.id}`);
  return {
    id: out.id,
    type: out.type,
    status: "running",
    payload,
    createdAt: out.createdAt,
  };
});

app.post("/api/worker/:id/complete", async (req, reply) => {
  const id = (req.params as { id: string }).id;
  const body = req.body as { result?: unknown };
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return reply.status(404).send({ error: "not found" });
  if (task.status !== "running") {
    return reply.status(409).send({ error: `invalid status ${task.status}` });
  }
  let resultJson: string;
  try {
    resultJson = JSON.stringify(body?.result ?? {});
  } catch {
    return reply.status(400).send({ error: "invalid result" });
  }
  const updated = await prisma.task.update({
    where: { id },
    data: { status: "done", resultJson, errorText: null },
  });
  logLine(`task done ${id}`);
  void maybeCallback(id, { status: "done", result: body?.result });
  return { id: updated.id, status: updated.status };
});

app.post("/api/worker/:id/fail", async (req, reply) => {
  const id = (req.params as { id: string }).id;
  const body = req.body as { error?: string };
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return reply.status(404).send({ error: "not found" });
  if (task.status !== "running") {
    return reply.status(409).send({ error: `invalid status ${task.status}` });
  }
  const err = String(body?.error || "unknown error");
  const updated = await prisma.task.update({
    where: { id },
    data: { status: "error", errorText: err },
  });
  logLine(`task failed ${id}: ${err}`);
  void maybeCallback(id, { status: "error", error: err });
  return { id: updated.id, status: updated.status };
});

app.setErrorHandler((err, _req, reply) => {
  const msg = err instanceof Error ? err.message : String(err);
  logLine(`error: ${msg}`);
  reply.status(500).send({ error: msg });
});

ensureDataDir();

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
  logLine(`listening ${PORT}`);
} catch (e) {
  logLine(`fatal listen: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
