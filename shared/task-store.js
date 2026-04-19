import fs from "fs-extra";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";

const ROOT = path.resolve(".");
const TASKS_DIR = path.join(ROOT, "tasks");
const RESULTS_DIR = path.join(ROOT, "results");
const RUNTIME_DIR = path.join(ROOT, "runtime");

const STATUS = {
  PENDING: "pending",
  CLAIMED: "claimed",
  RUNNING: "running",
  DONE: "done",
  FAILED: "failed",
};

export function ensureStoreDirs() {
  fs.ensureDirSync(TASKS_DIR);
  fs.ensureDirSync(RESULTS_DIR);
  fs.ensureDirSync(RUNTIME_DIR);
}

function taskPath(id) {
  return path.join(TASKS_DIR, `${id}.json`);
}

function resultPath(id) {
  return path.join(RESULTS_DIR, `${id}.json`);
}

function nowIso() {
  return new Date().toISOString();
}

export function createTask({ type, payload }) {
  ensureStoreDirs();
  const id = uuidv4();
  const task = {
    id,
    type: String(type || "code_task"),
    payload: payload || {},
    status: STATUS.PENDING,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  fs.writeJsonSync(taskPath(id), task, { spaces: 2 });
  return task;
}

export function getTask(id) {
  const file = taskPath(id);
  if (!fs.existsSync(file)) return null;
  return fs.readJsonSync(file);
}

export function saveTask(task) {
  task.updatedAt = nowIso();
  fs.writeJsonSync(taskPath(task.id), task, { spaces: 2 });
  return task;
}

export function listTasks() {
  ensureStoreDirs();
  const entries = fs
    .readdirSync(TASKS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => fs.readJsonSync(path.join(TASKS_DIR, f)));
  entries.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return entries;
}

export function getNextPendingTask() {
  return listTasks().find((t) => t.status === STATUS.PENDING) || null;
}

export function updateTaskStatus(id, status, meta = {}) {
  const task = getTask(id);
  if (!task) return null;
  task.status = status;
  Object.assign(task, meta);
  return saveTask(task);
}

export function saveResult(id, result) {
  ensureStoreDirs();
  const payload = {
    id,
    ...result,
    savedAt: nowIso(),
  };
  fs.writeJsonSync(resultPath(id), payload, { spaces: 2 });
  return payload;
}

export function getResult(id) {
  const file = resultPath(id);
  if (!fs.existsSync(file)) return null;
  return fs.readJsonSync(file);
}

export { STATUS, TASKS_DIR, RESULTS_DIR, RUNTIME_DIR };
