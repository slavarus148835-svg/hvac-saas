import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Диагностика production: какой commit реально задеплоен на Vercel.
 * Без секретов. После деплоя открыть GET /api/debug/version
 */
export async function GET() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  const body = {
    commit,
    commitShort: commit ? commit.slice(0, 7) : null,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    env: process.env.VERCEL_ENV ?? null,
    time: new Date().toISOString(),
    buildMarkers: {
      TELEGRAM_WEBHOOK_HIT: true,
      statFastPathBeforeFirestoreSync: true,
      miniAppBootstrapV2: true,
      retryPolicy88ce754: true,
      statFailSafeCd87b5e: true,
      statsGlobalUltraLight: true,
      miniAppDegradedQuota: true,
      /** Основная + дренажная штроба, мин. 1 м/комната (ожидается с 28cb18f+). */
      calculatorStrobaDrainV2: true,
      /** Скрытие моделей в режиме «Закладка трасс» (ожидается с dd41e02+). */
      hideAcModelsRoughInV1: true,
      /** 4 поля штробы (бетон + кирпич) без селектора материала. */
      calculatorStrobaDualMaterialV1: true,
      /** Partner attach only with session referral + subscription gate on Mini App APIs. */
      miniAppPartnerAttachV2: true,
      miniAppSubscriptionGateV1: true,
      firestoreSafeMode: process.env.FIRESTORE_SAFE_MODE === "1",
      firestoreHeavyScansDisabled:
        process.env.FIRESTORE_SAFE_MODE === "1" ||
        process.env.FIRESTORE_DISABLE_HEAVY_SCANS === "1",
      firestoreCounterBumpsDisabled:
        process.env.FIRESTORE_SAFE_MODE === "1" ||
        process.env.FIRESTORE_DISABLE_COUNTER_BUMPS === "1",
    },
  };
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}
