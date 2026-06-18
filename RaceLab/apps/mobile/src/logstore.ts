import { useCallback, useEffect, useState } from "react";
import { initLogbook } from "../../../packages/logbook/src";
import type { LogbookState, RunEntry } from "../../../packages/logbook/src";
import { useRepos } from "./storage/RepoProvider";

/**
 * Logbook state, now backed by William's storage repos (Phase 2B). Seeds from
 * `repos.runs.getAll()` and, on every `updateLogbook(fn)`, diffs the returned
 * runs against the previous snapshot and issues `repos.runs.put` /
 * `repos.runs.remove` for exactly what changed. Element shape is the schema
 * `RunEntry`; the return signature is unchanged.
 *
 * Never-wipe: reads route through the repo's parse-on-read + quarantine.
 */
export function useLogbook(): {
  logbook: LogbookState | null;
  updateLogbook: (fn: (prev: LogbookState) => LogbookState) => void;
} {
  const repos = useRepos();
  const [logbook, setLogbook] = useState<LogbookState | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await repos.runs.getAll();
      if (cancelled) return;
      setLogbook({ runs: res.ok ? [...res.values].sort(byCreated) : [] });
    })();
    return () => {
      cancelled = true;
    };
  }, [repos]);

  const updateLogbook = useCallback(
    (fn: (prev: LogbookState) => LogbookState) => {
      setLogbook((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        void persistDiff(repos, prev.runs, next.runs);
        return next;
      });
    },
    [repos],
  );

  return { logbook, updateLogbook };
}

function byCreated(a: RunEntry, b: RunEntry): number {
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}

async function persistDiff(
  repos: ReturnType<typeof useRepos>,
  prev: readonly RunEntry[],
  next: readonly RunEntry[],
): Promise<void> {
  const now = new Date().toISOString();
  const prevById = new Map(prev.map((r) => [r.id, r]));
  const nextById = new Map(next.map((r) => [r.id, r]));
  for (const run of next) {
    const before = prevById.get(run.id);
    if (before === undefined || JSON.stringify(before) !== JSON.stringify(run)) {
      await repos.runs.put(run, now);
    }
  }
  for (const run of prev) {
    if (!nextById.has(run.id)) await repos.runs.remove(run.id, now);
  }
}

export { initLogbook };
