import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import {
  deserializeFollows,
  follow as followFn,
  initFollows,
  serializeFollows,
  unfollow as unfollowFn,
} from "../../../packages/social/src";
import type { FollowData } from "../../../packages/social/src";

const STORAGE_KEY = "racelab:follows";

/**
 * Who you follow (offline slice): a local set of handles. This IS the outbox
 * that syncs to the backend follow graph (POST/DELETE /follow/{handle}) once it
 * lands. Same never-wipe discipline as the other stores.
 */
export function useFollows(): {
  follows: FollowData | null;
  follow: (handle: string) => void;
  unfollow: (handle: string) => void;
} {
  const [follows, setFollows] = useState<FollowData | null>(null);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then(async (raw) => {
        if (cancelled) return;
        if (raw) {
          const result = deserializeFollows(raw);
          if (result.ok) {
            setFollows(result.state);
            return;
          }
          await AsyncStorage.setItem(`${STORAGE_KEY}:backup:${result.reason}`, raw).catch(() => {});
        }
        setFollows(initFollows());
      })
      .catch(() => {
        if (!cancelled) setFollows(initFollows());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (follows) {
      AsyncStorage.setItem(STORAGE_KEY, serializeFollows(follows)).catch(() => {});
    }
  }, [follows]);

  const follow = useCallback((handle: string) => {
    setFollows((prev) => (prev ? followFn(prev, handle) : prev));
  }, []);
  const unfollow = useCallback((handle: string) => {
    setFollows((prev) => (prev ? unfollowFn(prev, handle) : prev));
  }, []);

  return { follows, follow, unfollow };
}
