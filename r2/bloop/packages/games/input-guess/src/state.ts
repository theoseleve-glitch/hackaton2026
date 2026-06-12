import type { PlayerId } from '@bloop/engine';
import type { Presence } from '@bloop/kit';

/** Bilingual UI string — the client picks a locale at render time. */
export interface LText {
  fr: string;
  en: string;
}

export type InputGuessMode = 'closest-number' | 'crowd-target';

// ---------------------------------------------------------------------------
// Content (runtime ContentPack data — a cleaned mapping of the authored packs)
// ---------------------------------------------------------------------------

/**
 * closest-number item (quizz-culture-ge / Au Pif!). `answer` and `funFact`
 * are VALUE SECRETS until reveal: view() never exposes them in the guess
 * phase. Authoring-only fields (tags, difficulty, verifiedAt, source) are
 * stripped by the pack adapter.
 */
export interface NumberQuestionItem {
  id: string;
  question: LText;
  /** Canonical verified truth — the ONLY scoring input. SECRET until reveal. */
  answer: number;
  unit: LText | null;
  /** 'year' renders the reveal as a timeline. */
  format: 'plain' | 'year';
  /** Number-line rendering hint for huge-range answers. */
  scale: 'linear' | 'log';
  /** Reveal punchline; doubles as the answer's justification. SECRET until reveal. */
  funFact: LText;
}

export interface CrowdCompletion {
  id: string;
  text: LText;
  /** Pre-computed offline crowd YES %. SECRET until reveal. */
  crowdYesPct: number;
}

/** crowd-target item (cinquante-cinquante / Fifty-Fifty). One item = one round. */
export interface CrowdTargetItem {
  id: string;
  /** The ANNOUNCED target split ("aim for 80% YES") — public from pick on. */
  targetYesPct: number;
  /** How the fictional crowd was asked — drives the reveal copy. */
  askKind: 'didYou' | 'agree' | 'wouldYou';
  stem: LText;
  completions: CrowdCompletion[];
}

export type InputGuessItem = NumberQuestionItem | CrowdTargetItem;

export interface InputGuessContent {
  items: InputGuessItem[];
}

export function isNumberItem(item: InputGuessItem): item is NumberQuestionItem {
  return typeof (item as NumberQuestionItem).answer === 'number'
    && Number.isFinite((item as NumberQuestionItem).answer);
}

export function isCrowdItem(item: InputGuessItem): item is CrowdTargetItem {
  return Array.isArray((item as CrowdTargetItem).completions)
    && (item as CrowdTargetItem).completions.length >= 2;
}

// ---------------------------------------------------------------------------
// Config (per-game exported configs — params straight from the design specs)
// ---------------------------------------------------------------------------

interface InputGuessBaseConfig {
  totalRounds: number;
  revealMs: number;
}

export interface ClosestNumberConfig extends InputGuessBaseConfig {
  mode: 'closest-number';
  guessMs: number;
  /** Competition ranking payouts by rank index (ties share and skip ranks). */
  pointsByRank: readonly number[];
  /** "Pile !" bonus for an exact hit. */
  exactBonus: number;
  /** All points ×N in the final round. */
  finalRoundMultiplier: number;
  /** Price-is-right variant: guesses over the answer are eliminated. */
  bustIfOver: boolean;
  /** Hard integer-only input clamp (digits). */
  maxInputDigits: number;
  earlyAdvanceOnAllSubmitted: boolean;
}

export interface CrowdTargetConfig extends InputGuessBaseConfig {
  mode: 'crowd-target';
  pickMs: number;
  cardsPerRound: number;
  closestPoints: number;
  secondPoints: number;
  bullseyeBonus: number;
  bullseyeWindowPct: number;
}

export type InputGuessConfig = ClosestNumberConfig | CrowdTargetConfig;

/** quizz-culture-ge — "Au Pif !" / "Ballpark!" (design wave2 §2.4). */
export const QUIZZ_CULTURE_GE_CONFIG: ClosestNumberConfig = {
  mode: 'closest-number',
  totalRounds: 8,
  guessMs: 20_000,
  revealMs: 12_000,
  pointsByRank: [100, 50, 25],
  exactBonus: 50,
  finalRoundMultiplier: 2,
  bustIfOver: false,
  maxInputDigits: 9,
  earlyAdvanceOnAllSubmitted: true,
};

