import type { Car } from "../../schema/src/cars";
import type { GarageState } from "./types";

/**
 * Versioned serialization for the in-memory garage state. After the schema
 * cutover the app persists cars through the storage repos (parse-on-read +
 * quarantine), so this serializer is the legacy/in-memory path only — kept for
 * any code still round-tripping a GarageState blob. Format bumps must NEVER
 * read as corruption (never-wipe): unreadable blobs are stashed, not lost.
 *
 * Format 3 = schema-Car garage (chassis_id / power_type). Formats 1–2 were the
 * pre-schema CarEntity shape; they are now read by the storage migrate path
 * (packages/storage/migrate), not here, so this validator only accepts v3.
 */

export const GARAGE_FORMAT_VERSION = 3;

interface Envelope {
  format: number;
  state: GarageState;
}

export type DeserializeGarageResult =
  | { ok: true; state: GarageState }
  | { ok: false; reason: "corrupt" | "unknown_format" };

export function serializeGarage(state: GarageState): string {
  return JSON.stringify({ format: GARAGE_FORMAT_VERSION, state } satisfies Envelope);
}

export function deserializeGarage(raw: string): DeserializeGarageResult {
  let env: Envelope;
  try {
    env = JSON.parse(raw) as Envelope;
  } catch {
    return { ok: false, reason: "corrupt" };
  }
  if (typeof env !== "object" || env === null || typeof env.format !== "number") {
    return { ok: false, reason: "corrupt" };
  }

  let state: GarageState;
  switch (env.format) {
    case 3:
      state = env.state;
      break;
    default:
      return { ok: false, reason: "unknown_format" };
  }

  if (!isValidState(state)) return { ok: false, reason: "corrupt" };
  return { ok: true, state };
}

function isValidState(s: GarageState): boolean {
  return typeof s === "object" && s !== null && Array.isArray(s.cars) && s.cars.every(isValidCar);
}

function isValidCar(c: Car): boolean {
  return (
    typeof c === "object" &&
    c !== null &&
    typeof c.id === "string" &&
    typeof c.name === "string" &&
    typeof c.chassis_id === "string" &&
    (c.power_type === "nitro" || c.power_type === "brushless") &&
    typeof c.created_at === "string"
  );
}
