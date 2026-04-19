/**
 * Локальная проверка SMTP (те же env, что и в sendMail).
 * Использование:
 *   node scripts/test-smtp.mjs recipient@example.com
 *
 * Читает .env.local и .env из корня проекта (через dotenv).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

for (const name of [".env.local", ".env"]) {
  const p = path.join(root, name);
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
    console.log(`[test-smtp] loaded ${name}`);
  }
}

const recipient = process.argv[2]?.trim();
if (!recipient || !recipient.includes("@")) {
  console.error("Usage: node scripts/test-smtp.mjs <recipient@email.com>");
  process.exit(1);
}

const host = String(process.env.SMTP_HOST || "").trim();
const portRaw = String(process.env.SMTP_PORT || "").trim();
const user = String(process.env.SMTP_USER || "").trim();
const pass = String(process.env.SMTP_PASS ?? "").trim();
const from = String(process.env.EMAIL_FROM || "").trim();

if (!host || !portRaw || !user || !pass || !from) {
  console.error(
    "[test-smtp] Missing SMTP env. Need SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (or SMTP_PASSWORD), EMAIL_FROM"
  );
  process.exit(1);
}

const port = Number(portRaw);
if (!Number.isFinite(port) || port <= 0) {
  console.error("[test-smtp] Invalid SMTP_PORT");
  process.exit(1);
}

const secure = port === 465;
console.log(`[test-smtp] host=${host} port=${port} secure=${secure} user set=${Boolean(user)} pass set=${Boolean(pass)} from=${from}`);

const transporter = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: { user, pass },
});

try {
  await transporter.sendMail({
    from,
    to: recipient,
    subject: "HVAC SaaS SMTP test",
    text: "Если вы видите это письмо, SMTP настроен верно.",
  });
  console.log("[test-smtp] SUCCESS: message sent");
  process.exit(0);
} catch (e) {
  const err = e instanceof Error ? e : new Error(String(e));
  const ext = /** @type {Error & { code?: string; responseCode?: string }} */ (err);
  const code = ext.code ?? ext.responseCode ?? "";
  console.error(
    `[test-smtp] FAILED name=${err.name} code=${code || "n/a"} message=${err.message}`
  );
  process.exit(1);
}
