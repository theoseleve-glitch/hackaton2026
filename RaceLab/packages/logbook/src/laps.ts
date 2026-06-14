/**
 * Lap-list derivations (D27). Stats are computed ON DEMAND from a run's
 * result.laps_list — they are never auto-written into best_lap_s/avg_lap_s:
 * a manually entered (or corrected) time always wins; callers opt in.
 */

/** Best and average of a lap list (seconds). Avg rounded to 2 decimals.
 *  Throws on an empty array — "stats of no laps" is a caller bug. */
export function lapStats(laps: number[]): { best: number; avg: number } {
  if (laps.length === 0) throw new Error("lapStats: empty lap list");
  const best = Math.min(...laps);
  const avg = Math.round((laps.reduce((sum, lap) => sum + lap, 0) / laps.length) * 100) / 100;
  return { best, avg };
}
