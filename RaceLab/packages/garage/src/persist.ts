import type { CarEntity, GarageState } from "./types";

/** Versioned serialization for AsyncStorage — same discipline as
 *  packages/sheets/persist.ts: a format bump must NEVER read as corruption,
 *  so callers can stash unreadable blobs instead of wiping a user's garage. */

export const GARAGE_FORMAT_VERSION = 1;

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
    case 1:
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
