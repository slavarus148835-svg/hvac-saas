import { Timestamp } from "firebase-admin/firestore";

/** ISO UTC или null; без логирования значений. */
export function firestoreFieldToIsoUtc(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Timestamp) {
    const ms = value.toMillis();
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "toMillis" in value &&
    typeof (value as Timestamp).toMillis === "function"
  ) {
    try {
      const ms = (value as Timestamp).toMillis();
      return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
    } catch {
      return null;
    }
  }
  if (typeof value === "string" && value.trim()) {
    const t = Date.parse(value);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }
  return null;
}
