const crypto = require("crypto");
const places = require("../services/places");
const config = require("../config");
const logger = require("../services/logger");

const SEGMENT_QUERIES = {
  business_center: [
    "бизнес-центр {city}",
    "офисный центр класса А {city}",
    "БЦ аренда офисов {city}",
    "деловой центр {city}",
    "coworking бизнес центр {city}",
  ],
  hotel: [
    "отель {city}",
    "гостиница {city}",
    "hotel {city}",
    "апарт-отель {city}",
    "хостел сетевой {city}",
  ],
  clinic: [
    "медицинский центр {city}",
    "поликлиника {city}",
    "стоматология клиника {city}",
    "диагностический центр {city}",
    "косметология клиника {city}",
  ],
  restaurant: [
    "ресторан {city}",
    "кафе столовая {city}",
    "food hall {city}",
    "банкетный зал ресторан {city}",
    "grill bar {city}",
  ],
  store: [
    "супермаркет {city}",
    "торговый центр {city}",
    "магазин сеть {city}",
    "ритейл магазин {city}",
    "гипермаркет {city}",
  ],
  fitness: [
    "фитнес клуб {city}",
    "спортзал тренажерный зал {city}",
    "йога студия {city}",
    "crossfit зал {city}",
    "бассейн фитнес {city}",
  ],
  office: [
    "офис компании {city}",
    "представительство компании {city}",
    "head office {city}",
    "офис продаж {city}",
    "корпоративный офис {city}",
  ],
  warehouse: [
    "складской комплекс {city}",
    "логистический центр {city}",
    "распределительный центр {city}",
    "холодильный склад {city}",
    "индустриальный парк {city}",
  ],
  uk: [
    "управляющая компания {city}",
    "УК жилой комплекс {city}",
    "property management {city}",
    "facility management {city}",
    "эксплуатация зданий {city}",
  ],
};

const SEGMENTS = Object.keys(SEGMENT_QUERIES);

function isValidSegment(segment) {
  return Boolean(SEGMENT_QUERIES[String(segment || "").trim().toLowerCase()]);
}

function cityTitle(city) {
  const s = String(city || "").replace(/_/g, " ").trim();
  if (!s) return "";
  return s.slice(0, 1).toUpperCase() + s.slice(1);
}

function buildQueries(city, segment) {
  const tmpl = SEGMENT_QUERIES[segment];
  if (!tmpl) return [];
  const ct = cityTitle(city);
  return tmpl.map((q) => q.replace(/\{city\}/g, ct));
}

function makeLeadId() {
  return `lead_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;
}

function demoLeads(city, segment) {
  const ct = cityTitle(city);
  const label = {
    business_center: "БЦ «Прайм»",
    hotel: "Отель «Сити»",
    clinic: "Клиника «Здоровье»",
    restaurant: "Ресторан «Гриль»",
    store: "ТЦ «Лайн»",
    fitness: "Фитнес «Атлас»",
    office: "Офис «Дельта»",
    warehouse: "Склад «Логистик»",
    uk: "УК «ДомСервис»",
  };
  const base = [
    {
      name: `Демо: ${label[segment] || "Объект"} — головной (${ct})`,
      address: `${ct}, ул. Красная, 1 (тестовый адрес)`,
      phone: "+7 900 000-00-01",
      website: "https://example.com/demo-hvac-1",
    },
    {
      name: `Демо: ${label[segment] || "Объект"} — филиал (${ct})`,
      address: `${ct}, пр. Чекистов, 10 (тестовый адрес)`,
      phone: "+7 900 000-00-02",
      website: "",
    },
    {
      name: `Демо: ${label[segment] || "Объект"} — корп. блок (${ct})`,
      address: `${ct}, ул. Ставропольская, 25 (тестовый адрес)`,
      phone: "+7 900 000-00-03",
      website: "https://example.com/demo-hvac-3",
    },
  ];
  return base.map((b, i) => ({
    id: makeLeadId(),
    name: b.name,
    segment,
    city: ct,
    address: b.address,
    phone: b.phone,
    website: b.website,
    placeId: `demo_place_${segment}_${i}`,
    source: "demo_fallback",
    score: 0,
    priority: "C",
    status: "new",
    qualificationReason: "",
    offerSummary: "",
    firstMessage: "",
    followUpMessage: "",
    shortMessage: "",
    longMessage: "",
    proposalText: "",
    callScript: "",
    painPoints: [],
    reasonsToContact: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
}

async function enrichWithDetails(uniqueMap, maxDetails) {
  const ids = [...uniqueMap.keys()].slice(0, maxDetails);
  for (const pid of ids) {
    const det = await places.getPlaceDetails(pid);
    if (!det.ok || !det.fields) continue;
    const cur = uniqueMap.get(pid);
    uniqueMap.set(pid, {
      ...cur,
      phone: det.fields.phone || cur.phone,
      website: det.fields.website || cur.website,
      address: det.fields.address || cur.address,
    });
  }
}

async function findLeads(city, segment) {
  const seg = String(segment || "").trim().toLowerCase();
  if (!SEGMENT_QUERIES[seg]) {
    return { ok: false, error: "unknown_segment", leads: [] };
  }
  if (!config.googlePlacesApiKey) {
    logger.info("Leads: demo (нет GOOGLE_PLACES_API_KEY)");
    return { ok: true, leads: demoLeads(city, seg), demo: true };
  }

  const queries = buildQueries(city, seg);
  const uniqueMap = new Map();

  for (const q of queries) {
    let pageToken = null;
    let pages = 0;
    do {
      const res = await places.searchText(q, pageToken);
      pages += 1;
      if (!res.ok) {
        logger.warn("Places: сбой запроса", { q: q.slice(0, 70), err: res.error });
        break;
      }
      for (const item of res.results) {
        if (uniqueMap.has(item.placeId)) continue;
        uniqueMap.set(item.placeId, {
          id: makeLeadId(),
          name: item.name,
          segment: seg,
          city: cityTitle(city),
          address: item.address,
          phone: "",
          website: "",
          placeId: item.placeId,
          source: "google_places",
          score: 0,
          priority: "C",
          status: "new",
          qualificationReason: "",
          offerSummary: "",
          firstMessage: "",
          followUpMessage: "",
          shortMessage: "",
          longMessage: "",
          proposalText: "",
          callScript: "",
          painPoints: [],
          reasonsToContact: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        if (uniqueMap.size >= 40) break;
      }
      pageToken = res.nextPageToken || null;
      if (pageToken) await new Promise((r) => setTimeout(r, 2000));
    } while (pageToken && pages < 2 && uniqueMap.size < 40);
    if (uniqueMap.size >= 40) break;
  }

  await enrichWithDetails(uniqueMap, config.maxDetailFetches);

  const out = [...uniqueMap.values()];
  if (!out.length) logger.warn("Places: после запросов лидов 0");
  else logger.info("Places: найдено лидов", out.length);

  return { ok: true, leads: out, demo: false };
}

module.exports = {
  findLeads,
  buildQueries,
  SEGMENT_QUERIES,
  SEGMENTS,
  isValidSegment,
};
