// Pure per-round helpers for the RULE_HUNT reducer — no I/O, no clock:
// detective rotation, the seeded candidate grid, the banked live clock and
// the exact scoring matrix (design 2.16 §9).
import type { PlayerId } from '@bloop/engine';
import { createRng, shuffle } from '@bloop/engine';
import {
  connectedPlayers,
  emptyPlayerMap,
  isCloseFinish,
  mvp,
  statLeaders,
  streakBonus,
  topGap,
} from '@bloop/kit';
import type {
  FlagBet,
  NoteBet,
  RuleHuntConfig,
  RuleHuntEpilogue,
  RuleHuntState,
  RuleItem,
  LText,
} from './state.js';

/** 'auto' = 1 detective for 4-7 players, 2 for 8-16 (impostor-table style). */
export function resolveDetectiveCount(config: RuleHuntConfig, rosterSize: number): number {
  return config.detectiveCount === 'auto' ? (rosterSize <= 7 ? 1 : 2) : config.detectiveCount;
}

/**
 * Round-r detectives: next `count` ids from detectiveOrder, consecutive with
 * wraparound; a disconnected scheduled detective is skipped forward at round
 * start. Degenerate fill (everyone disconnected) keeps the count honest so
 * the round structure never collapses — the room-collapse guard ends the
 * match at the next resolution point anyway.
 */
export function pickDetectives(
  order: readonly PlayerId[],
  cursor: number,
  count: number,
  connected: Record<PlayerId, boolean>,
): { detectives: PlayerId[]; nextCursor: number } {
  const len = order.length;
  const detectives: PlayerId[] = [];
  let scanned = 0;
  while (detectives.length < count && scanned < len) {
    const id = order[(cursor + scanned) % len]!;
    scanned += 1;
    if (connected[id] === true) detectives.push(id);
  }
  for (let fill = 0; detectives.length < count && fill < len; fill++) {
    const id = order[(cursor + fill) % len]!;
    if (!detectives.includes(id)) detectives.push(id);
  }
  return { detectives, nextCursor: (cursor + Math.max(scanned, 1)) % len };
}

/** Seeded per-round fork: the grid order is identical for every viewer and every replay. */
export function buildGrid(
  seed: string,
  round: number,
  item: RuleItem | undefined,
  candidateCount: number,
): { candidateTexts: LText[]; trueCandidateIndex: number } {
  if (item === undefined) return { candidateTexts: [], trueCandidateIndex: -1 };
  const entries: Array<{ text: LText; isRule: boolean }> = [
    { text: item.rule, isRule: true },
    ...item.decoys.slice(0, Math.max(0, candidateCount - 1)).map((d) => ({ text: d, isRule: false })),
  ];
  const grid = shuffle(createRng(`${seed}:grid:${round}`), entries);
  return { candidateTexts: grid.map((e) => e.text), trueCandidateIndex: grid.findIndex((e) => e.isRule) };
}

/**
 * Seeded heat-check pick: name one alive, connected, non-detective follower for
 * spotlight instance `seq`. The candidate set is roster-ordered (deterministic),
 * and the index is drawn from `createRng(`${seed}:spot:${round}:${seq}`)` — the
 * SAME `Math.floor(rng() * n)` draw the engine's `shuffle` uses — so the same
 * seed yields the same spotlight order across every replay. Returns `null` when
 * no follower is eligible (the caller never enters spotlight then).
 */
export function pickSpotlight(
  state: RuleHuntState,
  round: number,
  seq: number,
): PlayerId | null {
  const pool = aliveConnectedFollowers(state);
  if (pool.length === 0) return null;
  const rng = createRng(`${state.seed}:spot:${round}:${seq}`);
  return pool[Math.floor(rng() * pool.length)] ?? null;
}

export const isDetectiveOf = (state: RuleHuntState, id: PlayerId): boolean => state.detectives.includes(id);

export function connectedFollowers(state: RuleHuntState): PlayerId[] {
  return connectedPlayers(state.players, state.connected).filter((p) => !isDetectiveOf(state, p));
}

/** Tribunal electorate: connected followers, not eliminated, not the accused (the accuser MAY vote; detectives NEVER do). */
export function eligibleVoters(state: RuleHuntState, accused: PlayerId): PlayerId[] {
  return connectedFollowers(state).filter((p) => state.eliminated[p] !== true && p !== accused);
}

export function aliveConnectedFollowers(state: RuleHuntState): PlayerId[] {
  return connectedFollowers(state).filter((p) => state.eliminated[p] !== true);
}

export function collapsed(state: RuleHuntState): boolean {
  return connectedPlayers(state.players, state.connected).length < 3;
}

/** Bank the live clock from event-`at` arithmetic only — clamped both ways, never wall clock. */
export function bank(state: RuleHuntState, at: number): number {
  return Math.max(0, state.liveRemainingMs - Math.max(0, at - state.segmentStartedAt));
}

