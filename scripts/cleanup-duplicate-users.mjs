/**
 * Безопасная очистка дублей в Firestore `users` для одного email.
 * Канонический UID берётся только из Firebase Authentication (getUserByEmail).
 *
 * Требуется: FIREBASE_SERVICE_ACCOUNT_JSON (JSON сервисного аккаунта в одну строку).
 *
 * Запуск:
 *   node scripts/cleanup-duplicate-users.mjs --email=user@example.com
 *   node scripts/cleanup-duplicate-users.mjs --email=user@example.com --apply
 *
 * По умолчанию — dry-run (ничего не пишет и не удаляет).
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
dotenv.config({ path: path.join(root, ".env") });
dotenv.config({ path: path.join(root, ".env.local") });

const KNOWN_USER_SUBCOLLECTIONS = ["models", "pricing"];

function parseArgs(argv) {
  let email = "";
  let apply = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") apply = true;
    else if (a.startsWith("--email=")) email = a.slice("--email=".length).trim();
    else if (a === "--email" && argv[i + 1]) {
      email = argv[++i].trim();
    }
  }
  return { email, apply };
}

function normalizeEmail(s) {
  return String(s || "").trim().toLowerCase();
}

function isEmptyValue(v) {
  if (v === undefined || v === null) return true;
  if (typeof v === "string" && v.trim() === "") return true;
  return false;
}

/**
 * Поверхностное заполнение: в target копируем из source только те ключи,
 * для которых в target значение «пустое».
 */
function mergeMissingFields(target, source, canonicalUid) {
  /** @type {Record<string, unknown>} */
  const merged = { ...target };
  /** @type {Record<string, unknown>} */
  const added = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === "uid" && typeof value === "string" && value !== canonicalUid) {
      continue;
    }
    if (!isEmptyValue(merged[key]) || isEmptyValue(value)) continue;
    merged[key] = value;
    added[key] = value;
  }
  merged.uid = canonicalUid;
  return { merged, added };
}

function diffExtraFields(canonicalData, duplicateData) {
  /** @type {string[]} */
  const keys = [];
  for (const key of Object.keys(duplicateData)) {
    if (key === "uid") continue;
    const d = duplicateData[key];
    const c = canonicalData[key];
    if (!isEmptyValue(d) && isEmptyValue(c)) keys.push(key);
  }
  return keys;
}

async function countByUid(db, collectionName, uid) {
  const snap = await db.collection(collectionName).where("uid", "==", uid).get();
  return snap.size;
}

async function docExists(db, coll, id) {
  const s = await db.collection(coll).doc(id).get();
  return s.exists;
}

async function deleteSubcollectionsOfUserDoc(userDocRef) {
  const cols = await userDocRef.listCollections();
  const names = cols.map((c) => c.id);
  let deletedDocs = 0;
  for (const col of cols) {
    const snap = await col.get();
    for (const d of snap.docs) {
      console.log(`    удаление: ${col.id}/${d.id}`);
      await d.ref.delete();
      deletedDocs++;
    }
  }
  return { subcollectionNames: names, deletedDocs };
}

function initAdmin() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw || !String(raw).trim()) {
    console.error(
      "[cleanup-duplicate-users] Задайте FIREBASE_SERVICE_ACCOUNT_JSON (см. DEPLOY_CHECKLIST.md)."
    );
    process.exit(1);
  }
  let sa;
  try {
    sa = JSON.parse(String(raw));
  } catch (e) {
    console.error("[cleanup-duplicate-users] FIREBASE_SERVICE_ACCOUNT_JSON не является валидным JSON.", e);
    process.exit(1);
  }
  if (getApps().length === 0) {
    initializeApp({ credential: cert(sa) });
  }
  return { auth: getAuth(), db: getFirestore() };
}

