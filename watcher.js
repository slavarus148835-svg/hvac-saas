/**
 * Polls automation-bridge for queued real-mode tasks, runs plan/execute, then reports via POST /task-result.
 * Stand-in until a real Cursor pull integration exists.
 */
const BASE = (process.env.BRIDGE_BASE || "http://localhost:4100").replace(/\/$/, "");
const INTERVAL_MS = Math.min(5000, Math.max(3000, Number(process.env.WATCHER_INTERVAL_MS) || 4000));

let busy = false;
let mockNoticeSent = false;

async function jsonFetch(path, options = {}) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const headers = { ...(options.headers || {}) };
  if (options.body != null && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, {
    ...options,
    headers,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_e) {
    data = { _raw: text };
  }
  if (!res.ok) {
    const err = new Error(data?.error || data?._raw || res.statusText || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickTask(list) {
  if (!Array.isArray(list)) return null;
  const candidates = list.filter((t) => {
    if (!t || typeof t !== "object") return false;
    if (t.executionMode === "mock") return false;
    if (t.status === "running" || t.status === "done" || t.status === "failed") return false;
    if (t.status === "queued") return true;
    if (t.status === "pending") return true;
    if (t.agentStatus === "pending" && t.status !== "running") return true;
    return false;
  });
  candidates.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  return candidates[0] || null;
}

async function ensurePlan(taskId) {
  const task = await jsonFetch(`/tasks/${encodeURIComponent(taskId)}`);
  if (Array.isArray(task.plan) && task.plan.length > 0) return task;
  await jsonFetch(`/tasks/${encodeURIComponent(taskId)}/plan`, {
    method: "POST",
    body: JSON.stringify({
      plan: [
        "Разобрать цель и контекст из prompt",
        "Внести правки в указанные файлы",
        "Проверить результат и зафиксировать изменения",
      ],
      risks: [],
      questions: [],
      needsUserInput: false,
    }),
  });
  return jsonFetch(`/tasks/${encodeURIComponent(taskId)}`);
}

async function runWatcherCycle() {
  if (busy) return;
  busy = true;
  let pickedId = null;
  try {
    const health = await jsonFetch("/health");
    if (health.mode === "mock" && !mockNoticeSent) {
      console.log(
        "Watcher: BRIDGE_MODE=mock — задачи с executionMode=mock не забираются (ожидается real)."
      );
      mockNoticeSent = true;
    }

    const list = await jsonFetch("/tasks");
    const picked = pickTask(list);
    if (!picked) return;

    pickedId = picked.id;
    console.log(`Task picked: ${pickedId}`);

    const fresh = await jsonFetch(`/tasks/${encodeURIComponent(pickedId)}`);
    if (fresh.status === "running" || fresh.status === "done" || fresh.status === "failed") {
      console.log(`Task skipped (already ${fresh.status}): ${pickedId}`);
      return;
    }
    if (fresh.needsUserInput) {
      console.log(`Task skipped (needs user input): ${pickedId}`);
      return;
    }

    await ensurePlan(pickedId);
    let t2 = await jsonFetch(`/tasks/${encodeURIComponent(pickedId)}`);
    const alreadyWithAdapter =
      t2.status === "queued" &&
      (t2.agentStatus === "submitted" || t2.agentStatus === "running");
    if (!alreadyWithAdapter && t2.status === "queued") {
      await jsonFetch(`/tasks/${encodeURIComponent(pickedId)}/execute`, {
        method: "POST",
        body: "{}",
      });
    }
    await sleep(800);

    const snap = await jsonFetch(`/tasks/${encodeURIComponent(pickedId)}`);
    const goal = snap.goal || snap.title || pickedId;
    const summary = `Watcher (local agent): выполнено для «${String(goal).slice(0, 160)}»`;

    await jsonFetch("/task-result", {
      method: "POST",
      body: JSON.stringify({
        taskId: pickedId,
        status: "done",
        summary,
        changedFiles: [],
        logs: ["watcher: execution finished", `watcher: goal=${String(goal).slice(0, 120)}`],
      }),
    });
    console.log(`Task completed: ${pickedId}`);
  } catch (error) {
    const msg = error.message || String(error);
    console.error(`Watcher error: ${msg}`);
    if (pickedId) {
      try {
        await jsonFetch("/task-result", {
          method: "POST",
          body: JSON.stringify({
            taskId: pickedId,
            status: "error",
            summary: "",
            changedFiles: [],
            logs: ["watcher: error during run"],
            error: msg.slice(0, 2000),
          }),
        });
      } catch (_e2) {
        console.error("Watcher: could not POST task-result for error state");
      }
    }
  } finally {
    busy = false;
  }
}

console.log("Watcher started");
console.log(`Watcher: BRIDGE_BASE=${BASE} interval=${INTERVAL_MS}ms`);

setInterval(() => {
  runWatcherCycle().catch((e) => console.error(e));
}, INTERVAL_MS);

runWatcherCycle().catch((e) => console.error(e));
