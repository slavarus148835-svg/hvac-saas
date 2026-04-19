/**
 * Статическая проверка: в репозитории активен только code-flow подтверждения почты,
 * без link-flow UI и без sendEmailVerification в приложении.
 *
 * Запуск: node scripts/verify-email-code-flow.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function read(p) {
  return fs.readFileSync(p, "utf8");
}

function exists(p) {
  return fs.existsSync(p);
}

const errors = [];
function fail(msg) {
  errors.push(msg);
  console.error(`FAIL: ${msg}`);
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

// 1) Нет страницы /verify-email (только редирект в next.config)
const legacyPage = path.join(root, "app", "verify-email", "page.tsx");
if (exists(legacyPage)) {
  fail(`Legacy route page must not exist: ${legacyPage}`);
} else {
  ok("app/verify-email/page.tsx отсутствует");
}

// 2) next.config — редиректы на /verify-email-code
const nextConfigPath = path.join(root, "next.config.ts");
const nextSrc = read(nextConfigPath);
if (!nextSrc.includes('source: "/verify-email"') || !nextSrc.includes("/verify-email-code")) {
  fail("next.config.ts: ожидаются redirects /verify-email -> /verify-email-code");
} else {
  ok("next.config.ts: редиректы /verify-email -> /verify-email-code");
}

// 3) Гейт: не использовать user.emailVerified как обход (старый link-flow)
const gatePath = path.join(root, "lib", "emailVerificationGate.ts");
const gateSrc = read(gatePath);
if (gateSrc.includes("user.emailVerified === true")) {
  fail("emailVerificationGate.ts: не должно быть обхода по user.emailVerified === true");
} else {
  ok("emailVerificationGate.ts: нет обхода по user.emailVerified");
}
if (!gateSrc.includes("emailVerifiedByCode")) {
  fail("emailVerificationGate.ts: ожидается проверка emailVerifiedByCode");
} else {
  ok("emailVerificationGate.ts: используется emailVerifiedByCode");
}

// 4) Запрещённые строки старого link-UI (скрин production) — не должны быть в исходниках
const forbiddenUi = [
  { re: /Мы отправили письмо со ссылкой/i, label: "«Мы отправили письмо со ссылкой»" },
  { re: /Я подтвердил почту/i, label: "«Я подтвердил почту»" },
  { re: /Повторная отправка через/i, label: "«Повторная отправка через»" },
  { re: /Проверка статуса выполняется автоматически/i, label: "«Проверка статуса…»" },
  { re: /После перехода по ссылке/i, label: "«После перехода по ссылке»" },
];

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "coverage",
  "playwright-report",
  "test-results",
]);

function walkDir(dir, acc, exts) {
  if (!exists(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkDir(full, acc, exts);
    else if (exts.test(e.name)) acc.push(full);
  }
}

/** Исходники приложения + components + public html (не scripts — там regex в проверке) */
const scanRoots = [
  path.join(root, "app"),
  path.join(root, "lib"),
  path.join(root, "components"),
  path.join(root, "src"),
  path.join(root, "pages"),
  path.join(root, "public"),
].filter(exists);

const allowResetPassword = path.join(root, "app", "reset-password", "page.tsx");
const extSource = /\.(tsx|ts|jsx|js)$/;
const extHtml = /\.(html|htm)$/;

function collectFiles() {
  const acc = [];
  for (const d of scanRoots) {
    const isPublic = d.endsWith(`${path.sep}public`);
    walkDir(d, acc, isPublic ? extHtml : extSource);
  }
  return acc;
}

for (const file of collectFiles()) {
  if (file === allowResetPassword) continue;
  const text = read(file);
  for (const { re, label } of forbiddenUi) {
    if (re.test(text)) {
      fail(`Запрещённый UI (${label}) в ${path.relative(root, file)}`);
    }
  }
}
if (!errors.some((e) => e.includes("Запрещённый UI"))) {
  ok("Запрещённые строки скрина link-flow не найдены в исходниках (app/lib/components/public/… )");
}

// 4b) Edge: proxy (Next 16) + vercel — /verify-email не должен отдавать React
const proxyPath = path.join(root, "proxy.ts");
if (!exists(proxyPath) || !read(proxyPath).includes("/verify-email-code")) {
  fail("proxy.ts: ожидается редирект на /verify-email-code");
} else {
  ok("proxy.ts: редирект /verify-email -> /verify-email-code");
}
const vercelPath = path.join(root, "vercel.json");
if (exists(vercelPath)) {
  const vSrc = read(vercelPath);
  if (!vSrc.includes("/verify-email") || !vSrc.includes("/verify-email-code")) {
    fail("vercel.json: ожидаются redirects на /verify-email-code");
  } else {
    ok("vercel.json: redirects для /verify-email");
  }
}

// 5) Нет вызова sendEmailVerification( в приложении
const sendRe = /\bsendEmailVerification\s*\(/;
const appLibFiles = [];
for (const d of [path.join(root, "app"), path.join(root, "lib")].filter(exists)) {
  walkDir(d, appLibFiles, extSource);
}
for (const file of appLibFiles) {
  const text = read(file);
  if (sendRe.test(text)) {
    fail(`sendEmailVerification( обнаружен в ${path.relative(root, file)}`);
  }
}
if (!errors.some((e) => e.includes("sendEmailVerification("))) {
  ok("Нет вызова sendEmailVerification(");
}

// 6) register: только VERIFY_EMAIL_CODE_PATH (литерала "verify-email-code" в файле может не быть)
const registerPath = path.join(root, "app", "register", "page.tsx");
const regSrc = read(registerPath);
const evPath = path.join(root, "lib", "emailVerification.ts");
const evSrc = read(evPath);
if (!regSrc.includes("VERIFY_EMAIL_CODE_PATH")) {
  fail("register/page.tsx: ожидается импорт VERIFY_EMAIL_CODE_PATH");
} else if (!evSrc.includes('"/verify-email-code"')) {
  fail("lib/emailVerification.ts: VERIFY_EMAIL_CODE_PATH должен указывать на /verify-email-code");
} else {
  ok("register + lib/emailVerification: маршрут /verify-email-code через VERIFY_EMAIL_CODE_PATH");
}
// 7) verify-email-code: ожидаемые фрагменты копирайта про код
const vecPath = path.join(root, "app", "verify-email-code", "page.tsx");
const vecSrc = read(vecPath);
if (!vecSrc.includes("6-значн") && !vecSrc.includes("6-значный")) {
  fail("verify-email-code/page.tsx: ожидается текст про 6-значный код");
} else {
  ok("verify-email-code/page.tsx: есть упоминание 6-значного кода");
}

console.log("\n---");
if (errors.length) {
  console.error(`Проверка не пройдена: ${errors.length} ошибок`);
  process.exit(1);
}
console.log("Проверка code-flow пройдена.");
process.exit(0);
