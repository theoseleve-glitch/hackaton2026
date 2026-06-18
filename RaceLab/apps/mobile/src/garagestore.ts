import { useCallback, useEffect, useState } from "react";
import { initGarage } from "../../../packages/garage/src";
import type { Car, GarageState } from "../../../packages/garage/src";
import { useRepos } from "./storage/RepoProvider";

/**
 * Multi-car garage (D26), now backed by William's storage repos (Phase 2B). The
 * hook seeds its in-memory GarageState from `repos.cars.getAll()` and, on every
 * `updateGarage(fn)`, diffs the returned cars against the previous snapshot and
 * issues `repos.cars.put` / `repos.cars.remove` for exactly what changed. The
 * element shape is the schema `Car`; the return signature is unchanged.
 *
 * Never-wipe: reads route through the repo's parse-on-read + quarantine; corrupt
 * cars are stashed, never silently dropped, and a write failure leaves the
 * in-memory state authoritative (the next mutation retries).
 */

/** Stable id kept for runs whose car_id is undefined (theo's "undefined =
 *  legacy car" convention — decision #4). */
export const LEGACY_CAR_ID = "car-legacy-mp11";

export function useGarage(): {
  garage: GarageState | null;
  updateGarage: (fn: (prev: GarageState) => GarageState) => void;
} {
  const repos = useRepos();
  const [garage, setGarage] = useState<GarageState | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await repos.cars.getAll();
      if (cancelled) return;
      setGarage({ cars: res.ok ? [...res.values].sort(byCreated) : [] });
    })();
    return () => {
      cancelled = true;
    };
  }, [repos]);

  const updateGarage = useCallback(
    (fn: (prev: GarageState) => GarageState) => {
      setGarage((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        void persistDiff(repos, prev.cars, next.cars);
        return next;
      });
    },
    [repos],
  );

  return { garage, updateGarage };
}

function byCreated(a: Car, b: Car): number {
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}

/** Diff prev vs next car lists and persist exactly what changed. */
async function persistDiff(
  repos: ReturnType<typeof useRepos>,
  prev: readonly Car[],
  next: readonly Car[],
): Promise<void> {
  const now = new Date().toISOString();
  const prevById = new Map(prev.map((c) => [c.id, c]));
  const nextById = new Map(next.map((c) => [c.id, c]));
  for (const car of next) {
    const before = prevById.get(car.id);
    if (before === undefined || JSON.stringify(before) !== JSON.stringify(car)) {
      await repos.cars.put(car, now);
    }
  }
  for (const car of prev) {
    if (!nextById.has(car.id)) await repos.cars.remove(car.id, now);
  }
}

export function sheetsKeyForCar(carId: string): string {
  return `racelab:sheets:car:${carId}`;
}

/** Convenience for creation flows: add an already-minted schema Car and return
 *  it in one call (the car is minted by `makeCar` at the form layer). */
export function createCar(
  updateGarage: (fn: (prev: GarageState) => GarageState) => void,
  car: Car,
): Promise<Car> {
  return new Promise((resolve) => {
    updateGarage((prev) => {
      resolve(car);
      return { cars: [...prev.cars, car] };
    });
  });
}

export { initGarage };
