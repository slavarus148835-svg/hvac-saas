import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const logDir = path.join(root, "logs");
const logFile = path.join(logDir, "worker.log");

function ensure() {
  try {
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  } catch {
    /* ignore */
  }
}

export function logLine(msg: string) {
  ensure();
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    fs.appendFileSync(logFile, line, "utf8");
  } catch {
    /* ignore */
  }
}
