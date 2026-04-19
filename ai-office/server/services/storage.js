const fs = require("fs/promises");
const path = require("path");
const config = require("../config");
const logger = require("./logger");

const DEFAULT_FILES = {
  "leads.json": [],
  "logs.json": [],
  "campaigns.json": [],
};

const DEFAULT_OBJECTS = {
  "uxState.json": {},
};

async function ensureDataFiles() {
  await fs.mkdir(config.dataDir, { recursive: true });
  for (const [rel, def] of Object.entries(DEFAULT_FILES)) {
    const fp = path.join(config.dataDir, rel);
    try {
      await fs.access(fp);
    } catch {
      await fs.writeFile(fp, JSON.stringify(def, null, 2), "utf8");
      logger.info(`data: создан файл ${rel}`);
      continue;
    }
    let raw;
    try {
      raw = await fs.readFile(fp, "utf8");
    } catch (e) {
      logger.warn(`data: не прочитан ${rel}, пересоздаю`, String(e.message || e));
      await fs.writeFile(fp, JSON.stringify(def, null, 2), "utf8");
      continue;
    }
    try {
      const parsed = JSON.parse(raw);
      if (DEFAULT_FILES[rel] !== undefined && !Array.isArray(parsed)) {
        throw new Error("not_array");
      }
    } catch {
      logger.warn(`data: битый JSON ${rel}, восстановлен шаблон`);
      await fs.writeFile(fp, JSON.stringify(def, null, 2), "utf8");
    }
  }
  for (const [rel, def] of Object.entries(DEFAULT_OBJECTS)) {
    const fp = path.join(config.dataDir, rel);
    try {
      const raw = await fs.readFile(fp, "utf8");
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("bad");
    } catch {
      await fs.writeFile(fp, JSON.stringify(def, null, 2), "utf8");
      logger.info(`data: создан/починен ${rel}`);
    }
  }
}

async function readJson(relPath) {
  const filePath = path.join(config.dataDir, relPath);
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (e) {
    if (
      e.code === "ENOENT" &&
      (DEFAULT_FILES[relPath] !== undefined || DEFAULT_OBJECTS[relPath] !== undefined)
    ) {
      const def =
        DEFAULT_FILES[relPath] !== undefined ? DEFAULT_FILES[relPath] : DEFAULT_OBJECTS[relPath];
      await writeJson(relPath, def);
      return JSON.parse(JSON.stringify(def));
    }
    logger.warn(`readJson: ${relPath}`, String(e.message || e));
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    logger.warn(`readJson: невалидный JSON ${relPath}, сброс`);
    if (DEFAULT_FILES[relPath] !== undefined) {
      await writeJson(relPath, DEFAULT_FILES[relPath]);
      return JSON.parse(JSON.stringify(DEFAULT_FILES[relPath]));
    }
    if (DEFAULT_OBJECTS[relPath] !== undefined) {
      await writeJson(relPath, DEFAULT_OBJECTS[relPath]);
      return JSON.parse(JSON.stringify(DEFAULT_OBJECTS[relPath]));
    }
    return null;
  }
}

async function writeJson(relPath, data) {
  await fs.mkdir(config.dataDir, { recursive: true });
  const filePath = path.join(config.dataDir, relPath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

async function appendJson(relPath, entry) {
  let arr = await readJson(relPath);
  if (!Array.isArray(arr)) {
    arr = [];
  }
  const stamp = new Date().toISOString();
  arr.push({ ...entry, at: entry.at || stamp });
  await writeJson(relPath, arr);
}

function priorityFromScore(score) {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "D";
}

async function upsertLead(lead) {
  const leads = (await readJson("leads.json")) || [];
  if (!Array.isArray(leads)) {
    await writeJson("leads.json", []);
    return upsertLead(lead);
  }
  const now = new Date().toISOString();
  const idx = leads.findIndex(
    (l) => l.id === lead.id || (lead.placeId && l.placeId === lead.placeId)
  );
  const merged = {
    ...lead,
    updatedAt: now,
    createdAt: lead.createdAt || now,
    priority: lead.priority || priorityFromScore(Number(lead.score) || 0),
  };
  let saved;
  if (idx >= 0) {
    const existing = leads[idx];
    saved = { ...existing, ...merged, id: existing.id, placeId: existing.placeId || merged.placeId };
    leads[idx] = saved;
  } else {
    saved = merged;
    leads.push(saved);
  }
  await writeJson("leads.json", leads);
  return saved;
}

async function getLeadById(id) {
  const leads = (await readJson("leads.json")) || [];
  return leads.find((l) => l.id === id) || null;
}

async function getLeadByPlaceId(placeId) {
  if (!placeId) return null;
  const leads = (await readJson("leads.json")) || [];
  return leads.find((l) => l.placeId === placeId) || null;
}

async function getTopLeads(limit = 5) {
  const leads = (await readJson("leads.json")) || [];
  if (!Array.isArray(leads)) return [];
  return [...leads]
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
    .slice(0, limit);
}

async function getLeadsByStatus(status) {
  const leads = (await readJson("leads.json")) || [];
  if (!Array.isArray(leads)) return [];
  return leads.filter((l) => l.status === status);
}

async function readUxState() {
  const data = (await readJson("uxState.json")) || {};
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  return data;
}

async function saveLastShortlist(chatId, orderedLeadIds) {
  const all = await readUxState();
  all[String(chatId)] = {
    order: orderedLeadIds.filter(Boolean),
    updatedAt: new Date().toISOString(),
  };
  await writeJson("uxState.json", all);
}

async function resolveLeadRef(chatId, ref) {
  const r = String(ref || "").trim();
  if (!r) return null;
  if (r.startsWith("lead_")) return r;
  const n = parseInt(r, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  const all = await readUxState();
  const row = all[String(chatId)];
  if (!row || !Array.isArray(row.order)) return null;
  return row.order[n - 1] || null;
}

module.exports = {
  ensureDataFiles,
  readJson,
  writeJson,
  appendJson,
  upsertLead,
  getLeadById,
  getLeadByPlaceId,
  getTopLeads,
  getLeadsByStatus,
  priorityFromScore,
  saveLastShortlist,
  resolveLeadRef,
};
