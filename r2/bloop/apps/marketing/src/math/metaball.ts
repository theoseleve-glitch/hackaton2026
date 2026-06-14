export function smin(a: number, b: number, k: number): number {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return b * (1 - h) + a * h - k * h * (1 - h);
}

export interface Droplet { index: number; at: number }
/** Evenly spread N droplet emissions across the mid-scroll band [0.35, 0.85]. */
export function blobSchedule(n: number): Droplet[] {
  const lo = 0.35, hi = 0.85;
  return Array.from({ length: n }, (_, i) => ({ index: i, at: lo + ((hi - lo) * i) / Math.max(1, n - 1) }));
}
