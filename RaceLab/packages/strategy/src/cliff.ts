/**
 * Tyre-cliff detection over a lap-time series. Lap 1 is always excluded —
 * it contains the start. A cliff must be SUSTAINED (this lap AND the next
 * both over threshold), so a single mistake never reads as a cliff. Fewer
 * than 8 laps is not enough signal to call one.
 */

/** Minimum series length before a cliff may be reported. */
const MIN_LAPS_FOR_CLIFF = 8;

export interface TyreCliffResult {
  /** first 1-based lap of the sustained drop-off; absent when none found */
  cliff_lap?: number;
  /** least-squares slope over laps 2..n (s gained per lap; 0 when < 2 points) */
  degradation_s_per_lap: number;
}

/**
 * Baseline = median of laps 2..6; threshold = baseline + max(0.6, 2.5% of
 * baseline). cliff_lap = first lap where this lap and the next are BOTH over
 * the threshold.
 */
export function detectTyreCliff(lap_times: number[]): TyreCliffResult {
  // Drop non-finite laps (a NaN/Infinity from a bad import would otherwise poison the
  // slope + median and surface "degrading NaNs/lap" to the driver). Filter, don't reject.
  lap_times = lap_times.filter(Number.isFinite);
  const degradation_s_per_lap = leastSquaresSlope(lap_times);
  if (lap_times.length < MIN_LAPS_FOR_CLIFF) return { degradation_s_per_lap };

  const baseline = median(lap_times.slice(1, 6));
  const threshold = baseline + Math.max(0.6, 0.025 * baseline);
  for (let lap = 2; lap + 1 <= lap_times.length; lap++) {
    if (lap_times[lap - 1] > threshold && lap_times[lap] > threshold) {
      return { cliff_lap: lap, degradation_s_per_lap };
    }
  }
  return { degradation_s_per_lap };
}

/** Slope of y = lap time over x = lap number, laps 2..n (lap 1 excluded). */
function leastSquaresSlope(lap_times: number[]): number {
  const ys = lap_times.slice(1);
  const n = ys.length;
  if (n < 2) return 0;
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    const x = i + 2; // actual lap number; only spacing matters for the slope
    sx += x;
    sy += ys[i];
    sxy += x * ys[i];
    sxx += x * x;
  }
  const denom = n * sxx - sx * sx;
  return denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
}

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
