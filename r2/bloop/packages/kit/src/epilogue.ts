import type { PlayerId } from '@bloop/engine';
import { emptyPlayerMap } from './player-map.js';

/**
 * CC-5 — Cliffhanger / Streak / Superlative Epilogue (cross-game synthesis §1,
 * CC-5). A set of PURE, additive derivations computed at game-over from
 * ALREADY-PUBLIC scores (and optional already-public per-player stats) — NO new
 * in-match secret. Feeds the session-shell Oracle roast and the rematch CTA.
 *
 * Determinism: ranking is a stable sort by (descending score, then ascending
 * player-id) so ties resolve identically on every replay — no RNG, no
 * wall-clock. Default-safe: a template that derives nothing simply never calls
 * these; nothing here touches match state.
 */

/** One ranked scoreboard entry. */
export interface LeaderboardEntry {
  playerId: PlayerId;
  score: number;
  /** 1-based rank; tied scores share a rank (standard "competition" ranking). */
  rank: number;
}

/** Read a score entry as a finite number (missing/garbage => 0). */
function num(v: number | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * Ranked entries, highest score first, ties broken by ascending playerId for a
 * stable, replay-identical order. Tied scores share a 1-based `rank`
 * (competition ranking: 1,2,2,4). Pure; input never mutated.
 */
export function leaderboard(scores: Record<PlayerId, number>): LeaderboardEntry[] {
  const sorted = Object.keys(scores)
    .map((playerId) => ({ playerId, score: num(scores[playerId]) }))
    .sort((a, b) => (b.score - a.score) || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0));
  let rank = 0;
  let prevScore = Number.NaN;
  return sorted.map((e, i) => {
    if (e.score !== prevScore) {
      rank = i + 1;
      prevScore = e.score;
    }
    return { playerId: e.playerId, score: e.score, rank };
  });
}

/**
 * Gap between the top score and the runner-up (top1 - top2). 0 when fewer than
 * two players, or when the top two are tied. Never negative.
 */
export function topGap(scores: Record<PlayerId, number>): number {
  const board = leaderboard(scores);
  if (board.length < 2) return 0;
  return Math.max(0, board[0]!.score - board[1]!.score);
}

/**
 * True when the finish is close — the top-2 gap is at most `threshold` AND
 * there are at least two players. Drives the "closeFinish" cliffhanger chrome.
 * A negative/non-finite threshold disables the flag (returns false).
 */
export function isCloseFinish(scores: Record<PlayerId, number>, threshold: number): boolean {
  if (!Number.isFinite(threshold) || threshold < 0) return false;
  const board = leaderboard(scores);
  if (board.length < 2) return false;
  return topGap(scores) <= threshold;
}

/**
 * The MVP: the sole top-ranked player, or `null` when there is no clear winner
 * (empty roster, OR a tie for first — a contested crown has no single MVP).
 * Deterministic via `leaderboard`'s stable order.
 */
export function mvp(scores: Record<PlayerId, number>): PlayerId | null {
  const board = leaderboard(scores);
  if (board.length === 0) return null;
  // tie for first => no single MVP
  if (board.length > 1 && board[1]!.rank === 1) return null;
  return board[0]!.playerId;
}

/**
 * A boolean superlative awarded to each player who satisfies `predicate` over
 * their already-public per-player `stat`. Generic fold so a template can derive
 * "longestStreak ran the whole game" / "survivedAll" without bespoke loops.
 * Returns the list of qualifying players in roster order of the stat map
 * (stable: ascending playerId), so the result is replay-identical.
 *
 * Pure; no new secret (the stat map is already-public end-of-match data).
 */
export function superlativeWinners<T>(
  stat: Record<PlayerId, T>,
  predicate: (value: T, playerId: PlayerId) => boolean,
): PlayerId[] {
  return Object.keys(stat)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .filter((id) => predicate(stat[id]!, id));
}

/**
 * Fold a numeric per-player stat map (e.g. streak length, rounds survived) into
 * its leader(s): the players holding the MAXIMUM value, with that value. Empty
 * (`{ value: 0, players: [] }`) when the map is empty or every value is <= 0 —
 * a superlative nobody earned is not awarded. Players are returned in stable
 * ascending-id order. Pure; input never mutated.
 */
export function statLeaders(
  stat: Record<PlayerId, number>,
): { value: number; players: PlayerId[] } {
  let best = 0;
  const leaders = emptyPlayerMap<true>();
  let any = false;
  for (const id of Object.keys(stat)) {
    const v = num(stat[id]);
    if (v <= 0) continue;
    if (v > best) {
      best = v;
      for (const k of Object.keys(leaders)) delete leaders[k];
      leaders[id] = true;
      any = true;
    } else if (v === best) {
      leaders[id] = true;
      any = true;
    }
  }
  if (!any) return { value: 0, players: [] };
  return {
    value: best,
    players: Object.keys(leaders).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
  };
}
