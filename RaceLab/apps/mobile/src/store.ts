import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { deserialize, initSheets, serialize } from "../../../packages/sheets/src";
import type { SheetsState } from "../../../packages/sheets/src";
import { MP11, MP11_ID } from "./kb";

const STORAGE_KEY = `racelab:sheets:${MP11_ID}`;

/**
 * Sheets state with AsyncStorage persistence. The draft persists too, so a
 * mid-edit app kill at the track loses nothing (D11 spirit: local first).
 * Corrupt/old data falls back to a fresh kit state instead of crashing.
 */
export function useSheets(): {
  state: SheetsState | null;
  update: (fn: (prev: SheetsState) => SheetsState) => void;
} {
  const [state, setState] = useState<SheetsState | null>(null);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then(async (raw) => {
        if (cancelled) return;
        if (raw) {
          const result = deserialize(raw, MP11_ID);
          if (result.ok) {
            setState(result.state);
            return;
          }
          // Never silently wipe history (review ⛔1): stash the unreadable
          // blob (e.g. written by a NEWER app version) before starting fresh.
          await AsyncStorage.setItem(`${STORAGE_KEY}:backup:${result.reason}`, raw).catch(() => {});
        }
        setState(initSheets(MP11, new Date().toISOString()));
      })
      .catch(() => {
        if (!cancelled) setState(initSheets(MP11, new Date().toISOString()));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state) {
      AsyncStorage.setItem(STORAGE_KEY, serialize(state)).catch(() => {
        // storage full/unavailable: keep running in-memory rather than crash
      });
    }
  }, [state]);

  const update = useCallback((fn: (prev: SheetsState) => SheetsState) => {
    setState((prev) => (prev ? fn(prev) : prev));
  }, []);

  return { state, update };
}
