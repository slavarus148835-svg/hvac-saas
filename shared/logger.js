import fs from "fs-extra";
import path from "node:path";

const ROOT = path.resolve(".");
const LOG_DIR = path.join(ROOT, "logs");

if (process.stdout && typeof process.stdout.on === "function") {
  process.stdout.on("error", () => {});
}
if (process.stderr && typeof process.stderr.on === "function") {
  process.stderr.on("error", () => {});
}

export function createLogger(name) {
  const filePath = path.join(LOG_DIR, `${name}.log`);

  function write(level, message) {
    const line = `[${new Date().toISOString()}] [${level}] ${String(message)}\n`;
    try {
      fs.ensureDirSync(LOG_DIR);
      fs.appendFileSync(filePath, line, "utf8");
    } catch (_e) {
      // never throw from logger
    }
  }

  return {
    info: (msg) => write("INFO", msg),
    warn: (msg) => write("WARN", msg),
    error: (msg) => write("ERROR", msg),
    filePath,
  };
}
