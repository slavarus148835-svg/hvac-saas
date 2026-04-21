const config = require("../config");

function clean(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(url, timeoutMs = Number(config.requestTimeoutMs) || 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "accept-language": "ru-RU,ru;q=0.9,en;q=0.8",
      },
    });
    const text = await res.text();
    clearTimeout(t);
    if (!res.ok) return { ok: false, error: `http_${res.status}`, text: "" };
    return { ok: true, text };
  } catch (e) {
    clearTimeout(t);
    return { ok: false, error: e.name === "AbortError" ? "timeout" : String(e.message || e), text: "" };
  }
}

function parsePhone(text) {
  const m = String(text || "").match(/(?:\+7|8)\s*\(?\d{3}\)?[\s-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/);
  return m ? m[0].replace(/\s+/g, " ").trim() : "";
}

function parseAddress(text) {
  const raw = String(text || "");
  const m = raw.match(/(?:Адрес|address)\s*[:\-]?\s*([^<\n\r]{8,180})/i);
  if (m) return clean(m[1]);
  return "";
}

function parseWebsite(text) {
  const m = String(text || "").match(/https?:\/\/(?!2gis\.ru)[a-zа-я0-9][-a-zа-я0-9.]+\.[a-zа-я]{2,}(?:\/[^\s"'<>]*)?/i);
  return m ? m[0] : "";
}

async function enrichLead(lead, city) {
  const name = String(lead.name || "").trim();
  if (!name) return {};
  const q = `${name} ${city}`;
  const url = `https://2gis.ru/search/${encodeURIComponent(q)}`;
  const r = await fetchText(url);
  if (!r.ok || !r.text) return {};
  const html = r.text;
  const phone = parsePhone(html);
  const address = parseAddress(html);
  const website = parseWebsite(html);
  const titleM = html.match(/<title>([\s\S]*?)<\/title>/i);
  const title = titleM ? clean(titleM[1]).replace(/\s*[-|].*2GIS.*$/i, "") : "";
  return {
    name: title || "",
    phone,
    address,
    website,
    source: "dgis",
  };
}

async function enrichLeads(leads, city) {
  console.log("[AI OFFICE] Using 2GIS enrichment");
  const out = [];
  for (const l of leads) {
    if (l.phone && l.address && l.website) {
      out.push(l);
      continue;
    }
    const e = await enrichLead(l, city);
    out.push({
      ...l,
      name: e.name || l.name,
      phone: e.phone || l.phone,
      address: e.address || l.address,
      website: e.website || l.website,
      source: e.source || l.source,
    });
  }
  return out;
}

module.exports = {
  enrichLead,
  enrichLeads,
};
