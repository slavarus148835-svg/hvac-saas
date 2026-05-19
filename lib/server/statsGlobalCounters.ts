import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isFirestoreCapacityError } from "@/lib/server/statsUsersSnapshot";

export const STATS_GLOBAL_DOC_PATH = "stats/global";

/** stats/_daily/days/{YYYY-MM-DD} — subcollection (collection id cannot contain "/"). */
export function statsDailyDocRef(db: Firestore, dateKey: string) {
  return db.collection("stats").doc("_daily").collection("days").doc(dateKey);
}

export type StatsGlobalCounters = {
  totalUsers: number;
  telegramUsers: number;
  paidUsers: number;
  trialActiveUsers: number;
  endedTrialUsers: number;
  usersWithCalculation: number;
  totalCalculations: number;
  updatedAt: string | null;
};

export type StatsDailyCounters = {
  date: string;
  registrations: number;
  paid: number;
  calculations: number;
  updatedAt: string | null;
};

const EMPTY_GLOBAL: StatsGlobalCounters = {
  totalUsers: 0,
  telegramUsers: 0,
  paidUsers: 0,
  trialActiveUsers: 0,
  endedTrialUsers: 0,
  usersWithCalculation: 0,
  totalCalculations: 0,
  updatedAt: null,
};

type CacheEntry = { atMs: number; global: StatsGlobalCounters | null };
let globalCache: CacheEntry | null = null;
const CACHE_TTL_MS = 60_000;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function envOn(name: string): boolean {
  return String(process.env[name] || "").trim() === "1";
}

/** Legacy: blocks heavy scans AND counter bumps. Prefer split flags below. */
export function isFirestoreSafeMode(): boolean {
  return envOn("FIRESTORE_SAFE_MODE");
}

/** Campaign notify, cron user scans, debug funnel/trial full scans. */
export function isFirestoreHeavyScansDisabled(): boolean {
  return envOn("FIRESTORE_SAFE_MODE") || envOn("FIRESTORE_DISABLE_HEAVY_SCANS");
}

/** Incremental stats/global + stats/daily bumps (registration, payment, calc, tg link). */
export function isFirestoreCounterBumpsDisabled(): boolean {
  return envOn("FIRESTORE_SAFE_MODE") || envOn("FIRESTORE_DISABLE_COUNTER_BUMPS");
}

export function utcDateKey(ms = Date.now()): string {
  const d = new Date(ms);
  return d.toISOString().slice(0, 10);
}

export function yesterdayUtcDateKey(ms = Date.now()): string {
  return utcDateKey(ms - 24 * 60 * 60 * 1000);
}

function parseGlobal(data: Record<string, unknown> | undefined): StatsGlobalCounters {
  if (!data) return { ...EMPTY_GLOBAL };
  return {
    totalUsers: num(data.totalUsers),
    telegramUsers: num(data.telegramUsers),
    paidUsers: num(data.paidUsers),
    trialActiveUsers: num(data.trialActiveUsers),
    endedTrialUsers: num(data.endedTrialUsers),
    usersWithCalculation: num(data.usersWithCalculation),
    totalCalculations: num(data.totalCalculations),
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
  };
}

function parseDaily(data: Record<string, unknown> | undefined, date: string): StatsDailyCounters {
  return {
    date,
    registrations: num(data?.registrations),
    paid: num(data?.paid),
    calculations: num(data?.calculations),
    updatedAt: typeof data?.updatedAt === "string" ? data.updatedAt : null,
  };
}

/** Fire-and-forget counter bump; never blocks user flows on failure. */
export function bumpStatsCounters(
  patch: Partial<Record<keyof StatsGlobalCounters, number>> & {
    daily?: Partial<Pick<StatsDailyCounters, "registrations" | "paid" | "calculations">>;
    dateKey?: string;
  }
): void {
  if (isFirestoreCounterBumpsDisabled()) {
    console.log("STATS_COUNTER_BUMP_SKIPPED", {
      reason: envOn("FIRESTORE_SAFE_MODE")
        ? "FIRESTORE_SAFE_MODE"
        : "FIRESTORE_DISABLE_COUNTER_BUMPS",
      patch: Object.keys(patch).filter((k) => k !== "daily" && k !== "dateKey"),
    });
    return;
  }
  const db = getAdminDb();
  if (!db) return;

  const dateKey = patch.dateKey ?? utcDateKey();
  const globalInc: Record<string, ReturnType<typeof FieldValue.increment>> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === "daily" || k === "dateKey") continue;
    if (typeof v === "number" && v !== 0) {
      globalInc[k] = FieldValue.increment(v);
    }
  }

  void (async () => {
    try {
      const globalRef = db.doc(STATS_GLOBAL_DOC_PATH);
      if (Object.keys(globalInc).length > 0) {
        await globalRef.set(
          { ...globalInc, updatedAt: new Date().toISOString() },
          { merge: true }
        );
      }
      if (patch.daily) {
        const dailyInc: Record<string, unknown> = { updatedAt: new Date().toISOString() };
        for (const [k, v] of Object.entries(patch.daily)) {
          if (typeof v === "number" && v !== 0) {
            dailyInc[k] = FieldValue.increment(v);
          }
        }
        await statsDailyDocRef(db, dateKey).set(dailyInc, { merge: true });
      }
      globalCache = null;
    } catch (e) {
      console.warn("STATS_COUNTER_BUMP_FAILED", {
        message: e instanceof Error ? e.message : String(e),
        capacity: isFirestoreCapacityError(e),
      });
    }
  })();
}

