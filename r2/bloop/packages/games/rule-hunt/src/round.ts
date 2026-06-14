// Pure per-round helpers for the RULE_HUNT reducer — no I/O, no clock:
// detective rotation, the seeded candidate grid, the banked live clock and
// the exact scoring matrix (design 2.16 §9).
import type { PlayerId } from '@bloop/engine';
import { createRng, shuffle } from '@bloop/engine';
import { connectedPlayers, emptyPlayerMap } from '@bloop/kit';
import type { LText, RuleHuntConfig, RuleHuntState, RuleItem } from './state.js';

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

/** Exact scoring matrix (design 2.16). Cloned map — never aliases live state. */
export function scoreRound(
  state: RuleHuntState,
  kind: 'guessed' | 'timeUp',
  perfect: boolean,
): Record<PlayerId, number> {
  const scores = Object.assign(emptyPlayerMap<number>(), state.scores);
  for (const p of state.players) {
    const det = isDetectiveOf(state, p);
    const elim = state.eliminated[p] === true;
    let pts: number;
    if (kind === 'guessed') pts = det ? 4 : elim ? 0 : 1;
    else if (perfect) pts = det ? 1 : 3;
    else pts = det ? 1 : elim ? 1 : 2;
    scores[p] = (scores[p] ?? 0) + pts;
  }
  return scores;
}
