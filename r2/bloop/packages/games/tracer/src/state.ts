import type { PlayerId } from '@bloop/engine';

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
  voteMs: 30_000,
  revealMs: 5_000,
};

/**
 * pires-potes (Pires Potes / Worst Mates) — design §2.3, by-game spec params:
 * 7 rounds × (20 s vote + 7 s reveal) ≈ 3 min session. Pure config on the
 * tracer machinery (VOTE@1): vote a PLAYER, most-voted "wins the shame card".
 */
export const PIRES_POTES_CONFIG: TracerConfig = {
  totalRounds: 7,
  voteMs: 20_000,
  revealMs: 7_000,
};

export type TracerPhase = 'vote' | 'reveal' | 'over';

export interface TracerState {
  config: TracerConfig;
  players: PlayerId[];
  prompts: TracerPrompt[];
  round: number;
  phase: TracerPhase;
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
      scores: Record<PlayerId, number>;
    }
  | { phase: 'over'; scores: Record<PlayerId, number> };
