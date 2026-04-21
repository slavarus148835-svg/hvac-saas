const config = require("../config");

const SEGMENT_QUERY = {
  business_center: "бизнес центр",
  uk: "управляющая компания",
  clinic: "клиника",
  hotel: "отель",
  restaurant: "ресторан",
  store: "магазин",
  fitness: "фитнес клуб",
  office: "офисный центр",
  warehouse: "складской комплекс",
};

const BAD_HOSTS = [
  "yandex.ru",
  "2gis.ru",
  "vk.com",
  "ok.ru",
  "youtube.com",
  "instagram.com",
  "facebook.com",
  "wikipedia.org",
  "avito.ru",
];

function clean(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function cityTitle(city) {
  const s = String(city || "").replace(/_/g, " ").trim();
  if (!s) return "";
  return s.slice(0, 1).toUpperCase() + s.slice(1);
}

function buildQuery(city, segment) {
  const key = SEGMENT_QUERY[segment] || String(segment || "").replace(/_/g, " ");
  return `${key} ${cityTitle(city)} телефон сайт`.trim();
}

function normalizeUrl(raw) {
  let u = String(raw || "").trim();
  if (!u) return "";
  if (u.startsWith("/")) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return "";
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isBadDomain(url) {
  const host = hostOf(url);
  if (!host) return true;
  return BAD_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url, retries = 2, timeoutMs = Number(config.requestTimeoutMs) || 15000) {
  const headers = {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "accept-language": "ru-RU,ru;q=0.9,en;q=0.8",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };
  let lastError = "unknown";
  for (let i = 0; i <= retries; i += 1) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers, signal: ctrl.signal });
      const text = await res.text();
      clearTimeout(t);
      if (!res.ok) {
        lastError = `http_${res.status}`;
      } else {
        return { ok: true, text };
      }
    } catch (e) {
      clearTimeout(t);
      lastError = e.name === "AbortError" ? "timeout" : String(e.message || e);
    }
    if (i < retries) await sleep(400 * (i + 1));
  }
  return { ok: false, error: lastError, text: "" };
}

function parseSearchResults(html, limit = 20) {
  const out = [];
  const seen = new Set();
  const blocks = String(html || "").match(/<li[^>]*serp-item[\s\S]*?<\/li>/gim) || [];
  for (const b of blocks) {
    if (out.length >= limit) break;
    const a = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(b);
    if (!a) continue;
    const url = normalizeUrl(a[1]);
    if (!url || isBadDomain(url) || seen.has(url)) continue;
    seen.add(url);
    const title = clean(a[2]);
    if (!title) continue;
    let snippet = "";
    const sn = /<div[^>]+(?:OrganicTextContentSpan|organic__text|TextContainer)[^>]*>([\s\S]*?)<\/div>/i.exec(b);
    if (sn) snippet = clean(sn[1]);
    if (!snippet) snippet = clean(b).slice(0, 240);
    out.push({ title, url, snippet });
  }

  if (!out.length) {
    const re = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gim;
    let m;
    while ((m = re.exec(html)) && out.length < limit) {
      const url = normalizeUrl(m[1]);
      if (!url || isBadDomain(url) || seen.has(url)) continue;
      seen.add(url);
      const title = clean(m[2]);
      if (!title || title.length < 2) continue;
      out.push({ title, url, snippet: "" });
    }
  }

  return out;
}

function extractPhone(text) {
  const m = String(text || "").match(/(?:\+7|8)\s*\(?\d{3}\)?[\s-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/);
  return m ? m[0].replace(/\s+/g, " ").trim() : "";
}

function extractEmail(text) {
  const m = String(text || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0] : "";
}

function extractAddress(text) {
  const raw = String(text || "");
  const m =
    raw.match(/(?:адрес|address)\s*[:\-]?\s*([^<\n\r]{10,180})/i) ||
    raw.match(/(?:ул\.|улица|проспект|пр-т|дом|д\.)[^<\n\r]{8,180}/i);
  return m ? clean(m[1] || m[0]) : "";
}

async function enrichCandidate(candidate) {
  const page = await fetchText(candidate.url, 1, 10000);
  const body = page.ok ? page.text : "";
  const all = `${candidate.title} ${candidate.snippet} ${body}`;
  const phone = extractPhone(all);
  const email = extractEmail(all);
  const address = extractAddress(all) || clean(candidate.snippet);
  return {
    name: clean(candidate.title),
    website: candidate.url,
    phone,
    address,
    email,
    contactFromWebsite: Boolean(page.ok && phone),
  };
}

function dedupe(items) {
  const out = [];
  const seen = new Set();
  for (const i of items) {
    if (!i.name) continue;
    const phoneKey = i.phone ? i.phone.replace(/\D/g, "") : "";
    const siteKey = i.website ? hostOf(i.website) : "";
    const nameKey = i.name.toLowerCase();
    const key = `${phoneKey}|${siteKey}|${nameKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(i);
  }
  return out;
}

async function searchLeads(city, segment, options = {}) {
  const limitIn = Number(options.limit || 15);
  const limit = Math.max(10, Math.min(20, limitIn));
  const query = buildQuery(city, segment);
  console.log("[AI OFFICE] Using Yandex mode");

  const url = `https://yandex.ru/search/?text=${encodeURIComponent(query)}&lr=35`;
  const search = await fetchText(url, 2);
  if (!search.ok) return { ok: false, error: search.error || "search_failed", leads: [], query };

  const candidates = parseSearchResults(search.text, 25);
  const leads = [];
  for (const c of candidates) {
    if (leads.length >= limit) break;
    const row = await enrichCandidate(c);
    if (!row.name) continue;
    leads.push(row);
    await sleep(60);
  }

  const unique = dedupe(leads)
    .filter((x) => x.name && (x.phone || x.website))
    .sort((a, b) => Number(Boolean(b.phone)) - Number(Boolean(a.phone)))
    .slice(0, limit);

  return { ok: true, leads: unique, query };
}

module.exports = {
  searchLeads,
  buildQuery,
};
