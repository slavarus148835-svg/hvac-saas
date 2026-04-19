import path from "node:path";
import dotenv from "dotenv";
import { logLine } from "./log.js";
import { executeCodeTask } from "./executor/codeTask.js";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
dotenv.config({ path: path.join(root, ".env"), override: true });

const BASE = (process.env.SERVER_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const POLL_MS = Math.max(500, Number(process.env.WORKER_POLL_MS) || 1500);

type ClaimedTask = {
  id: string;
  type: string;
  status: string;
  payload: { prompt?: string; repoPath?: string };
};

async function claim(): Promise<ClaimedTask | null> {
  const res = await fetch(`${BASE}/api/worker/claim`, { method: "POST" });
  if (res.status === 204) return null;
  if (!res.ok) {
    logLine(`claim HTTP ${res.status}`);
    return null;
  }
  return (await res.json()) as ClaimedTask;
}

async function complete(id: string, result: unknown) {
  const res = await fetch(`${BASE}/api/worker/${encodeURIComponent(id)}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ result }),
  });
  if (!res.ok) logLine(`complete failed ${res.status} ${await res.text()}`);
}

async function fail(id: string, error: string) {
  const res = await fetch(`${BASE}/api/worker/${encodeURIComponent(id)}/fail`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ error }),
  });
  if (!res.ok) logLine(`fail HTTP ${res.status}`);
}

async function processTask(t: ClaimedTask) {
  logLine(`processing ${t.id} type=${t.type}`);
  try {
    if (t.type === "code_task") {
      const p = t.payload || {};
      const prompt = String(p.prompt || "");
      if (!prompt) throw new Error("code_task requires payload.prompt");
      const result = await executeCodeTask(t.id, {
        prompt,
        repoPath: p.repoPath ? String(p.repoPath) : undefined,
      });
      await complete(t.id, result);
    } else {
      throw new Error(`unknown task type: ${t.type}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logLine(`task error ${t.id}: ${msg}`);
    await fail(t.id, msg);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

logLine(`worker start BASE=${BASE} POLL_MS=${POLL_MS}`);

for (;;) {
  try {
    const task = await claim();
    if (task) await processTask(task);
    else await sleep(POLL_MS);
  } catch (e) {
    logLine(`loop error: ${e instanceof Error ? e.message : String(e)}`);
    await sleep(POLL_MS);
  }
}
