import type { LogbookState, Outcome, RunConditions, RunEntry } from "./types";

/**
 * In-memory run-log state ops over the schema `RunEntry`. Ids are minted
 * upstream by schema `makeRun` (the form/repo seam) — `addRun` appends an
 * already-formed RunEntry. Runs are editable (results and feedback arrive after
 * the run); the app's `useLogbook` backs the state with the runs repo.
 */

export function initLogbook(): LogbookState {
  return { runs: [] };
}

/** Append an already-minted RunEntry (id from schema makeRun). */
export function addRun(state: LogbookState, run: RunEntry): { state: LogbookState; run: RunEntry } {
  return { state: { runs: [...state.runs, run] }, run };
}

/** Patch a run in place (results/feedback/outcome arrive after the run).
 *  Unknown ids are refused (state returned unchanged). */
export function updateRun(
  state: LogbookState,
  id: string,
  patch: Partial<Omit<RunEntry, "id" | "created_at">>,
): LogbookState {
  if (!state.runs.some((r) => r.id === id)) return state;
  return {
    runs: state.runs.map((r) => (r.id === id ? { ...r, ...patch, id: r.id, created_at: r.created_at } : r)),
  };
}

export function deleteRun(state: LogbookState, id: string): LogbookState {
  const runs = state.runs.filter((r) => r.id !== id);
  return runs.length === state.runs.length ? state : { runs };
}

/** Learning-loop one-tap: rate a run better/same/worse vs the previous one. */
export function rateRun(state: LogbookState, id: string, outcome: Outcome): LogbookState {
  return updateRun(state, id, { outcome });
}

export function getRun(state: LogbookState, id: string): RunEntry | undefined {
  return state.runs.find((r) => r.id === id);
}

export function lastRun(state: LogbookState): RunEntry | undefined {
  return state.runs[state.runs.length - 1];
}

/** The run logged immediately before `id` (what "outcome" is rated against). */
export function previousRun(state: LogbookState, id: string): RunEntry | undefined {
  const i = state.runs.findIndex((r) => r.id === id);
  return i > 0 ? state.runs[i - 1] : undefined;
}

/**
 * Layer 2 — "What did I usually do in these conditions?": past runs at a
 * similar track state, most recent first. Same grip is required; surface and
 * track name tighten the match when provided.
 */
export function similarRuns(
  state: LogbookState,
  conditions: Pick<RunConditions, "grip">,
  opts?: { surface?: string; track_name?: string; exclude_id?: string },
): RunEntry[] {
  return state.runs
    .filter((r) => r.id !== opts?.exclude_id)
    .filter((r) => r.conditions.grip === conditions.grip)
    .filter((r) => (opts?.surface ? r.track.surface === opts.surface : true))
    .filter((r) => (opts?.track_name ? r.track.name === opts.track_name : true))
    .reverse();
}
