const OpenAI = require("openai");
const config = require("../config");
const logger = require("./logger");

let client = null;
function getClient() {
  if (!config.openaiApiKey) return null;
  if (!client) {
    client = new OpenAI({ apiKey: config.openaiApiKey });
  }
  return client;
}

async function chatJson(system, user) {
  const c = getClient();
  if (!c) return { ok: false, error: "no_openai_key", parsed: null, text: "" };
  try {
    const resp = await c.chat.completions.create({
      model: config.openaiModel,
      temperature: 0.35,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    });
    const text = resp.choices?.[0]?.message?.content || "";
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    if (!parsed && text) logger.warn("OpenAI JSON parse fail", text.slice(0, 120));
    return { ok: true, parsed, text };
  } catch (e) {
    logger.warn("OpenAI chatJson error", String(e.message || e));
    return { ok: false, error: String(e.message || e), parsed: null, text: "" };
  }
}

async function chatText(system, user) {
  const c = getClient();
  if (!c) return { ok: false, error: "no_openai_key", text: "" };
  try {
    const resp = await c.chat.completions.create({
      model: config.openaiModel,
      temperature: 0.35,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const text = (resp.choices?.[0]?.message?.content || "").trim();
    return { ok: true, text };
  } catch (e) {
    logger.warn("OpenAI chatText error", String(e.message || e));
    return { ok: false, error: String(e.message || e), text: "" };
  }
}

module.exports = {
  chatJson,
  chatText,
  getClient,
};
