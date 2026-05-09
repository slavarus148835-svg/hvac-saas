/**
 * Бонусные дни к paidUntil (Firestore users/{uid}).
 *
 *   node scripts/add-subscription-bonus-days.mjs --uid=XXX --days=7 [--apply]
 *
 * Берёт FIREBASE_SERVICE_ACCOUNT_JSON из .env.vercel.production.local или .env.local
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
dotenv.config({ path: path.join(root, ".env.vercel.production.local") });
dotenv.config({ path: path.join(root, ".env.local") });

const MS_DAY = 24 * 60 * 60 * 1000;

function parseArgs(argv) {
  let uid = "";
  let days = 0;
  let reason = "";
  let apply = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") apply = true;
    else if (a.startsWith("--uid=")) uid = a.slice("--uid=".length).trim();
    else if (a.startsWith("--days=")) days = Number(a.slice("--days=".length));
    else if (a.startsWith("--reason="))
      reason = a.slice("--reason=".length).trim().replace(/^"|"$/g, "");
  }
  return { uid, days, reason, apply };
}

function paidUntilToMs(value) {
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
    typeof value.seconds === "number"
  ) {
    return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
  }
  return 0;
}

function isPaidActive(user) {
  if (!user) return false;
  const paidMs = paidUntilToMs(user.paidUntil);
  const paid = paidMs > 0 ? paidMs : Number(user.paidUntil || 0);
  return paid > Date.now() && (user.plan === "standard" || user.plan === "pro");
}

function accessOpen(user) {
  if (!user || user.blocked) return false;
  if (isPaidActive(user)) return true;
  return false;
}

async function main() {
  const { uid, days, reason, apply } = parseArgs(process.argv);
  if (!uid || !Number.isFinite(days) || days <= 0) {
    console.error(
      "Usage: node scripts/add-subscription-bonus-days.mjs --uid=UID --days=7 [--reason=text] [--apply]"
    );
    process.exit(1);
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw || !String(raw).trim()) {
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON missing");
    process.exit(1);
  }

  let sa;
  try {
    sa = JSON.parse(String(raw));
  } catch {
    try {
      const repaired = String(raw).replace(
        /("private_key":\s*")([\s\S]*?)("\s*,\s*"client_email")/,
        (_, a, key, b) => a + key.replace(/\r?\n/g, "\\n") + b
      );
      sa = JSON.parse(repaired);
    } catch {
      console.error("Invalid FIREBASE_SERVICE_ACCOUNT_JSON");
      process.exit(1);
    }
  }

  if (!getApps().length) initializeApp({ credential: cert(sa) });
  const db = getFirestore();
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error("User doc not found:", uid);
    process.exit(1);
  }

  const before = snap.data();
  const oldMs = paidUntilToMs(before.paidUntil);
  const delta = Math.round(days * MS_DAY);
  const newMs = oldMs + delta;

  const bonusReason =
    reason ||
    "Компенсация за задержку открытия доступа после оплаты";

  console.log(
    JSON.stringify(
      {
        uid,
        oldPaidUntil: oldMs || before.paidUntil,
        newPaidUntil: newMs,
        deltaMs: delta,
        deltaDays: days,
        planBefore: before.plan,
        hasPaidBefore: before.hasPaid === true,
        apply,
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log("\nDry-run. Add --apply to write.");
    process.exit(0);
  }

  await ref.set(
    {
      paidUntil: newMs,
      bonusDaysGranted: days,
      bonusGrantedAt: FieldValue.serverTimestamp(),
      bonusReason,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  const afterSnap = await ref.get();
  const after = afterSnap.data();
  const oldRounded = oldMs;
  const actualDeltaMs = paidUntilToMs(after.paidUntil) - oldRounded;

  console.log(
    "\nAFTER",
    JSON.stringify(
      {
        plan: after.plan,
        hasPaid: after.hasPaid === true,
        paidUntil: paidUntilToMs(after.paidUntil),
        bonusDaysGranted: after.bonusDaysGranted ?? null,
        bonusReason: after.bonusReason ?? null,
        bonusGrantedAt: after.bonusGrantedAt ?? null,
        isPaidActive: isPaidActive(after),
        accessOpen: accessOpen(after),
        actualDeltaMs,
        actualDeltaDays: actualDeltaMs / MS_DAY,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
