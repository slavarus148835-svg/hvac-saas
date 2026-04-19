const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const ENV_PATH = path.join(ROOT, ".env");
const ENV_EXAMPLE = path.join(ROOT, ".env.example");

const DATA_FILES = ["leads.json", "logs.json", "campaigns.json"];

function log(msg) {
  console.log(`[AI OFFICE] ${msg}`);
}

function readEnvFile() {
  if (!fs.existsSync(ENV_PATH)) return "";
  return fs.readFileSync(ENV_PATH, "utf8");
}

function parseTelegramToken(content) {
  const lines = String(content || "").split(/\r?\n/);
  for (const line of lines) {
    const m = /^\s*TELEGRAM_BOT_TOKEN\s*=\s*(.*)$/.exec(line);
    if (m) {
      let v = m[1].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return v.trim();
    }
  }
  return "";
}

function effectiveTelegramToken() {
  const fromProc = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (fromProc) return fromProc;
  return parseTelegramToken(readEnvFile());
}

function parseEnvKey(name) {
  const lines = String(readEnvFile() || "").split(/\r?\n/);
  const re = new RegExp(`^\\s*${name}\\s*=\\s*(.*)$`);
  for (const line of lines) {
    const m = re.exec(line);
    if (m) {
      let v = m[1].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return v.trim();
    }
  }
  return "";
}

function effectiveEnvKey(name) {
  const fromProc = String(process.env[name] || "").trim();
  if (fromProc) return fromProc;
  return parseEnvKey(name);
}

function saveEnvKey(name, value) {
  ensureDotEnv();
  let content = readEnvFile();
  const lines = content.split(/\r?\n/);
  let found = false;
  const out = lines.map((line) => {
    if (new RegExp(`^\\s*${name}\\s*=`).test(line)) {
      found = true;
      return `${name}=${value}`;
    }
    return line;
  });
  if (!found) {
    out.push(`${name}=${value}`);
  }
  fs.writeFileSync(ENV_PATH, out.join("\n").replace(/\n+$/, "\n"), "utf8");
  log(`${name} saved`);
}

function ensureDotEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    let body = "";
    if (fs.existsSync(ENV_EXAMPLE)) {
      body = fs.readFileSync(ENV_EXAMPLE, "utf8");
    } else {
      body = [
        "TELEGRAM_BOT_TOKEN=",
        "OPENAI_API_KEY=",
        "OPENAI_MODEL=gpt-4o-mini",
        "GOOGLE_PLACES_API_KEY=",
        "",
      ].join("\n");
    }
    fs.writeFileSync(ENV_PATH, body, "utf8");
    log("Creating .env from template");
  }
}

function repairJsonArray(filePath) {
  const name = path.basename(filePath);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "[]\n", "utf8");
    log(`Data: created ${name}`);
    return;
  }
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (e) {
    fs.writeFileSync(filePath, "[]\n", "utf8");
    log(`Data: reset ${name} (read error)`);
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("not_array");
  } catch {
    fs.writeFileSync(filePath, "[]\n", "utf8");
    log(`Data: repaired ${name}`);
  }
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    log("Creating data/...");
  }
  for (const f of DATA_FILES) {
    repairJsonArray(path.join(DATA_DIR, f));
  }
  log("Data files OK");
}

function saveTelegramToken(token) {
  const t = String(token || "").trim();
  if (t.length < 10) {
    throw new Error("Токен слишком короткий");
  }
  ensureDotEnv();
  let content = readEnvFile();
  const lines = content.split(/\r?\n/);
  let found = false;
  const out = lines.map((line) => {
    if (/^\s*TELEGRAM_BOT_TOKEN\s*=/.test(line)) {
      found = true;
      return `TELEGRAM_BOT_TOKEN=${t}`;
    }
    return line;
  });
  if (!found) {
    out.push(`TELEGRAM_BOT_TOKEN=${t}`);
  }
  fs.writeFileSync(ENV_PATH, out.join("\n").replace(/\n+$/, "\n"), "utf8");
  log("Telegram token saved");
}

function prepareSync() {
  try {
    log("Checking environment...");
    ensureDotEnv();
    ensureDataDir();
    const token = effectiveTelegramToken();
    const needToken = !token;
    if (needToken) {
      log("TELEGRAM_BOT_TOKEN is empty");
    }
    return { ok: true, needToken };
  } catch (e) {
    return { ok: false, error: String(e.message || e), needToken: false };
  }
}

if (require.main === module) {
  const r = prepareSync();
  if (!r.ok) {
    log(`Error: ${r.error}`);
    process.exit(1);
  }
  if (r.needToken) {
    log("Run: npm run launch   (или двойной клик START_AI_OFFICE)");
    process.exit(2);
  }
  log("Environment OK");
  process.exit(0);
}

module.exports = {
  ROOT,
  prepareSync,
  saveTelegramToken,
  parseTelegramToken,
  effectiveTelegramToken,
  parseEnvKey,
  effectiveEnvKey,
  saveEnvKey,
  log,
};
