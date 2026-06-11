import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import {
  addCar,
  deserializeGarage,
  initGarage,
  serializeGarage,
} from "../../../packages/garage/src";
import type { CarEntity, GarageState } from "../../../packages/garage/src";

const STORAGE_KEY = "racelab:garage";
const LEGACY_SHEETS_KEY = "racelab:sheets:kyosho-inferno-mp11";
const LEGACY_PROFILE_KEY = "racelab:car-profile";
export const LEGACY_CAR_ID = "car-legacy-mp11";

/**
 * Multi-car garage (D26). One-time migration: users from the single-car MVP
 * (MP11 sheets + name/photo profile under the old keys) get a real CarEntity
 * with the fixed id `car-legacy-mp11`, and their sheets blob is copied to the
 * per-car key — nothing is deleted, the old keys stay as backup.
 */
export function useGarage(): {
  garage: GarageState | null;
  updateGarage: (fn: (prev: GarageState) => GarageState) => void;
} {
  const [garage, setGarage] = useState<GarageState | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const result = deserializeGarage(raw);
          if (result.ok) {
            if (!cancelled) setGarage(result.state);
            return;
          }
          await AsyncStorage.setItem(`${STORAGE_KEY}:backup:${result.reason}`, raw).catch(() => {});
        }

        // fresh garage — migrate the single-car MVP if its data exists
        let state = initGarage();
        const legacySheets = await AsyncStorage.getItem(LEGACY_SHEETS_KEY);
        if (legacySheets) {
          let name = "Inferno MP11";
          let photo_uri: string | undefined;
          try {
            const prof = JSON.parse((await AsyncStorage.getItem(LEGACY_PROFILE_KEY)) ?? "{}") as {
              name?: string;
              photo_uri?: string;
            };
            if (prof.name) name = prof.name;
            photo_uri = prof.photo_uri;
          } catch {}
          const legacy: CarEntity = {
            id: LEGACY_CAR_ID,
            name,
            template_id: "kyosho-inferno-mp11",
            brand: "Kyosho",
            model: "Inferno MP11",
            category: "buggy",
            scale: "1/8",
            drivetrain: "4wd",
            power: "nitro",
            photo_uri,
            created_at: new Date().toISOString(),
          };
          state = { cars: [legacy] };
          await AsyncStorage.setItem(sheetsKeyForCar(LEGACY_CAR_ID), legacySheets).catch(() => {});
        }
        if (!cancelled) setGarage(state);
      } catch {
        if (!cancelled) setGarage(initGarage());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (garage) {
      AsyncStorage.setItem(STORAGE_KEY, serializeGarage(garage)).catch(() => {});
    }
  }, [garage]);

  const updateGarage = useCallback((fn: (prev: GarageState) => GarageState) => {
    setGarage((prev) => (prev ? fn(prev) : prev));
  }, []);

  return { garage, updateGarage };
}

export function sheetsKeyForCar(carId: string): string {
  return `racelab:sheets:car:${carId}`;
}

/** Convenience for creation flows: add and return the new car in one call. */
export function createCar(
  updateGarage: (fn: (prev: GarageState) => GarageState) => void,
  car: Omit<CarEntity, "id">,
): Promise<CarEntity> {
  return new Promise((resolve) => {
    updateGarage((prev) => {
      const { state, car: created } = addCar(prev, car, new Date().toISOString());
      resolve(created);
      return state;
    });
  });
}
