import type { CarEntity, GarageState } from "./types";

/** Versioned serialization for AsyncStorage — same discipline as
 *  packages/sheets/persist.ts: a format bump must NEVER read as corruption,
 *  so callers can stash unreadable blobs instead of wiping a user's garage. */

export const GARAGE_FORMAT_VERSION = 2;

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

  // Migration switch — every future format bump adds an upgrade case here.
  let state: GarageState;
  switch (env.format) {
    case 1: {
      // v1 → v2 moved the tank to the pilot's unit: fuel_tank_cc (cc)
      // becomes fuel_tank_cl (cL = cc / 10, 1 decimal); cc is dropped.
      const v1 = env.state;
      if (typeof v1 !== "object" || v1 === null || !Array.isArray(v1.cars)) {
        return { ok: false, reason: "corrupt" };
      }
      state = { cars: v1.cars.map(migrateCarV1) };
      break;
    }
    case 2:
      state = env.state;
      break;
    default:
      return { ok: false, reason: "unknown_format" };
  }

  if (!isValidState(state)) return { ok: false, reason: "corrupt" };
  return { ok: true, state };
}

/** v1 → v2: a car with fuel_tank_cc and no fuel_tank_cl gets
 *  fuel_tank_cl = cc / 10 (rounded to 1 decimal); fuel_tank_cc is removed
 *  from the migrated object. Malformed entries pass through untouched so
 *  the shape validation below reports them as corrupt. */
function migrateCarV1(c: CarEntity): CarEntity {
  if (typeof c !== "object" || c === null || typeof c.fuel_tank_cc !== "number") return c;
  const { fuel_tank_cc, ...rest } = c;
  const fuel_tank_cl =
    typeof c.fuel_tank_cl === "number" ? c.fuel_tank_cl : Math.round(fuel_tank_cc) / 10;
  return { ...rest, fuel_tank_cl };
}

function isValidState(s: GarageState): boolean {
  return typeof s === "object" && s !== null && Array.isArray(s.cars) && s.cars.every(isValidCar);
}

function isValidCar(c: CarEntity): boolean {
  return (
    typeof c === "object" &&
    c !== null &&
    typeof c.id === "string" &&
    typeof c.name === "string" &&
    typeof c.template_id === "string" &&
    typeof c.brand === "string" &&
    typeof c.model === "string" &&
    typeof c.category === "string" &&
    typeof c.scale === "string" &&
    (c.power === "nitro" || c.power === "electric") &&
    typeof c.created_at === "string"
  );
}
