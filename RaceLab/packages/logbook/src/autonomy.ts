import type { RunEntry } from "./types";

/**
 * Race-strategy autonomy from logged run-until-dry tests (v3). A PRACTICE
 * run carrying result.autonomy_test.time_s is a MEASURED "seconds a full
 * tank lasts"; bestAutonomy picks the most trustworthy one for a venue.
 * Pure function — runs are taken in logbook order (oldest first), so the
 * last match is the most recent.
 */

export interface BestAutonomyOpts {
  track_id?: string;
  track_name?: string;
  grip?: string;
}

/**
 * Most recent PRACTICE run with a measured autonomy_test.time_s at the SAME
 * track — matched by track_id when given (or by track name). Preference
 * order: same track AND same conditions.grip first, then same track any
 * grip, then undefined. NEVER cross-track: autonomy measured at another
 * venue is not a number to race on.
 */
export function bestAutonomy(
  runs: RunEntry[],
  opts: { track_id?: string; track_name?: string; grip?: string },
): { time_s: number; from_run_id: string } | undefined {
  const candidates = runs.filter(
    (r) =>
      r.type === "practice" &&
      typeof r.result?.autonomy_test?.time_s === "number" &&
      sameTrack(r, opts),
  );
  const newest = (list: RunEntry[]): RunEntry | undefined => list[list.length - 1];
  const chosen =
    (opts.grip !== undefined
      ? newest(candidates.filter((r) => r.conditions.grip === opts.grip))
      : undefined) ?? newest(candidates);
  const time_s = chosen?.result?.autonomy_test?.time_s;
  return chosen !== undefined && time_s !== undefined
    ? { time_s, from_run_id: chosen.id }
    : undefined;
}

/** Same venue: track_id match when the caller gives one, else name match.
 *  No track in opts → nothing matches (cross-track is never an answer). */
function sameTrack(run: RunEntry, opts: BestAutonomyOpts): boolean {
  if (opts.track_id !== undefined && run.track_id === opts.track_id) return true;
  return opts.track_name !== undefined && run.track.name === opts.track_name;
}
