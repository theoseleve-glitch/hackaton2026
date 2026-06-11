import type { PlayerId } from '@bloop/engine';
import type { Presence } from '@bloop/kit';

/** Bilingual UI string — the client picks a locale at render time. */
export interface LText {
  fr: string;
  en: string;
}

/**
 * One content item. tu-preferes: optionA/optionB ARE the dilemma (no prompt).
 * gauche-ou-droite: prompt/emoji is the judged thing, options are the pack's
 * axis labels (repeated per item by the pack build).
 */
export interface OptionVoteItem {
  id: string;
  optionA: LText;
  optionB: LText;
  prompt?: LText;
  emoji?: string;
  debateStarter?: LText;
}

export interface OptionVoteContent {
  items: OptionVoteItem[];
}

/**
 * predict-majority (Tu Préfères): one atomic { pick, predict } ballot; only a
 * correct majority prediction scores — your own pick never does.
 * majority-herd (Gauche ou Droite): pick only; the majority side scores, the
 * minority feeds the non-scoring Contrarian superlative.
 */
export type OptionVoteScoring = 'predict-majority' | 'majority-herd';

export interface OptionVoteConfig {
  scoring: OptionVoteScoring;
  totalRounds: number;
  chooseMs: number;
  revealMs: number;
  /** 0 disables the debate phase entirely. */
  debateMs: number;
  /** Strictly MORE than this fraction of connected players must tap skip to end the debate early. */
  debateSkipThreshold: number;
  pointsCorrect: number;
}

export const TU_PREFERES_CONFIG: OptionVoteConfig = {
  scoring: 'predict-majority',
  totalRounds: 8,
  chooseMs: 15_000,
  revealMs: 15_000,
  debateMs: 0,
  debateSkipThreshold: 0.5,
  pointsCorrect: 1,
};

export const GAUCHE_DROITE_CONFIG: OptionVoteConfig = {
  scoring: 'majority-herd',
  totalRounds: 7,
  chooseMs: 15_000,
  revealMs: 7_000,
  debateMs: 35_000,
  debateSkipThreshold: 0.5,
  pointsCorrect: 1,
};

export type Option = 'A' | 'B';

export type OptionVotePhase = 'choose' | 'reveal' | 'debate' | 'over';

export interface Ballot {
  pick: Option;
  /** Present iff scoring is predict-majority. */
  predict?: Option;
}

/** Promoted from the hidden buffer at resolve — public from reveal on. */
export interface RoundResult {
  itemId: string;
  counts: { A: number; B: number };
  /** null = perfect tie (incl. the zero-ballots degenerate case). */
  majority: Option | null;
  picks: Record<PlayerId, Option>;
  /** Who scored this round (correct predictors / majority voters). Predictions themselves stay private. */
  awarded: PlayerId[];
}

export interface OptionVoteState {
  config: OptionVoteConfig;
  players: PlayerId[];
  connected: Presence;
  items: OptionVoteItem[];
  round: number;
  phase: OptionVotePhase;
  /** HIDDEN: never exposed through view() pre-reveal beyond hasSubmitted + owner echo. */
  ballots: Record<PlayerId, Ballot>;
  /** Debate skip quorum — public as a count only. */
  skips: Record<PlayerId, true>;
  scores: Record<PlayerId, number>;
  /** majority-herd: rounds spent in the minority (end-screen superlative, never affects points). */
  minorityCount: Record<PlayerId, number>;
  lastResult: RoundResult | null;
}

export type OptionVoteAction =
  | { kind: 'ballot'; pick: Option; predict?: Option }
  | { kind: 'skip' };

export type OptionVoteView =
  | {
      phase: 'choose';
      round: number;
      totalRounds: number;
      scoring: OptionVoteScoring;
      item: OptionVoteItem | null;
      hasSubmitted: Record<PlayerId, boolean>;
      myBallot: Ballot | null;
      scores: Record<PlayerId, number>;
    }
  | {
      phase: 'reveal';
      round: number;
      totalRounds: number;
      scoring: OptionVoteScoring;
      item: OptionVoteItem | null;
      result: RoundResult;
      hasDebate: boolean;
      scores: Record<PlayerId, number>;
    }
  | {
      phase: 'debate';
      round: number;
      totalRounds: number;
      scoring: OptionVoteScoring;
      item: OptionVoteItem | null;
      result: RoundResult;
      skipCount: number;
      skipNeeded: number;
      mySkip: boolean;
      scores: Record<PlayerId, number>;
    }
  | {
      phase: 'over';
      scoring: OptionVoteScoring;
      scores: Record<PlayerId, number>;
      minorityCount: Record<PlayerId, number>;
    };
