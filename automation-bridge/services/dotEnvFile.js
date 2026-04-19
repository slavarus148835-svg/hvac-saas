const fs = require("fs");

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { raw: "", map: {} };
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const map = {};
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"');
    }
    map[key] = val;
  }
  return { raw, map };
}

function quoteEnvValue(value) {
  const s = String(value ?? "");
  if (/[\s#"']/.test(s) || s === "") {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n")}"`;
  }
  return s;
}

function upsertEnvKey(filePath, key, value) {
  const lineOut = `${key}=${quoteEnvValue(value)}`;
  let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  const lines = content.split(/\r?\n/);
  const re = new RegExp(`^\\s*${escapeRegex(key)}\\s*=`);
  let replaced = false;
  const next = lines.map((line) => {
    if (re.test(line)) {
      replaced = true;
      return lineOut;
    }
    return line;
  });
  if (!replaced) {
    if (next.length === 1 && next[0] === "") {
      next[0] = lineOut;
    } else {
      if (next.length && next[next.length - 1] !== "") next.push("");
      next.push(lineOut);
    }
  }
  const out = next.join("\n").replace(/\n*$/, "\n");
  fs.writeFileSync(filePath, out, "utf8");
}

function ensureEnvFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "\n", "utf8");
  }
}

module.exports = {
  readEnvFile,
  upsertEnvKey,
  ensureEnvFileExists,
};
