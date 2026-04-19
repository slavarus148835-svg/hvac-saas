const crypto = require("crypto");
const config = require("../config");

const SEGMENT_KEYWORD = {
  business_center: "бизнес центр",
  clinic: "клиника",
  hotel: "отель",
  uk: "управляющая компания",
  restaurant: "ресторан",
  store: "магазин",
  fitness: "фитнес клуб",
  office: "офис компании",
  warehouse: "склад",
};

function aiOfficeLog(line) {
  console.log(`[AI OFFICE] ${line}`);
}

function cityTitle(city) {
  const s = String(city || "").replace(/_/g, " ").trim();
  if (!s) return "";
  return s.slice(0, 1).toUpperCase() + s.slice(1);
}

function buildQuery(city, segment) {
  const ct = cityTitle(city);
  const kw = SEGMENT_KEYWORD[String(segment || "").toLowerCase()] || String(segment || "").replace(/_/g, " ");
  return `${kw} ${ct}`.trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url) {
  const max = 3;
  const ua =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  let lastErr = "unknown";
  for (let i = 0; i < max; i += 1) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), config.requestTimeoutMs || 15000);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          "User-Agent": ua,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
        },
      });
      clearTimeout(t);
      const text = await res.text();
      if (!res.ok) {
        lastErr = `http_${res.status}`;
        await sleep(600 + i * 400);
        continue;
      }
      if (text && (text.includes("detected unusual traffic") || text.includes("unusual traffic"))) {
        lastErr = "blocked";
        await sleep(800);
        continue;
      }
      return { ok: true, html: text };
    } catch (e) {
      clearTimeout(t);
      lastErr = e.name === "AbortError" ? "timeout" : String(e.message || e);
      await sleep(600 + i * 400);
    }
  }
  return { ok: false, error: lastErr, html: "" };
}

function syntheticPlaceId(name) {
  const h = crypto.createHash("sha1").update(String(name || "").toLowerCase()).digest("hex").slice(0, 20);
  return `scrape_${h}`;
}

function parseFromHtml(html, city, segment, limit) {
  const out = [];
  const seen = new Set();
  if (!html || typeof html !== "string") return out;

  const rePlace = /https?:\/\/www\.google\.com\/maps\/place\/([^/?#"'\s<>]+)/gi;
  let m;
  while ((m = rePlace.exec(html)) !== null && out.length < limit) {
    let raw = m[1];
    try {
      raw = decodeURIComponent(raw.replace(/\+/g, "%20"));
    } catch {
      raw = raw.replace(/\+/g, " ");
    }
    const bits = raw.split("/").filter(Boolean);
    const head = (bits[0] || "").replace(/\+/g, " ").trim();
    if (head.length < 2) continue;
    const parts = head.split(",").map((x) => x.trim()).filter(Boolean);
    const name = (parts[0] || head).slice(0, 180);
    const address = (parts.slice(1).join(", ") || `${cityTitle(city)}`).slice(0, 220);
    const slice = html.slice(Math.max(0, m.index - 400), m.index + 1200);
    const pid = (slice.match(/ChIJ[a-zA-Z0-9_-]{10,}/) || [])[0] || syntheticPlaceId(`${name}|${address}`);
    const key = pid;
    if (seen.has(key)) continue;
    seen.add(key);
    const phoneMatch = slice.match(/\+7[\d\s\-()]{10,}/);
    const webMatch = slice.match(/https?:\/\/(?!www\.google\.com)[a-zA-Z0-9][-a-zA-Z0-9.]+\.[a-z]{2,}(?:\/[^\s"'<>]*)?/);
    out.push({
      name,
      address,
      phone: phoneMatch ? phoneMatch[0].replace(/\s+/g, " ").trim() : "",
      website: webMatch ? webMatch[0].split(/["'<>]/)[0] : "",
      placeId: pid,
      segment,
      city: cityTitle(city),
    });
  }

  if (out.length < 3) {
    const ch = [...html.matchAll(/(ChIJ[a-zA-Z0-9_-]{10,})/g)].map((x) => x[1]);
    for (const pid of ch) {
      if (out.length >= limit) break;
      if (seen.has(pid)) continue;
      seen.add(pid);
      out.push({
        name: `Объект (${segment})`,
        address: cityTitle(city),
        phone: "",
        website: "",
        placeId: pid,
        segment,
        city: cityTitle(city),
      });
    }
  }

  return out.slice(0, limit);
}

async function searchLeads(city, segment, limit = 18) {
  const cap = Math.min(20, Math.max(10, limit));
  aiOfficeLog("Using Maps Scraper mode");
  const q = buildQuery(city, segment);
  const url = `https://www.google.com/maps/search/${encodeURIComponent(q)}`;
  const r = await fetchWithRetry(url);
  if (!r.ok || !r.html) {
    aiOfficeLog(`Maps scraper failed: ${r.error || "empty"}`);
    return { ok: true, leads: [], rawError: r.error || "empty" };
  }
  const parsed = parseFromHtml(r.html, city, segment, cap);
  aiOfficeLog(`Found ${parsed.length} leads`);
  return { ok: true, leads: parsed, query: q };
}

module.exports = {
  searchLeads,
  buildQuery,
  SEGMENT_KEYWORD,
};