async function main() {
  const { email: emailArg, apply } = parseArgs(process.argv);
  if (!emailArg) {
    console.error(
      "Usage: node scripts/cleanup-duplicate-users.mjs --email=user@example.com [--apply]"
    );
    process.exit(1);
  }

  const targetEmail = normalizeEmail(emailArg);
  const { auth, db } = initAdmin();

  let authUser;
  try {
    authUser = await auth.getUserByEmail(targetEmail);
  } catch (e) {
    console.error(
      "[cleanup-duplicate-users] Пользователь с таким email не найден в Firebase Authentication:",
      e?.message || e
    );
    process.exit(1);
  }

  const canonicalUid = authUser.uid;
  const authEmail = authUser.email ? normalizeEmail(authUser.email) : targetEmail;

  console.log("=== Связка в проекте ===");
  console.log("Firebase Auth user ↔ Firestore `users/{documentId}`: documentId == Auth UID.");
  console.log("Доп. данные: `priceLists/{uid}`, `users/{uid}/models`, `calculationHistory` (поле uid).");
  console.log("");

  console.log("=== Канонический пользователь (только Auth) ===");
  console.log("  email (Auth):", authUser.email);
  console.log("  uid (Auth):  ", canonicalUid);
  console.log("");

  const emailVariants = [...new Set([authUser.email, targetEmail].filter(Boolean))];

  /** @type {Map<string, import("firebase-admin/firestore").DocumentSnapshot>} */
  const byId = new Map();
  for (const em of emailVariants) {
    const snap = await db.collection("users").where("email", "==", em).get();
    for (const d of snap.docs) byId.set(d.id, d);
  }

  const canonicalRef = db.collection("users").doc(canonicalUid);
  const canonicalSnap = await canonicalRef.get();
  if (canonicalSnap.exists) {
    byId.set(canonicalUid, canonicalSnap);
  }

  /** @type {import("firebase-admin/firestore").DocumentSnapshot[]} */
  const uniqueDocs = [];
  for (const [id, docSnap] of byId) {
    const data = docSnap.data() || {};
    if (id === canonicalUid) {
      uniqueDocs.push(docSnap);
      continue;
    }
    const emField = data.email;
    if (isEmptyValue(emField)) {
      console.warn(
        `[cleanup-duplicate-users] пропуск users/${id}: нет поля email — не считаем дублем для удаления`
      );
      continue;
    }
    if (normalizeEmail(emField) !== authEmail) {
      console.warn(
        `[cleanup-duplicate-users] пропуск users/${id}: email в документе не совпадает с Auth — не трогаем`
      );
      continue;
    }
    uniqueDocs.push(docSnap);
  }

  const duplicates = uniqueDocs.filter((d) => d.id !== canonicalUid);

  console.log("=== Документы users (кандидаты: запросы по email + обязательно users/{Auth UID}) ===");
  for (const d of uniqueDocs) {
    const data = d.data() || {};
    const em = data.email ?? "(нет поля email)";
    const uidField = data.uid ?? "(нет поля uid)";
    console.log(`  id=${d.id}  email=${em}  uid=${uidField}`);
  }
  console.log("");

  console.log("=== Решение ===");
  console.log("  Оставить документ: users/" + canonicalUid);
  console.log("  Дублей к удалению:", duplicates.length);
  if (duplicates.length) {
    console.log("  ID дублей:", duplicates.map((d) => d.id).join(", "));
  }
  console.log("");

  const canonicalData = canonicalSnap.exists ? canonicalSnap.data() || {} : {};

  console.log("=== Поля только в дублях (пусто в каноническом) — diff ===");
  let anyMerge = false;
  for (const dup of duplicates) {
    const dupData = dup.data ? dup.data() || {} : {};
    const extra = diffExtraFields(canonicalData, dupData);
    if (extra.length) {
      anyMerge = true;
      console.log(`  Документ ${dup.id}:`);
      for (const key of extra) {
        const v = dupData[key];
        const preview =
          typeof v === "object" && v !== null
            ? JSON.stringify(v).slice(0, 240) + (JSON.stringify(v).length > 240 ? "…" : "")
            : String(v);
        console.log(`    + ${key}: ${preview}`);
      }
    }
  }
  if (!anyMerge) console.log("  (нет таких полей)");
  console.log("");

  console.log("=== Связанные коллекции по UID (только отчёт; скрипт не удаляет эти данные) ===");
  const uidsToScan = [canonicalUid, ...duplicates.map((d) => d.id)];
  for (const uid of uidsToScan) {
    const pl = await docExists(db, "priceLists", uid);
    const nHist = await countByUid(db, "calculationHistory", uid);
    const nBugs = await countByUid(db, "bugReports", uid);
    const nReports = await countByUid(db, "reports", uid);
    console.log(
      `  uid ${uid}: priceLists ${pl ? "есть" : "нет"}, calculationHistory=${nHist}, bugReports=${nBugs}, reports=${nReports}`
    );
    for (const sub of KNOWN_USER_SUBCOLLECTIONS) {
      const subSnap = await db.collection("users").doc(uid).collection(sub).limit(5).get();
      console.log(`    users/${uid}/${sub}: ${subSnap.size} док. (показано до 5)`);
    }
  }
  console.log("");

  if (!apply) {
    console.log("=== DRY-RUN ===");
    console.log("Повторите с --apply для переноса пустых полей в канонический документ и удаления дублей.");
    console.log("Firebase Authentication не изменяется.");
    return;
  }

  if (duplicates.length === 0) {
    console.log("=== ПРИМЕНЕНИЕ ===");
    console.log("Дублей не найдено — удаление и перенос полей не выполняются.");
    return;
  }

  console.log("=== ПРИМЕНЕНИЕ ===");

  let mergedCanonical = { ...canonicalData };
  /** @type {Record<string, Record<string, unknown>>} */
  const transferred = {};

  for (const dup of duplicates) {
    const dupData = dup.data ? dup.data() || {} : {};
    const { merged, added } = mergeMissingFields(mergedCanonical, dupData, canonicalUid);
    mergedCanonical = merged;
    if (Object.keys(added).length) transferred[dup.id] = added;
  }

  mergedCanonical.uid = canonicalUid;
  if (authUser.email) mergedCanonical.email = authUser.email;
  mergedCanonical.updatedAt = new Date().toISOString();

  await canonicalRef.set(mergedCanonical, { merge: true });
  console.log("Обновлён документ users/" + canonicalUid + " (merge).");

  if (Object.keys(transferred).length) {
    console.log("Перенесённые поля в канонический документ:");
    for (const [dupId, fields] of Object.entries(transferred)) {
      console.log(`  с ${dupId}:`, Object.keys(fields).join(", "));
    }
  } else {
    console.log("Дополнительные поля из дублей не переносились (всё уже было заполнено или пусто).");
  }

  /** @type {string[]} */
  const deletedIds = [];

  for (const dup of duplicates) {
    const dupRef = dup.ref || db.collection("users").doc(dup.id);
    console.log("Удаление дубля users/" + dup.id + " …");
    const { subcollectionNames, deletedDocs } = await deleteSubcollectionsOfUserDoc(dupRef);
    if (subcollectionNames.length) {
      console.log(`  Удалены подколлекции: ${subcollectionNames.join(", ")} (${deletedDocs} док.)`);
    }
    await dupRef.delete();
    deletedIds.push(dup.id);
  }

  console.log("");
  console.log("=== Итог ===");
  console.log("  Канонический UID:", canonicalUid);
  console.log("  Удалены документы users:", deletedIds.length ? deletedIds.join(", ") : "(нет)");
  console.log("  Auth: без изменений.");

  const verify = await db.collection("users").where("email", "==", authUser.email).get();
  const stillDup = verify.docs.filter((d) => d.id !== canonicalUid);
  console.log(
    "  Осталось документов users с этим email:",
    verify.size,
    stillDup.length ? `(внимание: ещё id ${stillDup.map((d) => d.id)})` : "(только канонический)"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
