/**
 *   npx tsx scripts/resetTelegramWebhook.ts
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import {
  telegramGetWebhookInfo,
  telegramSetWebhook,
} from "../lib/server/telegramBotApiDebug";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env.vercel.production.local") });
dotenv.config({ path: path.join(ROOT, ".env.local") });

const TARGET = "https://hvac-saas-lovat.vercel.app/api/telegram/webhook";

async function main() {
  console.log("BEFORE", JSON.stringify(await telegramGetWebhookInfo(), null, 2));
  console.log("SET", JSON.stringify(await telegramSetWebhook(TARGET), null, 2));
  console.log("AFTER", JSON.stringify(await telegramGetWebhookInfo(), null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
