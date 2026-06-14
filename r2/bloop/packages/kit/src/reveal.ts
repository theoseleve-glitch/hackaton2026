import type { PlayerId } from '@bloop/engine';
import { emptyPlayerMap } from './player-map.js';

/**
 * CC-3 — Two-Beat Reveal + Deferred Scoring support (cross-game synthesis §1,
 * CC-3 — the cheapest universal win). The reveal has two beats: a short
 * SUSPENSE hold (scores frozen) then the VERDICT slam (the score visibly
 * climbs). The critical sub-rule: defer the score mutation into the verdict
 * beat and expose a `delta` (points just awarded) so the client animates the
 * climb HONESTLY instead of the number silently pre-moving.
 *
 * This wave ships the PURE delta helper + the payload types only — the
 * per-template reducer phase split (e.g. tracer's count→verdict) is a later
 * wave. The helper is default-safe: a template that doesn't render a reveal
 * simply never calls it, so existing behaviour is byte-for-byte unchanged.
 */

/** Which beat of the two-beat reveal a payload describes. */
export type RevealStep = 'suspense' | 'verdict';

/**
 * A reveal view payload: the per-player points just awarded this reveal, plus
 * an optional beat marker. `delta` lets the client animate each player's climb;
 * `step` lets it hold (`'suspense'`, scores frozen) then slam (`'verdict'`).
 */
export interface RevealPayload {
  delta: Record<PlayerId, number>;
  step?: RevealStep;
}

/**
 * Per-player points-just-awarded = `after - before`, for the client to animate
 * the on-screen climb. Pure & deterministic; derived from two PUBLIC score maps
 * (no new secret). Both maps are match-local score snapshots.
 *
 * Behaviour:
 *   - keys are the UNION of both maps (a newly-scoring player present only in
 *     `after` yields their full points; a player only in `before` yields a
 *     negative/zero delta).
 *   - a missing entry reads as 0 (`before` undefined => full `after` value).
 *   - entries whose delta is exactly 0 are OMITTED (no zero entries — matches
 *     the `tally` convention; the client only animates players who moved).
 *   - non-finite arithmetic (e.g. a NaN score) is skipped, never emitted.
 *   - null-proto, JSON-safe output; neither input is mutated.
 */
export function scoreDelta(
  before: Record<PlayerId, number>,
  after: Record<PlayerId, number>,
): Record<PlayerId, number> {
  const delta = emptyPlayerMap<number>();
  // Union of keys; iterate `after` first then any before-only keys.
  for (const id of Object.keys(after)) {
    const d = num(after[id]) - num(before[id]);
    if (Number.isFinite(d) && d !== 0) delta[id] = d;
  }
  for (const id of Object.keys(before)) {
    if (Object.prototype.hasOwnProperty.call(after, id)) continue;
    const d = num(after[id]) - num(before[id]);
    if (Number.isFinite(d) && d !== 0) delta[id] = d;
  }
  return delta;
}

/** Read a score entry as a finite number, treating missing/garbage as 0. */
function num(v: number | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
