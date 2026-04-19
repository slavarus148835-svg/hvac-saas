function ts() {
  return new Date().toISOString();
}

function line(level, msg, extra) {
  const tail = extra !== undefined ? ` ${typeof extra === "string" ? extra : JSON.stringify(extra)}` : "";
  console.log(`[${ts()}] [Revenue PRO] [${level}] ${msg}${tail}`);
}

module.exports = {
  info: (msg, extra) => line("INFO", msg, extra),
  warn: (msg, extra) => line("WARN", msg, extra),
  error: (msg, extra) => line("ERROR", msg, extra),
};
