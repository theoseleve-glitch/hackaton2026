import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import {
  deserializeLogbook,
  initLogbook,
  serializeLogbook,
} from "../../../packages/logbook/src";
import type { LogbookState } from "../../../packages/logbook/src";

const STORAGE_KEY = "racelab:logbook";

/**
 * Logbook state with AsyncStorage persistence — same contract and same
 * never-wipe-history discipline as src/store.ts (sheets): unreadable blobs
 * are stashed under a :backup key before starting fresh.
 */
export function useLogbook(): {
  logbook: LogbookState | null;
  updateLogbook: (fn: (prev: LogbookState) => LogbookState) => void;
} {
  const [logbook, setLogbook] = useState<LogbookState | null>(null);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then(async (raw) => {
        if (cancelled) return;
        if (raw) {
          const result = deserializeLogbook(raw);
          if (result.ok) {
            setLogbook(result.state);
            return;
          }
          await AsyncStorage.setItem(`${STORAGE_KEY}:backup:${result.reason}`, raw).catch(() => {});
        }
        setLogbook(initLogbook());
      })
      .catch(() => {
        if (!cancelled) setLogbook(initLogbook());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (logbook) {
      AsyncStorage.setItem(STORAGE_KEY, serializeLogbook(logbook)).catch(() => {
        // storage full/unavailable: keep running in-memory rather than crash
      });
    }
  }, [logbook]);

  const updateLogbook = useCallback((fn: (prev: LogbookState) => LogbookState) => {
    setLogbook((prev) => (prev ? fn(prev) : prev));
  }, []);

  return { logbook, updateLogbook };
}
