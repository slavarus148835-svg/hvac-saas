import { MAX_STROBA_METERS } from "./constants";
import { sanitizeDecimalMetersString } from "./parse";

/** Метраж штроб по материалам (основная + дренаж/кабель). */
export type StrobaMetersFields = {
  strobaConcreteMeters: string;
  strobaBrickMeters: string;
  strobaDrainConcreteMeters: string;
  strobaDrainBrickMeters: string;
};

export const EMPTY_STROBA_METERS: StrobaMetersFields = {
  strobaConcreteMeters: "0",
  strobaBrickMeters: "0",
  strobaDrainConcreteMeters: "0",
  strobaDrainBrickMeters: "0",
};

function sanitizeStrobaMetersString(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "0";
  return sanitizeDecimalMetersString(s, MAX_STROBA_METERS) || "0";
}

function legacyMaterial(raw: unknown): "none" | "brick" | "concrete" {
  return raw === "brick" || raw === "concrete" ? raw : "none";
}

/**
 * Канонические 4 поля метража. Новый формат — как есть;
 * старый (strobaType + strobaMeters / strobaDrain*) — в соответствующее поле материала.
 */
export function normalizeStrobaMetersFromRaw(
  raw: Record<string, unknown>
): StrobaMetersFields {
  const hasNew =
    raw.strobaConcreteMeters !== undefined ||
    raw.strobaBrickMeters !== undefined ||
    raw.strobaDrainConcreteMeters !== undefined ||
    raw.strobaDrainBrickMeters !== undefined;

  if (hasNew) {
    return {
      strobaConcreteMeters: sanitizeStrobaMetersString(raw.strobaConcreteMeters),
      strobaBrickMeters: sanitizeStrobaMetersString(raw.strobaBrickMeters),
      strobaDrainConcreteMeters: sanitizeStrobaMetersString(raw.strobaDrainConcreteMeters),
      strobaDrainBrickMeters: sanitizeStrobaMetersString(raw.strobaDrainBrickMeters),
    };
  }

  const out = { ...EMPTY_STROBA_METERS };
  const mainType = legacyMaterial(raw.strobaType ?? raw.strobaMaterial);
  const mainM = sanitizeStrobaMetersString(raw.strobaMeters);
  if (mainType === "concrete") out.strobaConcreteMeters = mainM;
  else if (mainType === "brick") out.strobaBrickMeters = mainM;

  const drainType = legacyMaterial(raw.strobaDrainType ?? raw.drainStrobaType);
  const drainM = sanitizeStrobaMetersString(
    raw.strobaDrainMeters ?? raw.drainStrobaMeters
  );
  if (drainType === "concrete") out.strobaDrainConcreteMeters = drainM;
  else if (drainType === "brick") out.strobaDrainBrickMeters = drainM;

  return out;
}