export async function readStatsGlobal(db: Firestore): Promise<StatsGlobalCounters> {
  const snap = await db.doc(STATS_GLOBAL_DOC_PATH).get();
  return snap.exists ? parseGlobal(snap.data() as Record<string, unknown>) : { ...EMPTY_GLOBAL };
}

export async function readStatsGlobalCached(db: Firestore): Promise<StatsGlobalCounters> {
  const now = Date.now();
  if (globalCache && now - globalCache.atMs < CACHE_TTL_MS) {
    return globalCache.global ?? { ...EMPTY_GLOBAL };
  }
  const global = await readStatsGlobal(db);
  globalCache = { atMs: now, global };
  return global;
}

export async function readStatsDaily(
  db: Firestore,
  dateKey: string
): Promise<StatsDailyCounters> {
  const snap = await statsDailyDocRef(db, dateKey).get();
  return parseDaily(snap.exists ? (snap.data() as Record<string, unknown>) : undefined, dateKey);
}

export type UltraLightStatReadMeta = {
  reads: number;
  durationMs: number;
  globalFound: boolean;
  dailyFound: boolean;
  globalCacheHit?: boolean;
};

/**
 * Ultra-light /stat: at most 2 Firestore reads (stats/global + stats/daily/yesterday).
 */
export async function buildTelegramUltraLightStatsReport(
  nowMs = Date.now()
): Promise<{ text: string; meta: UltraLightStatReadMeta }> {
  const started = Date.now();
  const db = getAdminDb();
  if (!db) {
    return {
      text: "❌ Firestore admin недоступен.",
      meta: { reads: 0, durationMs: 0, globalFound: false, dailyFound: false },
    };
  }

  let reads = 0;
  let global: StatsGlobalCounters;
  let daily: StatsDailyCounters;
  const yKey = yesterdayUtcDateKey(nowMs);
  const hadGlobalCache =
    globalCache != null && Date.now() - globalCache.atMs < CACHE_TTL_MS;

  try {
    global = await readStatsGlobalCached(db);
    if (!hadGlobalCache) reads += 1;
    const dSnap = await statsDailyDocRef(db, yKey).get();
    reads += 1;
    daily = parseDaily(dSnap.exists ? (dSnap.data() as Record<string, unknown>) : undefined, yKey);
  } catch (e) {
    const capacity = isFirestoreCapacityError(e);
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error("STAT_ULTRA_LIGHT_READ_ERROR", {
      capacity,
      message: errMsg,
      stack: e instanceof Error ? e.stack : undefined,
    });
    const readHint = errMsg.includes("collectionPath")
      ? "❌ Ошибка пути stats/daily (конфигурация)."
      : capacity
        ? "❌ Firestore перегружен (quota). Статистика из счётчиков временно недоступна.\nПовторите через 30–60 мин."
        : "❌ Ошибка чтения stats/global или stats/daily.";
    return {
      text: readHint,
      meta: {
        reads,
        durationMs: Date.now() - started,
        globalFound: false,
        dailyFound: false,
      },
    };
  }

  const globalFound = global.updatedAt != null || global.totalUsers > 0;
  const dailyFound = daily.updatedAt != null;

  const conv =
    daily.registrations > 0
      ? `${((daily.paid / daily.registrations) * 100).toFixed(2)}%`
      : "0%";

  const text = [
    "📊 HVAC-SaaS (счётчики, ultra-light)",
    "",
    `👥 Регистрации за вчера: ${daily.registrations}`,
    `💰 Оплаты за вчера: ${daily.paid}`,
    `📈 Конверсия за вчера: ${conv}`,
    "",
    "📊 Всего (накопительно)",
    `• Пользователей: ${global.totalUsers}`,
    `• С Telegram: ${global.telegramUsers}`,
    `• С расчётом: ${global.usersWithCalculation}`,
    `• Реально оплатили: ${global.paidUsers}`,
    `• Активный триал: ${global.trialActiveUsers}`,
    `• Триал закончился: ${global.endedTrialUsers}`,
    `• Всего расчётов: ${global.totalCalculations}`,
    "",
    globalFound
      ? `Обновлено: ${global.updatedAt ?? "—"}`
      : "⚠️ Счётчики не инициализированы. Запустите: npx tsx scripts/backfillStatsGlobal.ts",
  ].join("\n");

  return {
    text,
    meta: {
      reads,
      durationMs: Date.now() - started,
      globalFound,
      dailyFound,
      globalCacheHit: hadGlobalCache || (globalCache != null && Date.now() - globalCache.atMs < CACHE_TTL_MS),
    },
  };
}
