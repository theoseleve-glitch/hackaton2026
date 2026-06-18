import { lastRun } from "./logbook";
import { runBestLap, runEntrants, runPosition } from "./types";
import type { LogbookState, RunEntry } from "./types";

/**
 * Garage-facing derivations (D22): the log animates the garage. All pure —
 * the app renders the words, these return the facts. Reads timing through the
 * `runBestLap`/`runPosition` accessors (schema `effectiveTiming`), so the
 * laps-branch and the manual-summary branch are both handled.
 */

void runEntrants; // re-exported via types; kept importable for symmetry

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

/** Career/yearly driver record: the bragging numbers, straight from the log. */
export interface DriverStats {
  runs: number;
  tracks: number;
  /** competitive sessions logged (qualifier + main) */
  races: number;
  /** competitive finishes in the top 3 */
  podiums: number;
  /** competitive finishes in P1 */
  wins: number;
  best_lap_s?: number;
  best_lap_track?: string;
  /** podiums / placed races, 0..1 — undefined when no placed races yet */
  podium_rate?: number;
  /** wins / placed races, 0..1 — undefined when no placed races yet */
  win_rate?: number;
}

/** year is a 4-digit string ("2026"); omitted = whole career. */
export function driverStats(state: LogbookState, year?: string): DriverStats {
  const runs = year === undefined ? state.runs : state.runs.filter((r) => r.created_at.startsWith(year));
  const competitive = runs.filter((r) => r.type === "qualifier" || r.type === "main");
  const placed = competitive.filter((r) => runPosition(r) !== undefined);

  let best: RunEntry | undefined;
  let bestLap: number | undefined;
  for (const r of runs) {
    const lap = runBestLap(r);
    if (lap === undefined) continue;
    if (bestLap === undefined || lap < bestLap) {
      best = r;
      bestLap = lap;
    }
  }

  const podiums = placed.filter((r) => runPosition(r)! <= 3).length;
  const wins = placed.filter((r) => runPosition(r)! === 1).length;

  return {
    runs: runs.length,
    tracks: new Set(runs.map((r) => r.track.name)).size,
    races: competitive.length,
    podiums,
    wins,
    best_lap_s: bestLap,
    best_lap_track: best?.track.name,
    podium_rate: placed.length ? podiums / placed.length : undefined,
    win_rate: placed.length ? wins / placed.length : undefined,
  };
}

/** What records a single run newly set, evaluated against the rest of the log.
 *  Powers the save-time celebration (PB splash). All four are independent. */
export interface RunRecords {
  /** fastest lap across the whole log (beats at least one prior lap) */
  careerBestLap: boolean;
  /** fastest lap at this track (beats at least one prior lap here) */
  trackBestLap: boolean;
  /** first-ever competitive top-3 finish */
  firstPodium: boolean;
  /** first-ever competitive win */
  firstWin: boolean;
}

/** Given a `state` that ALREADY INCLUDES `run`, report which records `run` set.
 *  Pure — the UI decides how to celebrate. A first-ever lap is not a "beat"
 *  (nothing to beat), so a record requires at least one prior comparable lap. */
export function checkRecords(state: LogbookState, run: RunEntry): RunRecords {
  const others = state.runs.filter((r) => r.id !== run.id);
  const lap = runBestLap(run);

  let careerBestLap = false;
  let trackBestLap = false;
  if (lap !== undefined) {
    const prior = (rs: RunEntry[]) =>
      rs.map((r) => runBestLap(r)).filter((l): l is number => l !== undefined);
    const careerPrior = prior(others);
    careerBestLap = careerPrior.length > 0 && careerPrior.every((l) => lap < l);
    const trackPrior = prior(others.filter((r) => r.track.name === run.track.name));
    trackBestLap = trackPrior.length > 0 && trackPrior.every((l) => lap < l);
  }

  const isCompetitive = run.type === "qualifier" || run.type === "main";
  const pos = runPosition(run);
  const otherPlaced = others.filter(
    (r) => (r.type === "qualifier" || r.type === "main") && runPosition(r) !== undefined,
  );
  const firstPodium =
    isCompetitive && pos !== undefined && pos <= 3 && !otherPlaced.some((r) => runPosition(r)! <= 3);
  const firstWin =
    isCompetitive && pos === 1 && !otherPlaced.some((r) => runPosition(r)! === 1);

  return { careerBestLap, trackBestLap, firstPodium, firstWin };
}

/** A long-tail goal derived purely from the log. `earned` ones are trophies,
 *  unearned ones are the next thing to chase (with live `progress`). */
export interface Achievement {
  id: string;
  label: string;
  icon: string;
  earned: boolean;
  /** progress toward earning, 0..1 (1 once earned) */
  progress: number;
  /** human hint, e.g. "12 / 50 runs" */
  hint: string;
}

/** All achievements with live progress — deterministic, recomputed from the log
 *  (nothing to persist). Order = roughly the path a new driver walks. */
export function computeAchievements(state: LogbookState): Achievement[] {
  const d = driverStats(state);
  const s = seasonStats(state);
  const count = (label: string, icon: string, value: number, target: number, noun: string): Achievement => ({
    id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    label,
    icon,
    earned: value >= target,
    progress: Math.min(1, target ? value / target : 1),
    hint: value >= target ? "Earned" : `${value} / ${target} ${noun}`,
  });

  return [
    count("First Run", "🏁", d.runs, 1, "runs"),
    count("Regular", "📋", d.runs, 10, "runs"),
    count("Veteran", "📚", d.runs, 50, "runs"),
    count("Centurion", "💯", d.runs, 100, "runs"),
    count("Explorer", "🗺️", d.tracks, 5, "tracks"),
    count("First Podium", "🏆", d.podiums, 1, "podiums"),
    count("First Win", "🥇", d.wins, 1, "wins"),
    count("Podium Habit", "🎖️", d.podiums, 10, "podiums"),
    count("On a Roll", "🔥", s.better_streak, 3, "better runs in a row"),
  ];
}

/** Progress toward the next round-number milestone above `value`. Returns null
 *  once `value` clears the top step. Used for "X away from your next 50". */
export function nextMilestone(
  value: number,
  steps: number[] = [1, 5, 10, 25, 50, 100, 250, 500, 1000],
): { next: number; prev: number; progress: number } | null {
  const next = steps.find((s) => s > value);
  if (next === undefined) return null;
  const below = steps.filter((s) => s <= value);
  const prev = below.length ? below[below.length - 1] : 0;
  return { next, prev, progress: (value - prev) / (next - prev) };
}

export function seasonStats(state: LogbookState): SeasonStats {
  const runs = state.runs;
  const tracks = new Set(runs.map((r) => r.track.name)).size;

  let best: RunEntry | undefined;
  let bestLap: number | undefined;
  for (const r of runs) {
    const lap = runBestLap(r);
    if (lap === undefined) continue;
    if (bestLap === undefined || lap < bestLap) {
      best = r;
      bestLap = lap;
    }
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
    best_lap_s: bestLap,
    best_lap_setup: best?.setup_name,
    best_lap_track: best?.track.name,
    better_streak,
  };
}