/** cinquante-cinquante — "Cinquante-Cinquante" / "Fifty-Fifty" (design wave2 §2.5). */
export const CINQUANTE_CINQUANTE_CONFIG: CrowdTargetConfig = {
  mode: 'crowd-target',
  totalRounds: 7,
  cardsPerRound: 6,
  pickMs: 25_000,
  revealMs: 12_000,
  closestPoints: 3,
  secondPoints: 1,
  bullseyeBonus: 2,
  bullseyeWindowPct: 2,
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Internal phase. phaseKey renders the collect phase as 'guess' (closest-number) or 'pick' (crowd-target). */
export type InputGuessPhase = 'guess' | 'reveal' | 'over';

/** Promoted from the hidden buffer at resolve — public from reveal on. */
export interface ClosestRoundResult {
  kind: 'closest-number';
  itemId: string;
  answer: number;
  /** Everyone's guesses, public at reveal. */
  guesses: Record<PlayerId, number>;
  /** Answerers ordered by |guess − answer| ascending (roster order inside ties). */
  ranking: PlayerId[];
  /** Round points actually added per player (rank + exact bonus, × multiplier). */
  pointsEarned: Record<PlayerId, number>;
  /** "Pile !" exact hits. */
  exact: PlayerId[];
  /** 1 normally; finalRoundMultiplier in the last round. */
  multiplier: number;
  /** bustIfOver only: players eliminated for over-bidding. */
  busted: PlayerId[];
}

export interface CrowdRoundResult {
  kind: 'crowd-target';
  itemId: string;
  targetYesPct: number;
  /** Display-order card index per picker, public at reveal. */
  picks: Record<PlayerId, number>;
  /** Card indexes at the minimum distance (ties all count as closest). */
  winningCards: number[];
  /** Card indexes at the second-smallest DISTINCT distance. */
  secondCards: number[];
  /** True when the winning distance ≤ bullseyeWindowPct. */
  bullseye: boolean;
  pointsEarned: Record<PlayerId, number>;
}

export type InputGuessRoundResult = ClosestRoundResult | CrowdRoundResult;

export interface InputGuessState {
  config: InputGuessConfig;
  players: PlayerId[];
  connected: Presence;
  /**
   * Seed-shuffled pool. crowd-target items additionally carry per-round
   * seed-shuffled completion display order (fixed at init, identical for all
   * viewers). Items past totalRounds are never reached.
   */
  items: InputGuessItem[];
  round: number;
  phase: InputGuessPhase;
  /**
   * HIDDEN buffer — never exposed through view() pre-reveal beyond
   * hasSubmitted + owner echo. closest-number: the guessed integer;
   * crowd-target: the picked card index (display order).
   */
  submissions: Record<PlayerId, number>;
  scores: Record<PlayerId, number>;
  lastResult: InputGuessRoundResult | null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type InputGuessAction =
  | { kind: 'guess'; value: number }
  | { kind: 'pick'; cardIndex: number };

// ---------------------------------------------------------------------------
// Views (per-viewer projections — all player-visible strings bilingual)
// ---------------------------------------------------------------------------

interface RoundViewBase {
  round: number;
  totalRounds: number;
  scores: Record<PlayerId, number>;
}

/** Card as shown during pick: NO crowdYesPct. */
export interface CrowdCardPublic {
  id: string;
  text: LText;
}

/** Card as shown at reveal: percentage + distance to target. */
export interface CrowdCardRevealed {
  id: string;
  text: LText;
  crowdYesPct: number;
  distance: number;
}

export type InputGuessView =
  | (RoundViewBase & {
      phase: 'guess';
      mode: 'closest-number';
      question: LText;
      unit: LText | null;
      format: 'plain' | 'year';
      scale: 'linear' | 'log';
      maxInputDigits: number;
      finalRound: boolean;
      hasSubmitted: Record<PlayerId, boolean>;
      mySubmission: number | null;
    })
  | (RoundViewBase & {
      phase: 'guess';
      mode: 'crowd-target';
      stem: LText;
      askKind: 'didYou' | 'agree' | 'wouldYou';
      targetYesPct: number;
      cards: CrowdCardPublic[];
      hasSubmitted: Record<PlayerId, boolean>;
      mySubmission: number | null;
    })
  | (RoundViewBase & {
      phase: 'reveal';
      mode: 'closest-number';
      question: LText;
      unit: LText | null;
      format: 'plain' | 'year';
      scale: 'linear' | 'log';
      funFact: LText;
      result: ClosestRoundResult;
    })
  | (RoundViewBase & {
      phase: 'reveal';
      mode: 'crowd-target';
      stem: LText;
      askKind: 'didYou' | 'agree' | 'wouldYou';
      targetYesPct: number;
      cards: CrowdCardRevealed[];
      result: CrowdRoundResult;
    })
  | {
      phase: 'over';
      mode: InputGuessMode;
      scores: Record<PlayerId, number>;
    };
