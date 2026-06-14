import type { PlayerId } from '@bloop/engine';
import type { RevealStep } from '@bloop/kit';

export type { RevealStep };

/** Bilingual content string — carried through views AS-IS; the client picks a locale at render time. */
export interface LText {
  fr: string;
  en: string;
}

/**
 * One designation card. Legacy packs (tracer-core) author plain strings;
 * wave-2 bilingual packs (pires-potes) author {fr,en} objects. The reducer
 * never inspects a prompt — it flows from the pack through view() untouched,
 * so a mixed array is also valid.
 */
export type TracerPrompt = string | LText;

export interface TracerConfig {
  totalRounds: number;
  voteMs: number;
  revealMs: number;
}

export const DEFAULT_CONFIG: TracerConfig = {
  totalRounds: 3,
  voteMs: 20_000,
  revealMs: 5_000,
};

/**
 * pires-potes (Pires Potes / Worst Mates) — design §2.3, by-game spec params:
 * 7 rounds × (18 s vote + 6 s reveal) ≈ 3 min session. Pure config on the
 * tracer machinery (VOTE@1): vote a PLAYER, most-voted "wins the shame card".
 */
export const PIRES_POTES_CONFIG: TracerConfig = {
  totalRounds: 7,
  voteMs: 18_000,
  revealMs: 6_000,
};

export type TracerPhase = 'vote' | 'reveal' | 'over';

export interface TracerState {
  config: TracerConfig;
  players: PlayerId[];
  prompts: TracerPrompt[];
  round: number;
  phase: TracerPhase;
  /**
   * Two-beat reveal cursor (CC-3). Only meaningful while `phase === 'reveal'`:
   * 'suspense' holds the scoreboard frozen at its PRE-round value (the breath),
   * 'verdict' is the slam where the deferred `+1` lands and the room-designated
   * player is named. `null` outside the reveal phase. Deterministic; advanced
   * only by a deadline hop, never by wall clock.
   */
  revealStep: RevealStep | null;
  /** HIDDEN: never exposed through view(). */
  votes: Record<PlayerId, PlayerId>;
  scores: Record<PlayerId, number>;
}

export type TracerAction = { kind: 'vote'; target: PlayerId };

export type TracerView =
  | {
      phase: 'vote';
      round: number;
      totalRounds: number;
      prompt: TracerPrompt;
      hasVoted: Record<PlayerId, boolean>;
      myVote: PlayerId | null;
      scores: Record<PlayerId, number>;
    }
  | {
      phase: 'reveal';
      round: number;
      totalRounds: number;
      prompt: TracerPrompt;
      tally: Record<PlayerId, number>;
      /**
       * 'suspense' = the breath (scores FROZEN at pre-round value), 'verdict' =
       * the slam (scores show the climbed total). The two-beat reveal (CC-3).
       */
      revealStep: RevealStep;
      /**
       * Points just awarded this round, per player (kit `scoreDelta`). EMPTY in
       * 'suspense' (nothing has landed yet) so the client can hold, populated in
       * 'verdict' so it can animate the climb honestly. Derived from PUBLIC
       * scores — never leaks ballots.
       */
      delta: Record<PlayerId, number>;
      /**
       * The room-DESIGNATED player(s): everyone tied at the max tally (i.e. who
       * "wins the card"). Aggregate-derived from the public tally, identical for
       * every viewer — names WHO the room pointed at, never WHO voted. Empty on
       * a zero-vote round.
       */
      designated: PlayerId[];
      scores: Record<PlayerId, number>;
    }
  | { phase: 'over'; scores: Record<PlayerId, number> };
