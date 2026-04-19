const storage = require("../services/storage");

const STATUSES = new Set([
  "new",
  "qualified",
  "contacted",
  "waiting",
  "interested",
  "closed_won",
  "closed_lost",
]);

async function setStatus(leadId, status) {
  if (!STATUSES.has(status)) {
    return { ok: false, error: "invalid_status" };
  }
  const lead = await storage.getLeadById(leadId);
  if (!lead) return { ok: false, error: "not_found" };
  const updated = await storage.upsertLead({
    ...lead,
    status,
    updatedAt: new Date().toISOString(),
  });
  return { ok: true, lead: updated };
}

async function markQualified(lead) {
  return storage.upsertLead({
    ...lead,
    status: "qualified",
    updatedAt: new Date().toISOString(),
  });
}

module.exports = {
  setStatus,
  markQualified,
  STATUSES,
};
