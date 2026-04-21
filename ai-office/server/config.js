const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const rootDir = path.join(__dirname, "..");

module.exports = {
  rootDir,
  dataDir: path.join(rootDir, "data"),
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || "",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
  googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY || "",
  serpApiKey: process.env.SERP_API_KEY || "",
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS) || 15000,
  placesSearchPerQuery: Math.min(20, Number(process.env.PLACES_SEARCH_LIMIT) || 10),
  maxDetailFetches: Number(process.env.MAX_PLACE_DETAILS) || 25,
};
