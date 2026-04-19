const { spawn } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const isWin = process.platform === "win32";

function spawnInherit(cmd, args) {
  return spawn(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: isWin,
  });
}

const next = spawnInherit("npx", ["next", "dev"]);
const watcher = spawnInherit("node", ["watcher.js"]);

function shutdown(code) {
  try {
    next.kill("SIGTERM");
  } catch (_e) {
    // ignore
  }
  try {
    watcher.kill("SIGTERM");
  } catch (_e2) {
    // ignore
  }
  process.exit(typeof code === "number" ? code : 0);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

next.on("exit", (code) => {
  try {
    watcher.kill("SIGTERM");
  } catch (_e) {
    // ignore
  }
  process.exit(code == null ? 0 : code);
});

watcher.on("exit", (code) => {
  if (code && code !== 0) {
    console.error(`watcher exited with code ${code}`);
  }
});
