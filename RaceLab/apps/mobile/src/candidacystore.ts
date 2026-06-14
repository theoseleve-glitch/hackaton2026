import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import {
  deserializeCandidacy,
  initCandidacy,
  serializeCandidacy,
  submitCandidacy,
} from "../../../packages/social/src";
import type { CandidacyData } from "../../../packages/social/src";

const STORAGE_KEY = "racelab:track-candidacy";

/**
 * Local track-candidacy state (offline slice): "submit as official" stamps a
 * track as a candidate and persists it; this IS the outbox that syncs to the
 * admin-curated backend review queue when it lands (D10/D11). Same never-wipe
 * discipline as the other stores.
 */
export function useCandidacy(): {
  candidacy: CandidacyData | null;
  submit: (trackId: string) => void;
} {
  const [candidacy, setCandidacy] = useState<CandidacyData | null>(null);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then(async (raw) => {
        if (cancelled) return;
        if (raw) {
          const result = deserializeCandidacy(raw);
          if (result.ok) {
            setCandidacy(result.state);
            return;
          }
          await AsyncStorage.setItem(`${STORAGE_KEY}:backup:${result.reason}`, raw).catch(() => {});
        }
        setCandidacy(initCandidacy());
      })
      .catch(() => {
        if (!cancelled) setCandidacy(initCandidacy());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (candidacy) {
      AsyncStorage.setItem(STORAGE_KEY, serializeCandidacy(candidacy)).catch(() => {});
    }
  }, [candidacy]);

  const submit = useCallback((trackId: string) => {
    setCandidacy((prev) => (prev ? submitCandidacy(prev, trackId, new Date().toISOString()) : prev));
  }, []);

  return { candidacy, submit };
}
