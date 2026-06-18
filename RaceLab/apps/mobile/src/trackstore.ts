import { useCallback, useEffect, useState } from "react";
import { initTracks } from "../../../packages/tracks/src";
import type { Track, TracksState } from "../../../packages/tracks/src";
import { useRepos } from "./storage/RepoProvider";

/**
 * Tracks state, now backed by William's storage repos (Phase 2B). Seeds from
 * `repos.tracks.getAll()` and, on every `updateTracks(fn)`, diffs the returned
 * tracks against the previous snapshot and issues `repos.tracks.put` /
 * `repos.tracks.remove` for exactly what changed. Element shape is the schema
 * `Track`; the return signature is unchanged.
 *
 * Never-wipe: reads route through the repo's parse-on-read + quarantine.
 */
export function useTracks(): {
  tracks: TracksState | null;
  updateTracks: (fn: (prev: TracksState) => TracksState) => void;
} {
  const repos = useRepos();
  const [tracks, setTracks] = useState<TracksState | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await repos.tracks.getAll();
      if (cancelled) return;
      setTracks({ tracks: res.ok ? [...res.values].sort(byCreated) : [] });
    })();
    return () => {
      cancelled = true;
    };
  }, [repos]);

  const updateTracks = useCallback(
    (fn: (prev: TracksState) => TracksState) => {
      setTracks((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        void persistDiff(repos, prev.tracks, next.tracks);
        return next;
      });
    },
    [repos],
  );

  return { tracks, updateTracks };
}

function byCreated(a: Track, b: Track): number {
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}

async function persistDiff(
  repos: ReturnType<typeof useRepos>,
  prev: readonly Track[],
  next: readonly Track[],
): Promise<void> {
  const now = new Date().toISOString();
  const prevById = new Map(prev.map((t) => [t.id, t]));
  const nextById = new Map(next.map((t) => [t.id, t]));
  for (const track of next) {
    const before = prevById.get(track.id);
    if (before === undefined || JSON.stringify(before) !== JSON.stringify(track)) {
      await repos.tracks.put(track, now);
    }
  }
  for (const track of prev) {
    if (!nextById.has(track.id)) await repos.tracks.remove(track.id, now);
  }
}

export { initTracks };
