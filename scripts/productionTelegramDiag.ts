/**
 * Production diagnostics: version, webhook info, optional ping.
 *   npx tsx scripts/productionTelegramDiag.ts
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env.vercel.production.local") });
dotenv.config({ path: path.join(ROOT, ".env.local") });

const base = String(
  process.env.NEXT_PUBLIC_APP_URL || "https://hvac-saas-lovat.vercel.app"
).replace(/\/$/, "");
const secret = String(process.env.CRON_SECRET || process.env.INTERNAL_DEBUG_SECRET || "").trim();
const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();

async function main() {
  console.log("=== Production version ===");
  const ver = await fetch(`${base}/api/debug/version`, { cache: "no-store" });
  console.log(ver.status, await ver.json());

  if (token) {
    console.log("\n=== getWebhookInfo ===");
    const wh = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    console.log(await wh.json());
  } else {
    console.log("\nTELEGRAM_BOT_TOKEN missing locally");
  }

  if (secret) {
    console.log("\n=== telegram-webhook-test ===");
    const t = await fetch(
      `${base}/api/debug/telegram-webhook-test?secret=${encodeURIComponent(secret)}`,
      { cache: "no-store" }
    );
    console.log(t.status, await t.json());

    console.log("\n=== telegram-miniapp-test ===");
    const m = await fetch(
      `${base}/api/debug/telegram-miniapp-test?secret=${encodeURIComponent(secret)}`,
      { cache: "no-store" }
    );
    console.log(m.status, await m.json());
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
