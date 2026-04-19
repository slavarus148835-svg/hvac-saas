const https = require("https");

function requestTelegramJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        let data = "";
        response.on("data", (chunk) => {
          data += chunk;
        });
        response.on("end", () => {
          try {
            resolve(data ? JSON.parse(data) : {});
          } catch (error) {
            reject(new Error(`Telegram JSON parse error: ${error.message}`));
          }
        });
      })
      .on("error", (error) => {
        reject(error);
      });
  });
}

function extractChatIdFromUpdate(update) {
  if (!update || typeof update !== "object") return null;
  const msg =
    update.message ||
    update.edited_message ||
    update.channel_post ||
    update.edited_channel_post ||
    update.callback_query?.message;
  const id = msg?.chat?.id;
  return id == null ? null : String(id);
}

async function getLastChatIdFromUpdates(botToken) {
  const token = String(botToken || "").trim();
  if (!token) {
    return { ok: false, error: "token is required" };
  }
  const url = `https://api.telegram.org/bot${token}/getUpdates`;
  const data = await requestTelegramJson(url);
  if (!data.ok) {
    return {
      ok: false,
      error: data.description || "getUpdates failed",
      errorCode: data.error_code,
    };
  }
  const updates = Array.isArray(data.result) ? data.result : [];
  if (updates.length === 0) {
    return { ok: true, chatId: null, message: "no_updates" };
  }
  const last = updates[updates.length - 1];
  const chatId = extractChatIdFromUpdate(last);
  return { ok: true, chatId, message: chatId ? "found" : "no_chat_in_last_update" };
}

module.exports = {
  getLastChatIdFromUpdates,
  requestTelegramJson,
};
