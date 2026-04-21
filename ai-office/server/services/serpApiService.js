const config = require("../config");

const SEGMENT_QUERY_MAP = {
  business_center: "бизнес центр",
  clinic: "клиника",
  hotel: "отель",
  uk: "управляющая компания",
};

function aiLog(msg) {
  console.log(`[AI OFFICE] ${msg}`);
}

function cityTitle(city) {
  const s = String(city || "").replace(/_/g, " ").trim();
  if (!s) return "";
  return s.slice(0, 1).toUpperCase() + s.slice(1);
}

function buildQuery(city, segment) {
  const base = SEGMENT_QUERY_MAP[segment] || String(segment || "").replace(/_/g, " ");
  return `${base} ${cityTitle(city)}`.trim();
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url, retries = 2) {
  const timeoutMs = Number(config.requestTimeoutMs) || 15000;
  let lastErr = "unknown_error";
  for (let i = 0; i <= retries; i += 1) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      const text = await res.text();
      clearTimeout(t);
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        lastErr = "invalid_json";
        if (i < retries) await sleep(500 * (i + 1));
        continue;
      }
      if (!res.ok) {
        lastErr = data.error || data.message || `http_${res.status}`;
        if (i < retries) await sleep(500 * (i + 1));
        continue;
      }
      return { ok: true, data };
    } catch (e) {
      clearTimeout(t);
      lastErr = e.name === "AbortError" ? "timeout" : String(e.message || e);
      if (i < retries) await sleep(500 * (i + 1));
    }
  }
  return { ok: false, error: lastErr, data: null };
}

function normalizeResult(item) {
  if (!item || typeof item !== "object") return null;
  const name = String(item.title || "").trim();
  const phone = String(item.phone || "").trim();
  const address = String(item.address || "").trim();
  const website = String(item.website || item.link || "").trim();
  const placeId = String(item.place_id || item.data_id || item.gps_coordinates?.place_id || "").trim();
  if (!name) return null;
  return { name, phone, address, website, placeId };
}

function dedupe(items) {
  const out = [];
  const seen = new Set();
  for (const i of items) {
    const key = `${String(i.placeId || "").toLowerCase()}|${String(i.name || "").toLowerCase()}|${String(
      i.address || ""
    ).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(i);
  }
  return out;
}

async function searchLeads(city, segment, options = {}) {
  const key = config.serpApiKey;
  if (!key) return { ok: false, error: "no_serp_api_key", leads: [] };

  const q = buildQuery(city, segment);
  aiLog("Using SerpAPI mode");
  const params = new URLSearchParams({
    engine: "google_maps",
    q,
    type: "search",
    api_key: key,
  });
  const url = `https://serpapi.com/search.json?${params.toString()}`;
  const r = await fetchJsonWithRetry(url, 2);
  if (!r.ok) return { ok: false, error: r.error || "serpapi_failed", leads: [] };

  const localResults = Array.isArray(r.data.local_results) ? r.data.local_results : [];
  const normalized = localResults.map(normalizeResult).filter(Boolean);
  const unique = dedupe(normalized);
  const limitIn = Number(options.limit || 15);
  const limit = Math.max(10, Math.min(20, limitIn));
  const leads = unique.slice(0, limit);
  return { ok: true, leads, query: q };
}

module.exports = {
  searchLeads,
  buildQuery,
};
