const config = require("../config");
const logger = require("./logger");

let liveModeLogged = false;
let demoModeLogged = false;

function aiOfficeLog(line) {
  console.log(`[AI OFFICE] ${line}`);
}

function withTimeout(ms, signal) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: signal || ctrl.signal, cancel: () => clearTimeout(t) };
}

async function fetchJson(url, opts = {}) {
  const { cancel, signal } = withTimeout(config.requestTimeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, error: "invalid_json", status: res.status, raw: text.slice(0, 200) };
    }
    if (!res.ok) {
      return { ok: false, error: data.error_message || data.status || "http_error", status: res.status, data };
    }
    return { ok: true, data, status: res.status };
  } catch (e) {
    return { ok: false, error: e.name === "AbortError" ? "timeout" : String(e.message || e) };
  } finally {
    cancel();
  }
}

function normalizePlaceSearchItem(item) {
  if (!item || typeof item !== "object") return null;
  const placeId = item.place_id || item.id || "";
  if (!placeId) return null;
  return {
    placeId,
    name: String(item.name || "").trim(),
    address: String(item.formatted_address || item.vicinity || "").trim(),
    types: Array.isArray(item.types) ? item.types : [],
    businessStatus: item.business_status || "",
    raw: item,
  };
}

function normalizeDetails(detailsResult) {
  if (!detailsResult || typeof detailsResult !== "object") {
    return { phone: "", website: "", address: "" };
  }
  const nat = String(detailsResult.national_phone_number || "").trim();
  const intl = String(detailsResult.international_phone_number || "").trim();
  const formatted = String(detailsResult.formatted_phone_number || "").trim();
  const phone = (formatted || intl || nat).trim();
  const website = String(detailsResult.website || "").trim();
  const address = String(detailsResult.formatted_address || "").trim();
  return { phone, website, address };
}

async function searchText(query, pageToken) {
  const key = config.googlePlacesApiKey;
  if (!key) {
    if (!demoModeLogged) {
      demoModeLogged = true;
      aiOfficeLog("Google Places: demo mode");
    }
    return { ok: false, error: "no_api_key", results: [] };
  }
  if (!liveModeLogged) {
    liveModeLogged = true;
    aiOfficeLog("Google Places: live mode");
  }
  const base = "https://maps.googleapis.com/maps/api/place/textsearch/json";
  const params = new URLSearchParams({
    query,
    key,
  });
  if (pageToken) params.set("pagetoken", pageToken);
  const url = `${base}?${params.toString()}`;
  const r = await fetchJson(url);
  if (!r.ok) {
    aiOfficeLog(`Places request failed: ${r.error}`);
    logger.warn("Places TextSearch fail", { query: query.slice(0, 80), err: r.error });
    return { ok: false, error: r.error, results: [] };
  }
  const st = r.data.status;
  if (st && st !== "OK" && st !== "ZERO_RESULTS") {
    const em = r.data.error_message ? String(r.data.error_message).slice(0, 120) : "";
    aiOfficeLog(`Places request failed: ${st}${em ? ` — ${em}` : ""}`);
    logger.warn("Places TextSearch status", st);
    return { ok: false, error: st, results: [] };
  }
  const results = Array.isArray(r.data.results) ? r.data.results : [];
  const nextPageToken = r.data.next_page_token || null;
  const normalized = results.map(normalizePlaceSearchItem).filter(Boolean);
  aiOfficeLog(`Places results: ${normalized.length}`);
  return { ok: true, results: normalized, nextPageToken };
}

async function getPlaceDetails(placeId) {
  const key = config.googlePlacesApiKey;
  if (!key || !placeId) {
    if (!demoModeLogged) {
      demoModeLogged = true;
      aiOfficeLog("Google Places: demo mode");
    }
    return { ok: false, error: "no_api_key_or_place", fields: null };
  }
  const fields = [
    "place_id",
    "name",
    "formatted_address",
    "formatted_phone_number",
    "international_phone_number",
    "website",
    "business_status",
  ].join(",");
  const base = "https://maps.googleapis.com/maps/api/place/details/json";
  const url = `${base}?${new URLSearchParams({ place_id: placeId, fields, key }).toString()}`;
  const r = await fetchJson(url);
  if (!r.ok) {
    aiOfficeLog(`Places request failed: ${r.error}`);
    logger.warn("Places Details fail", { placeId, err: r.error });
    return { ok: false, error: r.error, fields: null };
  }
  const dst = r.data && r.data.status;
  if (dst && dst !== "OK") {
    const em = r.data.error_message ? String(r.data.error_message).slice(0, 120) : "";
    aiOfficeLog(`Places request failed: ${dst}${em ? ` — ${em}` : ""}`);
    logger.warn("Places Details status", dst);
    return { ok: false, error: dst, fields: null };
  }
  const res = r.data && r.data.result;
  if (!res) return { ok: false, error: "empty_result", fields: null };
  return { ok: true, fields: normalizeDetails(res), raw: res };
}

module.exports = {
  searchText,
  getPlaceDetails,
  normalizePlaceSearchItem,
};
