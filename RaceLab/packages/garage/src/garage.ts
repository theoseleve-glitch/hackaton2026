import type { Car } from "../../schema/src/cars";
import type { GarageState } from "./types";

/**
 * In-memory garage state ops over the schema `Car`. Ids are minted upstream by
 * schema `makeCar` (the form/repo seam) — these helpers append/patch/remove an
 * already-formed Car and keep the React-reducer "return a new state" contract.
 * The app's `useGarage` backs this state with the cars repo; these pure ops
 * remain the ergonomic update surface for `updateGarage(fn)`.
 */

export function initGarage(): GarageState {
  return { cars: [] };
}

/** Append an already-minted Car (id from schema makeCar). */
export function addCar(state: GarageState, car: Car): { state: GarageState; car: Car } {
  return { state: { cars: [...state.cars, car] }, car };
}

/** Patch a car in place (id/created_at immutable).
 *  Unknown ids are refused (state returned unchanged). */
export function updateCar(
  state: GarageState,
  id: string,
  patch: Partial<Omit<Car, "id" | "created_at">>,
): GarageState {
  if (!state.cars.some((c) => c.id === id)) return state;
  return {
    cars: state.cars.map((c) =>
      c.id === id ? { ...c, ...patch, id: c.id, created_at: c.created_at } : c,
    ),
  };
}

export function deleteCar(state: GarageState, id: string): GarageState {
  const cars = state.cars.filter((c) => c.id !== id);
  return cars.length === state.cars.length ? state : { cars };
}

export function getCar(state: GarageState, id: string): Car | undefined {
  return state.cars.find((c) => c.id === id);
}