/**
 * Count the soft reads that landed AGAINST the spotlit performer this beat: a
 * follower's `'flag'` + a detective's `'suspicious'` each add 1 (a `'clean'` /
 * `'clear'` read does not). Pure fold over the hidden buffers — collapses them
 * to a single AGGREGATE integer (no player identity survives), which is exactly
 * what `resolveSpotlight` banks onto the public `heat` meter before dropping
 * the raw buffers. So nobody's hidden read can be recovered from `heat`.
 */
export function spotlightHeat(
  flags: Record<PlayerId, FlagBet>,
  notes: Record<PlayerId, NoteBet>,
): number {
  let h = 0;
  for (const p of Object.keys(flags)) if (flags[p] === 'flag') h += 1;
  for (const p of Object.keys(notes)) if (notes[p] === 'suspicious') h += 1;
  return h;
}

/**
 * Add `delta` heat to `target` on a CLONED copy of the public meter (never
 * aliases live state). 0-deltas leave the meter untouched so it stays a sparse,
 * tally-style aggregate (0-entries omitted).
 */
export function accrueHeat(
  heat: Record<PlayerId, number>,
  target: PlayerId,
  delta: number,
): Record<PlayerId, number> {
  const next = Object.assign(emptyPlayerMap<number>(), heat);
  if (delta > 0) next[target] = (next[target] ?? 0) + delta;
  return next;
}

/**
 * CC-2 reveal payoff input: the SURVIVING (connected, non-eliminated) followers
 * who drew ZERO suspicion-heat all round — the coolest performers. Derived from
 * the PUBLIC `heat` meter in stable ascending-id order, so it is replay-stable
 * and a non-secret. Detectives and eliminated/convicted followers are excluded
 * (a convicted follower was the heat sink; a detective is never "cool").
 */
export function coolestFollowers(state: RuleHuntState): PlayerId[] {
  return connectedFollowers(state)
    .filter((p) => state.eliminated[p] !== true && (state.heat[p] ?? 0) === 0)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Exact scoring matrix (design 2.16) PLUS the CC-2 heat-meter payoff. Cloned map
 * — never aliases live state.
 *
 * CC-2 is DEFAULT-IDENTITY: `config.coolBonus`/`detectiveReadBonus` default to 0,
 * so with the shipped config every existing exact-score test stays byte-for-byte
 * green — the bonuses only move points once a pack opts in.
 *   - coolest-follower bonus: each SURVIVING follower who drew zero suspicion
 *     heat all round earns `coolBonus` (kit `streakBonus` with a 1-streak — a
 *     pure, clamped non-negative add). The crime parfait individuel.
 *   - detective-read bonus: when the round's heat "read true" (a conviction
 *     landed — the room's flinches pointed at a real breaker the tribunal then
 *     eliminated) every detective earns `detectiveReadBonus`. Aggregate-only,
 *     never per-ballot.
 */
export function scoreRound(
  state: RuleHuntState,
  kind: 'guessed' | 'timeUp',
  perfect: boolean,
): Record<PlayerId, number> {
  const scores = Object.assign(emptyPlayerMap<number>(), state.scores);
  const cool = new Set(coolestFollowers(state));
  // Heat "read true" iff a conviction landed this round (a real breaker was
  // eliminated by the tribunal the spotlight heat pointed at).
  const heatReadTrue = state.infractions > 0;
  for (const p of state.players) {
    const det = isDetectiveOf(state, p);
    const elim = state.eliminated[p] === true;
    let pts: number;
    if (kind === 'guessed') pts = det ? 4 : elim ? 0 : 1;
    else if (perfect) pts = det ? 1 : 3;
    else pts = det ? 1 : elim ? 1 : 2;
    // CC-2 heat-meter payoff (default 0 => identity).
    if (det) {
      if (heatReadTrue) pts += streakBonus(1, { perStreak: state.config.detectiveReadBonus });
    } else if (cool.has(p)) {
      pts += streakBonus(1, { perStreak: state.config.coolBonus });
    }
    scores[p] = (scores[p] ?? 0) + pts;
  }
  return scores;
}

/**
 * CC-5 epilogue — derived at 'over' from already-PUBLIC end-of-match state only
 * (final scores + the public crime-parfait `cleanStreak`). No new secret, no
 * RNG, no wall clock. The streak superlative folds the single public streak
 * counter to its holder(s) — every still-connected player who carried the
 * final clean streak (kit `statLeaders` semantics over a roster-wide map, so a
 * 0 streak awards nobody).
 */
export function buildEpilogue(state: RuleHuntState, closeThreshold: number): RuleHuntEpilogue {
  // The crime-parfait superlative belongs to whoever is "still in the room"
  // holding the final clean streak. We project the single public streak onto a
  // roster-wide map (followers + detectives all share the room's clean run) and
  // let `statLeaders` award it only when the streak is > 0.
  const streakMap = emptyPlayerMap<number>();
  for (const p of state.players) {
    if (state.connected[p] === true) streakMap[p] = state.cleanStreak;
  }
  const leaders = statLeaders(streakMap);
  return {
    mvp: mvp(state.scores),
    topGap: topGap(state.scores),
    closeFinish: isCloseFinish(state.scores, closeThreshold),
    cleanStreak: { length: leaders.value, holders: leaders.players },
  };
}
