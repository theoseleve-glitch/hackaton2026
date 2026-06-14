import type { PlayerId } from '@bloop/engine';
import { emptyPlayerMap } from './player-map.js';

/**
 * CC-1 — Idle-Killer Side-Bet / Prediction Channel (cross-game synthesis §1,
 * CC-1 — the KEYSTONE). A generic HIDDEN-BUFFER secondary-stake primitive: any
 * non-acting player writes a small bet into a redacted buffer that resolves at
 * the reveal against the round's PUBLIC outcome, paying a small flavour bonus.
 *
 * Generic over the bet token `B` (each template supplies its own enum:
 * 'done'|'chicken', 'survives'|'chokes', a predicted target id, …) and the
 * outcome `O`. This file owns ONLY the buffer mechanics + redaction; the
 * eligibility predicate, the bet enum, and the resolve comparator are template
 * logic passed in.
 *
 * THE THREE GUARDS (risk register #3 — audited in every consumer):
 *   (1) NEVER gates the primary early-resolve. The side-bet buffer is a
 *       SEPARATE field from the primary `acted` buffer; a bet is NOT an `acted`
 *       entry and must never be counted toward `allActed`/early-resolve. This
 *       module never touches the primary buffer — keeping the bet in its own
 *       map is the structural guard.
 *   (2) NEVER leaks the primary ballot. The side-bet is the player's PREDICTION
 *       of the outcome, not their primary vote; and `redactSideBets` gives a
 *       non-owner only aggregate counts (or nothing pre-reveal), never another
 *       player's bet value — so it can't be inverted to recover a ballot.
 *   (3) REJECT-INVALID => null. `placeSideBet` returns `null` on any rejected
 *       bet (ineligible actor, or a re-bet over an existing stake); the caller
 *       maps `null` to the SAME state reference (no transition, byte-identical
 *       state). Inputs are NEVER mutated — every accept is copy-on-write.
 *
 * Buffers are doc-commented HIDDEN in state and built with `emptyPlayerMap`
 * (null-proto, pollution-safe, JSON-serializable for event-sourcing).
 */

/** A player-keyed hidden buffer of side-bets. HIDDEN in state. */
export type SideBetBuffer<B> = Record<PlayerId, B>;

/** Fresh, empty side-bet buffer (null-proto). */
export function emptySideBets<B>(): SideBetBuffer<B> {
  return emptyPlayerMap<B>();
}

/**
 * Accept `bet` from `playerId` only when `isEligible` is true. The caller
 * computes eligibility (the "already-acted / non-acting, not the active actor"
 * predicate — eligibility stays game logic) and passes the boolean.
 *
 * Returns a NEW buffer (copy-on-write) on accept; returns `null` on reject so
 * the caller returns the SAME state reference. NEVER mutates `buffer`.
 *
 * Rejects (=> null) when: ineligible, OR the player already has a stake in this
 * buffer (one bet per player per round — re-betting after seeing more info is
 * not allowed; clear the buffer at phase exit to re-open). A bet of `undefined`
 * is also rejected (it is indistinguishable from "no bet").
 */
export function placeSideBet<B>(
  buffer: SideBetBuffer<B>,
  playerId: PlayerId,
  bet: B,
  isEligible: boolean,
): SideBetBuffer<B> | null {
  if (!isEligible) return null;
  if (bet === undefined) return null;
  // One stake per player per round: an existing entry is not overwritten.
  if (buffer[playerId] !== undefined) return null;
  return Object.assign(emptySideBets<B>(), buffer, { [playerId]: bet });
}

/**
 * Resolve every placed bet against the round's PUBLIC `outcome`, returning a
 * per-player scores DELTA (points just won by each correct bettor). Pure: the
 * caller supplies `payout(bet, outcome)` — the points for that bet given the
 * outcome (0 for a wrong/non-matching bet). A negative or non-finite payout is
 * clamped to 0 (a side-bet is upside-only flavour; it never docks the primary
 * score). Players with a 0 delta are omitted (no zero entries), matching the
 * `tally` convention. Inputs are never mutated.
 */
export function resolveSideBets<B, O>(
  buffer: SideBetBuffer<B>,
  outcome: O,
  payout: (bet: B, outcome: O) => number,
): Record<PlayerId, number> {
  const delta = emptyPlayerMap<number>();
  for (const playerId of Object.keys(buffer)) {
    const bet = buffer[playerId]!;
    const raw = payout(bet, outcome);
    const points = Number.isFinite(raw) && raw > 0 ? raw : 0;
    if (points > 0) delta[playerId] = points;
  }
  return delta;
}

/**
 * Public projection of a side-bet buffer for a given `viewer`.
 *   - `own`: the viewer's OWN bet, or `null` if they have not bet
 *     (owner-only echo — `buffer[viewer] ?? null`, never an indexed lookup that
 *     could return a foreign player's value).
 *   - `count`: how many players have placed a bet (an aggregate, leaks no
 *     value).
 *   - `bets`: the full per-player bet map — ONLY present at reveal
 *     (`revealAll`); `null` otherwise so no other player's stake is exposed
 *     pre-reveal.
 */
export interface SideBetView<B> {
  own: B | null;
  count: number;
  bets: Record<PlayerId, B> | null;
}

/**
 * Owner-only / aggregate-only projection (guard #2). Before reveal a non-owner
 * sees ONLY the count; the owner additionally sees their own bet. At reveal
 * (`revealAll: true`) the full bet map is exposed to everyone — the bets are
 * now public alongside the outcome.
 *
 * Uses an own-property check for the owner echo so a player whose id collides
 * with a prototype key (e.g. "__proto__") still gets a correct `null`/value,
 * and never returns a foreign player's bet via prototype walk.
 */
export function redactSideBets<B>(
  buffer: SideBetBuffer<B>,
  viewerId: PlayerId,
  opts?: { revealAll?: boolean },
): SideBetView<B> {
  const count = Object.keys(buffer).length;
  const own = Object.prototype.hasOwnProperty.call(buffer, viewerId)
    ? buffer[viewerId]!
    : null;
  if (opts?.revealAll) {
    // Reveal: clone the buffer into a null-proto map (never alias hidden state).
    return { own, count, bets: Object.assign(emptyPlayerMap<B>(), buffer) };
  }
  return { own, count, bets: null };
}
