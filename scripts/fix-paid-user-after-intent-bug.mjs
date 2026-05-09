/**
 * Ручная выдача доступа после бага lastPaymentIntent (обрезались months/amount).
 *
 * Требуется: FIREBASE_SERVICE_ACCOUNT_JSON в .env.local или окружении.
 *
 *   node scripts/fix-paid-user-after-intent-bug.mjs --email=user@example.com
 *   node scripts/fix-paid-user-after-intent-bug.mjs --email=user@example.com --apply
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
dotenv.config({ path: path.join(root, ".env") });
dotenv.config({ path: path.join(root, ".env.local") });

const MS_MONTH = 30 * 24 * 60 * 60 * 1000;

function parseArgs(argv) {
  let email = "";
  let apply = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") apply = true;
    else if (a.startsWith("--email=")) email = a.slice("--email=".length).trim();
    else if (a === "--email" && argv[i + 1]) email = argv[++i].trim();
  }
  return { email, apply };
}

function firestoreTimeToMs(value) {
  if (value == null) return 0;
  if (typeof value === "number" && Number.isFinite(value)) {
    const n = value;
    if (n >= 1e11) return Math.round(n);
    if (n >= 1e9) return Math.round(n * 1000);
    return n;
  }
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (
    typeof value === "object" &&
    value !== null &&
    typeof value.seconds === "number" &&
    Number.isFinite(value.seconds)
  ) {
    return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
  }
  return 0;
}

function isPaidActive(user) {
  if (!user) return false;
  const paidMs = firestoreTimeToMs(user.paidUntil);
  const paid = paidMs > 0 ? paidMs : Number(user.paidUntil || 0);
  return paid > Date.now() && (user.plan === "standard" || user.plan === "pro");
}

function summarizeDoc(data) {
  if (!data) return null;
  return {
    plan: data.plan ?? null,
    paidUntil: data.paidUntil ?? null,
    hasPaid: data.hasPaid === true,
    paidAt: data.paidAt ?? null,
    blocked: data.blocked === true,
    lastPaymentIntent: data.lastPaymentIntent ?? null,
    lastPaymentConfirmed: data.lastPaymentConfirmed ?? null,
  };
}

async function main() {
  const { email, apply } = parseArgs(process.argv);
  if (!email) {
    console.error("Usage: node scripts/fix-paid-user-after-intent-bug.mjs --email=user@host --apply");
    process.exit(1);
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw || !String(raw).trim()) {
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON is not set");
    process.exit(1);
  }

  let sa;
  try {
    sa = JSON.parse(String(raw));
  } catch {
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON");
    process.exit(1);
  }

  if (!getApps().length) {
    initializeApp({ credential: cert(sa) });
  }

  const auth = getAuth();
  const db = getFirestore();

  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(email.trim());
  } catch {
    console.error("Auth user not found for email:", email);
    process.exit(1);
  }

  const uid = userRecord.uid;
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  const before = snap.exists ? snap.data() : null;

  console.log(JSON.stringify({ uid, email: userRecord.email, before: summarizeDoc(before) }, null, 2));

  const paidUntilMs = Date.now() + MS_MONTH;
  const patch = {
    plan: "standard",
    blocked: false,
    hasPaid: true,
    paidAt: FieldValue.serverTimestamp(),
    /** Число ms — как в webhook/check-payment (`addMonthsToPaidUntil`). */
    paidUntil: paidUntilMs,
    lastPaymentIntent: FieldValue.delete(),
    lastPaymentConfirmed: {
      orderId: String(before?.lastPaymentIntent?.orderId || "manual_recovery_intent_bug"),
      plan: "standard",
      months: 1,
      amount: 1190 * 100,
      paidUntil: paidUntilMs,
      confirmedAt: new Date().toISOString(),
      source: "manual_script_after_lastPaymentIntent_bug",
    },
    updatedAt: new Date().toISOString(),
  };

  if (!apply) {
    console.log("\nDry-run. Would apply patch:", JSON.stringify({ ...patch, paidAt: "(serverTimestamp)", lastPaymentIntent: "(delete)" }, null, 2));
    console.log("\nRe-run with --apply to write.");
    process.exit(0);
  }

  await ref.set(patch, { merge: true });
  const afterSnap = await ref.get();
  const after = afterSnap.data();
  console.log("\nAFTER:", JSON.stringify(summarizeDoc(after), null, 2));
  console.log("isPaidActive:", isPaidActive(after));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
