import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { deserialize, initSheets, serialize } from "../../../packages/sheets/src";
import type { SheetsState } from "../../../packages/sheets/src";
import { KB } from "./kb";
import { sheetsKeyForCar } from "./garagestore";

/**
 * Per-car sheets state (D26): one SheetsState per CarEntity, keyed by car id.
 * The draft persists too, so a mid-edit app kill at the track loses nothing.
 * Corrupt/old data is stashed (never wiped) and falls back to a fresh kit
 * state for the car's chassis template.
 */
export function useCarSheets(
  carId: string | null,
  templateId: string | null,
): {
  state: SheetsState | null;
  update: (fn: (prev: SheetsState) => SheetsState) => void;
} {
  const [state, setState] = useState<SheetsState | null>(null);

  useEffect(() => {
    if (!carId || !templateId) {
      setState(null);
      return;
    }
    const template = KB.templates[templateId] ?? KB.templates["generic-offroad"];
    const key = sheetsKeyForCar(carId);
    let cancelled = false;
    setState(null);
    AsyncStorage.getItem(key)
      .then(async (raw) => {
        if (cancelled) return;
        if (raw) {
          const result = deserialize(raw, template.template_id);
          if (result.ok) {
            setState(result.state);
            return;
          }
          await AsyncStorage.setItem(`${key}:backup:${result.reason}`, raw).catch(() => {});
        }
        setState(initSheets(template, new Date().toISOString()));
      })
      .catch(() => {
        if (!cancelled) setState(initSheets(template, new Date().toISOString()));
      });
    return () => {
      cancelled = true;
    };
  }, [carId, templateId]);

  useEffect(() => {
    if (state && carId) {
      AsyncStorage.setItem(sheetsKeyForCar(carId), serialize(state)).catch(() => {
        // storage full/unavailable: keep running in-memory rather than crash
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const update = useCallback((fn: (prev: SheetsState) => SheetsState) => {
    setState((prev) => (prev ? fn(prev) : prev));
  }, []);

  return { state, update };
}

/** One-shot read of another car's saved setups (for run logging / resolving
 *  a run's setup version without mounting that car's editor). */
export async function loadCarSheets(carId: string): Promise<SheetsState | null> {
  try {
    const raw = await AsyncStorage.getItem(sheetsKeyForCar(carId));
    if (!raw) return null;
    const env = JSON.parse(raw) as { state?: SheetsState };
    return env.state ?? null;
  } catch {
    return null;
  }
}
