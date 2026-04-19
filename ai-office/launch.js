#!/usr/bin/env node

const path = require("path");
const fs = require("fs");
const readline = require("readline");
const { spawnSync, spawn } = require("child_process");

const ROOT = __dirname;
process.chdir(ROOT);

function log(msg) {
  console.log(`[AI OFFICE] ${msg}`);
}

function askToken() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(
      "\nВставьте TELEGRAM_BOT_TOKEN (от @BotFather) и нажмите Enter:\n> ",
      (answer) => {
        rl.close();
        resolve(String(answer || "").trim());
      }
    );
  });
}

function askOptional(label) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`\n${label}\n(Enter — пропустить)\n> `, (answer) => {
      rl.close();
      resolve(String(answer || "").trim());
    });
  });
}

function ensureNodeModules() {
  const nm = path.join(ROOT, "node_modules");
  if (fs.existsSync(nm)) {
    log("Dependencies OK");
    return true;
  }
  log("Installing dependencies...");
  const isWin = process.platform === "win32";
  const cmd = isWin ? "npm.cmd" : "npm";
  const r = spawnSync(cmd, ["install"], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
    shell: isWin,
  });
  if (r.status !== 0) {
    log("npm install failed. Установите Node.js LTS и повторите.");
    return false;
  }
  log("Dependencies installed");
  return true;
}

async function main() {
  log("Starting...");
  const bootstrap = require("./server/bootstrap.js");
  const prep = bootstrap.prepareSync();
  if (!prep.ok) {
    log(`Error: ${prep.error}`);
    process.exitCode = 1;
    return;
  }
  if (prep.needToken) {
    try {
      const token = await askToken();
      bootstrap.saveTelegramToken(token);
    } catch (e) {
      log(String(e.message || e));
      process.exitCode = 1;
      return;
    }
  }
  if (process.stdin.isTTY) {
    if (!bootstrap.effectiveEnvKey("GOOGLE_PLACES_API_KEY")) {
      const g = await askOptional("GOOGLE_PLACES_API_KEY (реальные лиды из Google Places)");
      if (g.length > 8) {
        bootstrap.saveEnvKey("GOOGLE_PLACES_API_KEY", g);
        process.env.GOOGLE_PLACES_API_KEY = g;
        log("Google Places: live mode (ключ сохранён в .env)");
      } else {
        log("Google Places: demo mode (ключ не введён — остаётся demo)");
      }
    } else {
      log("Google Places: live mode (ключ уже в .env)");
    }
    if (!bootstrap.effectiveEnvKey("OPENAI_API_KEY")) {
      const o = await askOptional("OPENAI_API_KEY (если пусто — будут шаблонные тексты)");
      if (o.length > 8) {
        bootstrap.saveEnvKey("OPENAI_API_KEY", o);
        process.env.OPENAI_API_KEY = o;
      }
    }
  } else if (!bootstrap.effectiveEnvKey("GOOGLE_PLACES_API_KEY")) {
    log("Google Places: demo mode (неинтерактивный запуск — задайте ключ через launch в окне)");
  }
  if (!ensureNodeModules()) {
    process.exitCode = 1;
    return;
  }
  log("Launching bot...");
  const child = spawn(process.execPath, [path.join(ROOT, "server", "index.js")], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  log("Ready. Open Telegram and send /start");
  child.on("exit", (code) => {
    process.exit(code === null ? 1 : code);
  });
  child.on("error", (err) => {
    log(`Failed to start: ${err.message || err}`);
    process.exit(1);
  });
}

main().catch((e) => {
  log(String(e.message || e));
  process.exit(1);
});
