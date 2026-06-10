import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { deserialize, initSheets, serialize } from "../../../packages/sheets/src";
import type { SheetsState } from "../../../packages/sheets/src";
import {
  deserialize as deserializeSessions,
  initSessions,
  serialize as serializeSessions,
} from "../../../packages/sessions/src";
import type { SessionsState } from "../../../packages/sessions/src";
import { MP11, MP11_ID } from "./kb";

const STORAGE_KEY = `racelab:sheets:${MP11_ID}`;
const SESSIONS_KEY = "racelab:sessions:v1";

/**
 * Sheets state with AsyncStorage persistence. The draft persists too, so a
 * mid-edit app kill at the track loses nothing (D11 spirit: local first).
 * Corrupt/old data falls back to a fresh kit state instead of crashing.
 */
export function useSheets(): {
  state: SheetsState | null;
  update: (fn: (prev: SheetsState) => SheetsState) => void;
  persistError: boolean;
} {
  const [state, setState] = useState<SheetsState | null>(null);
  const [persistError, setPersistError] = useState(false);

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
      AsyncStorage.setItem(STORAGE_KEY, serialize(state))
        .then(() => setPersistError(false))
        .catch(() => {
          // storage full/unavailable: keep running in-memory, but TELL the
          // user — an invisible write failure loses a whole track day
          setPersistError(true);
        });
    }
  }, [state]);

  const update = useCallback((fn: (prev: SheetsState) => SheetsState) => {
    setState((prev) => (prev ? fn(prev) : prev));
  }, []);

  return { state, update, persistError };
}

/**
 * Sessions state with AsyncStorage persistence — same never-wipe semantics as
 * useSheets: a corrupt/newer-format blob is stashed to a backup key before
 * starting fresh, never silently destroyed.
 */
export function useSessions(): {
  state: SessionsState | null;
  update: (fn: (prev: SessionsState) => SessionsState) => void;
  persistError: boolean;
} {
  const [state, setState] = useState<SessionsState | null>(null);
  const [persistError, setPersistError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(SESSIONS_KEY)
      .then(async (raw) => {
        if (cancelled) return;
        if (raw) {
          const result = deserializeSessions(raw);
          if (result.ok) {
            setState(result.state);
            return;
          }
          // Never silently wipe history: stash the unreadable blob (e.g.
          // written by a NEWER app version) before starting fresh.
          await AsyncStorage.setItem(`${SESSIONS_KEY}:backup:${result.reason}`, raw).catch(() => {});
        }
        setState(initSessions());
      })
      .catch(() => {
        if (!cancelled) setState(initSessions());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state) {
      AsyncStorage.setItem(SESSIONS_KEY, serializeSessions(state))
        .then(() => setPersistError(false))
        .catch(() => {
          setPersistError(true);
        });
    }
  }, [state]);

  const update = useCallback((fn: (prev: SessionsState) => SessionsState) => {
    setState((prev) => (prev ? fn(prev) : prev));
  }, []);

  return { state, update, persistError };
}
