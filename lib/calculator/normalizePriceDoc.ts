export function normalizePriceDocForSplitCapacity(data: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...data };
  if (out.standard_7 == null && out.standard_7_9 != null) out.standard_7 = out.standard_7_9;
  if (out.standard_9 == null && out.standard_7_9 != null) out.standard_9 = out.standard_7_9;
  if (out.existing_7 == null && out.existing_7_9 != null) out.existing_7 = out.existing_7_9;
  if (out.existing_9 == null && out.existing_7_9 != null) out.existing_9 = out.existing_7_9;
  if (out.route_7 == null && out.route_7_9 != null) out.route_7 = out.route_7_9;
  if (out.route_9 == null && out.route_7_9 != null) out.route_9 = out.route_7_9;
  return out;
}
