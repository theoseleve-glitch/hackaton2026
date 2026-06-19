import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import {
  deserializeTracks,
  initTracks,
  serializeTracks,
} from "../../../packages/tracks/src";
import type { TracksState } from "../../../packages/tracks/src";

const STORAGE_KEY = "racelab:tracks";

/**
 * Tracks state with AsyncStorage persistence — same contract and same
 * never-wipe-history discipline as logstore.ts: unreadable blobs are
 * stashed under a :backup key before starting fresh.
 */
export function useTracks(): {
  tracks: TracksState | null;
  updateTracks: (fn: (prev: TracksState) => TracksState) => void;
} {
  const [tracks, setTracks] = useState<TracksState | null>(null);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then(async (raw) => {
        if (cancelled) return;
        if (raw) {
          const result = deserializeTracks(raw);
          if (result.ok) {
            setTracks(result.state);
            return;
          }
          await AsyncStorage.setItem(`${STORAGE_KEY}:backup:${result.reason}`, raw).catch(() => {});
        }
        setTracks(initTracks());
      })
      .catch(() => {
        if (!cancelled) setTracks(initTracks());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (tracks) {
      AsyncStorage.setItem(STORAGE_KEY, serializeTracks(tracks)).catch(() => {
        // storage full/unavailable: keep running in-memory rather than crash
      });
    }
  }, [tracks]);

  const updateTracks = useCallback((fn: (prev: TracksState) => TracksState) => {
    setTracks((prev) => (prev ? fn(prev) : prev));
  }, []);

  return { tracks, updateTracks };
}
