import { lastRun } from "./logbook";
import type { LogbookState, RunEntry } from "./types";

/**
 * Garage-facing derivations (D22): the log animates the garage. All pure —
 * the app renders the words, these return the facts.
 */

/** The car's "mood" — what a race engineer would say opening the box. */
export type CarStatus =
  | { kind: "fresh" } // no runs logged yet
  | { kind: "dialed"; track: string; date: string } // last change rated better
  | { kind: "regressed"; track: string; date: string } // last change rated worse
  | { kind: "fighting"; symptom: string; track: string; date: string } // open symptom
  | { kind: "ran"; track: string; date: string }; // ran, nothing reported

export function carStatus(state: LogbookState): CarStatus {
  const last = lastRun(state);
  if (!last) return { kind: "fresh" };
  const track = last.track.name;
  const date = last.created_at;

  if (last.outcome === "better") return { kind: "dialed", track, date };
  if (last.outcome === "worse") return { kind: "regressed", track, date };
  const symptom = last.feedback.tags[0]?.symptom;
  if (symptom) return { kind: "fighting", symptom, track, date };
  return { kind: "ran", track, date };
}

/** The odometer: season facts straight from the log. */
export interface SeasonStats {
  runs: number;
  tracks: number;
  /** overall fastest logged lap and the setup that did it */
  best_lap_s?: number;
  best_lap_setup?: string;
  best_lap_track?: string;
  /** consecutive most-recent rated runs with outcome "better" */
  better_streak: number;
}

export function seasonStats(state: LogbookState): SeasonStats {
  const runs = state.runs;
  const tracks = new Set(runs.map((r) => r.track.name)).size;

  let best: RunEntry | undefined;
  for (const r of runs) {
    const lap = r.result?.best_lap_s;
    if (lap === undefined) continue;
    if (!best || lap < best.result!.best_lap_s!) best = r;
  }

  // streak: walk back from the newest RATED run; unrated runs don't break it
  let better_streak = 0;
  for (let i = runs.length - 1; i >= 0; i--) {
    const outcome = runs[i].outcome;
    if (outcome === undefined) continue;
    if (outcome === "better") better_streak++;
    else break;
  }

  return {
    runs: runs.length,
    tracks,
    best_lap_s: best?.result?.best_lap_s,
    best_lap_setup: best?.setup_name,
    best_lap_track: best?.track.name,
    better_streak,
  };
}
