import fs from "fs-extra";
import path from "node:path";
import { spawn } from "node:child_process";
import dotenv from "dotenv";
import { createLogger } from "./shared/logger.js";
import { RUNTIME_DIR } from "./shared/task-store.js";

dotenv.config();

const logger = createLogger("executor");
const ROOT = path.resolve(".");

function hasCursorCli() {
  return new Promise((resolve) => {
    const cmd = process.platform === "win32" ? "where" : "which";
    const child = spawn(cmd, ["cursor"], { shell: false });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

function runCmd(command, cwd) {
  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const child = spawn(isWin ? "cmd.exe" : "sh", isWin ? ["/d", "/s", "/c", command] : ["-c", command], {
      cwd,
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ code: code ?? 0, stdout, stderr }));
    child.on("error", (e) => resolve({ code: 1, stdout, stderr: e.message || String(e) }));
  });
}

export async function executeTask(task) {
  fs.ensureDirSync(RUNTIME_DIR);
  const payload = task.payload || {};
  const prompt = String(payload.prompt || "");
  const projectPath = path.resolve(ROOT, String(process.env.PROJECT_PATH || "."));

  const currentTaskTxt = `id=${task.id}\ntype=${task.type}\nstatus=running\nprompt:\n${prompt}\n`;
  fs.writeFileSync(path.join(RUNTIME_DIR, "current_task.txt"), currentTaskTxt, "utf8");

  const canUseCursor = await hasCursorCli();
  let result;

  if (canUseCursor) {
    logger.info(`task ${task.id}: cursor-cli mode`);
    const cursorVersion = await runCmd("cursor --version", projectPath);
    result = {
      mode: "cursor-cli",
      summary: `Task ${task.id} handled in cursor-cli mode`,
      changedFiles: [],
      logs: [
        `prompt: ${prompt}`,
        `cwd: ${projectPath}`,
        `cursor --version exit=${cursorVersion.code}`,
        cursorVersion.stdout || "",
        cursorVersion.stderr || "",
      ].join("\n"),
    };
  } else {
    logger.info(`task ${task.id}: fallback mode`);
    result = {
      mode: "fallback",
      summary: `Fallback executor processed task ${task.id}`,
      changedFiles: [],
      logs: [
        `prompt: ${prompt}`,
        `cwd: ${projectPath}`,
        "cursor cli not found",
      ].join("\n"),
    };
  }

  fs.writeJsonSync(path.join(RUNTIME_DIR, "result.json"), result, { spaces: 2 });
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve("executor.js")) {
  const fakeTask = {
    id: "manual-" + Date.now(),
    type: "code_task",
    payload: { prompt: process.argv.slice(2).join(" ") || "executor standalone run" },
  };
  executeTask(fakeTask)
    .then((res) => logger.info(`executor standalone done: ${res.mode}`))
    .catch((e) => logger.error(`executor standalone failed: ${e?.message || String(e)}`));
}
