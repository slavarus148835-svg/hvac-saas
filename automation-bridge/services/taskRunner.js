const { submitTask } = require("./cursorAdapter");

const BRIDGE_MODE = process.env.BRIDGE_MODE === "real" ? "real" : "mock";

function nowIso() {
  return new Date().toISOString();
}

function pushLog(task, message) {
  task.logs.push({
    at: nowIso(),
    message: String(message || ""),
  });
}

function addHistoryEvent(task, type, message, meta = {}) {
  if (!Array.isArray(task.history)) {
    task.history = [];
  }
  task.history.push({
    timestamp: nowIso(),
    type,
    message: String(message || ""),
    meta:
      typeof meta === "object" && meta !== null && !Array.isArray(meta) ? meta : {},
  });
}

async function runTask(task, store) {
  if (BRIDGE_MODE === "real") {
    return runRealTask(task, store);
  }
  return runMockTask(task, store);
}

function runMockTask(task, store) {
  task.status = "running";
  task.agentStatus = "running";
  task.lifecycleStage = "executing";
  task.lastAction = "execution_started";
  addHistoryEvent(task, "execution_started", "Execution started in mock runner");
  if (task.latestRevision) {
    task.latestRevision = { ...task.latestRevision, status: "running" };
  }
  task.updatedAt = nowIso();
  pushLog(task, "Task moved to running automatically (mock mode)");
  store.set(task.id, task);

  // Stage 1: start processing
  setTimeout(() => {
    const current = store.get(task.id);
    if (!current || current.status !== "running") return;
    pushLog(current, "Preparing execution context");
    current.updatedAt = nowIso();
    store.set(current.id, current);
  }, 600);

  // Stage 2: imitate file updates/checks
  setTimeout(() => {
    const current = store.get(task.id);
    if (!current || current.status !== "running") return;
    pushLog(current, "Applying simulated changes");
    current.updatedAt = nowIso();
    store.set(current.id, current);
  }, 1500);

  // Stage 3: complete task
  setTimeout(() => {
    const current = store.get(task.id);
    if (!current || current.status !== "running") return;

    current.status = "done";
    current.agentStatus = "finished";
    current.lifecycleStage = "reported";
    current.lastAction = "task_completed";
    if (current.latestRevision) {
      current.latestRevision = { ...current.latestRevision, status: "done" };
    }
    current.result = {
      summary: `Goal "${current.goal}" completed by simulated dispatcher`,
      changedFiles: ["app/example.tsx", "lib/example.js"],
      checks: ["simulation:ok", "validation:ok"],
    };
    current._autoReviewPending = true;
    pushLog(current, "Task completed successfully");
    addHistoryEvent(current, "task_completed", "Task completed in mock runner");
    current.updatedAt = nowIso();
    store.set(current.id, current);
  }, 2600);
}

async function runRealTask(task, store) {
  const adapterResult = await submitTask(task);
  task.externalTaskId = adapterResult.externalTaskId;
  task.agentStatus = adapterResult.agentStatus || "submitted";
  if (task.latestRevision) {
    task.latestRevision = { ...task.latestRevision, status: "submitted" };
  }
  if (task.status === "running") {
    task.lifecycleStage = "executing";
    task.lastAction = "execution_started";
  }
  pushLog(task, `Forwarded to Cursor adapter: ${adapterResult.message}`);
  task.updatedAt = nowIso();
  store.set(task.id, task);
  return adapterResult;
}

module.exports = {
  runTask,
  runMockTask,
  runRealTask,
};
