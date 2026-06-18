import { runAvgLap, runBestLap, runFeeling } from "./types";
import type { RunEntry } from "./types";

/**
 * Log-view orderings (D27). All pure and stable (ties keep input order; the
 * input array is never mutated). Runs MISSING the sort key go LAST regardless
 * of direction — a run without a lap time must never render as the fastest.
 * Timing/feel read through the schema accessors.
 */

export type RunSortKey = "date" | "best_lap" | "avg_lap" | "feeling";

/** Per-key defaults: date desc (newest first), lap keys asc (fastest first),
 *  feeling desc (best-feeling first). */
const DEFAULT_DIR: Record<RunSortKey, "asc" | "desc"> = {
  date: "desc",
  best_lap: "asc",
  avg_lap: "asc",
  feeling: "desc",
};

export function sortRuns(runs: RunEntry[], key: RunSortKey, dir?: "asc" | "desc"): RunEntry[] {
  const sign = (dir ?? DEFAULT_DIR[key]) === "asc" ? 1 : -1;
  return [...runs].sort((a, b) => {
    const va = keyValue(a, key);
    const vb = keyValue(b, key);
    if (va === undefined) return vb === undefined ? 0 : 1;
    if (vb === undefined) return -1;
    return sign * (va - vb);
  });
}

export interface SetupGroup {
  setup_version_id: string;
  /** denormalized label taken from the group's most recent run */
  setup_name: string;
  /** input order preserved within the group */
  runs: RunEntry[];
}

/** Runs bucketed by the EXACT setup version driven; groups ordered by most
 *  recent activity (newest created_at in the group) first. */
export function groupBySetup(runs: RunEntry[]): SetupGroup[] {
  const buckets = new Map<string, RunEntry[]>();
  for (const r of runs) {
    const list = buckets.get(r.setup_version_id);
    if (list) list.push(r);
    else buckets.set(r.setup_version_id, [r]);
  }
  return [...buckets.entries()]
    .map(([setup_version_id, list]) => ({
      setup_version_id,
      setup_name: newestOf(list).setup_name,
      runs: list,
    }))
    .sort((a, b) => Date.parse(newestOf(b.runs).created_at) - Date.parse(newestOf(a.runs).created_at));
}

function keyValue(r: RunEntry, key: RunSortKey): number | undefined {
  switch (key) {
    case "date": {
      const t = Date.parse(r.created_at);
      return Number.isNaN(t) ? undefined : t;
    }
    case "best_lap":
      return runBestLap(r);
    case "avg_lap":
      return runAvgLap(r);
    case "feeling":
      return runFeeling(r);
  }
}

function newestOf(runs: RunEntry[]): RunEntry {
  return runs.reduce((newest, r) => (Date.parse(r.created_at) > Date.parse(newest.created_at) ? r : newest));
}
