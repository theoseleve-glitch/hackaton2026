import type { CarEntity, GarageState } from "./types";

/**
 * State operations — same contract as packages/sheets and packages/logbook:
 * every operation returns a new state, safe for React reducers. Cars are
 * editable (electronics swap, weight changes after options), but id and
 * created_at are immutable facts.
 */

export function initGarage(): GarageState {
  return { cars: [] };
}

/** Append a car. The caller provides everything except id. */
export function addCar(
  state: GarageState,
  car: Omit<CarEntity, "id">,
  now: string,
): { state: GarageState; car: CarEntity } {
  const entry: CarEntity = { ...car, id: nextId(now) };
  return { state: { cars: [...state.cars, entry] }, car: entry };
}

/** Patch a car in place (id/created_at immutable).
 *  Unknown ids are refused (state returned unchanged). */
export function updateCar(
  state: GarageState,
  id: string,
  patch: Partial<Omit<CarEntity, "id" | "created_at">>,
): GarageState {
  if (!state.cars.some((c) => c.id === id)) return state;
  return { cars: state.cars.map((c) => (c.id === id ? { ...c, ...patch, id: c.id, created_at: c.created_at } : c)) };
}

export function deleteCar(state: GarageState, id: string): GarageState {
  const cars = state.cars.filter((c) => c.id !== id);
  return cars.length === state.cars.length ? state : { cars };
}

export function getCar(state: GarageState, id: string): CarEntity | undefined {
  return state.cars.find((c) => c.id === id);
}

/** One-line typology subtitle, "1/8 nitro buggy · 4WD" style: scale, power
 *  and humanized category (underscores → spaces) joined by spaces, missing
 *  parts skipped; drivetrain appended uppercased after a " · " separator. */
export function carSubtitle(car: CarEntity): string {
  const main = [car.scale, car.power, car.category.replace(/_/g, " ")]
    .filter((p) => p.length > 0)
    .join(" ");
  const drive = car.drivetrain?.toUpperCase();
  return [main, drive].filter((p): p is string => !!p && p.length > 0).join(" · ");
}

function nextId(now: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `car-${Date.parse(now).toString(36)}-${rand}`;
}
