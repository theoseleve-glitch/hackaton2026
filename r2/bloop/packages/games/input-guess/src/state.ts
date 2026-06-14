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
  /**
   * CC-2 "on fire" streak bonus — flavour points added per consecutive top-2
   * finish (closest-number: a rank-0/1 finish; crowd-target: a winning-card
   * pick). DEFAULTS TO 0 (identity): with the bonus unset the scoring is
   * byte-identical to the pre-streak template, so every existing exact-score
   * test stays green. The retention work is done by the client "🔥 En feu"
   * TAG (always surfaced via the public `streak`), NOT the points — keep this
   * small. Pure: fed to the kit `streakBonus(streak, { perStreak, cap })`.
   */
  streakBonus?: number;
  /**
   * Cap on the streak length that earns `streakBonus`, so a runaway streak
   * can't snowball the lead. Undefined => uncapped (still capped in practice
   * by `totalRounds`). Clamped to >= 0 by the kit helper.
   */
  streakCap?: number;
  /**
   * CC-5 — top-2 score gap (inclusive) at/below which the 'over' epilogue flags
   * `closeFinish` for the cliffhanger rematch chrome. Undefined/negative => the
   * flag is never set (default-safe). Pure display derivation; no scoring effect.
   */
  closeFinishThreshold?: number;
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
  // CC-2 streak bonus stays UNSET => identity (0): scoring is byte-identical to
  // the pre-streak template. The "🔥 En feu" tag (public `streak`) does the
  // retention work; the bonus is opt-in per the brief's A/B-the-size mitigation.
  // CC-5: a ≤ one-rank (100-pt) finish reads as "close" for the cliffhanger CTA.
  closeFinishThreshold: 100,
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
  // CC-2 streak bonus UNSET => identity (0): existing exact-score tests stay
  // byte-identical. CC-5: a ≤ one-pick (3-pt) gap reads as a "close" finish.
  closeFinishThreshold: 3,
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Internal phase. phaseKey renders the collect phase as 'guess' (closest-number) or 'pick' (crowd-target). */
export type InputGuessPhase = 'guess' | 'reveal' | 'over';

/**
 * Named reveal call-outs derived PURELY from already-public reveal data
 * (guesses/answer/picks) via the kit epilogue helpers — NO new secret, no RNG,
 * no clock. The client renders these as the "TOI t'as guessé ça ?!" beat.
 * Each list is in stable ascending-playerId order; empty when nobody qualifies.
 */
export interface ClosestCallOuts {
  /** « Pile ! » — exact-hit players (mirrors `exact`, surfaced for the call-out layer). */
  pile: PlayerId[];
  /** Closest guess(es) — the rank-0 winner(s) by |guess − answer| (ties all listed). */
  closest: PlayerId[];
  /** Biggest whiff — the answerer(s) with the MAX |guess − answer| (busted excluded). */
  wildest: PlayerId[];
}

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
  /** Named call-outs derived from the public guesses/answer (reveal-only social fuel). */
  callOuts: ClosestCallOuts;
  /**
   * CC-2 — per-player consecutive top-2-finish count AFTER this round
   * (0 = streak broken/none). Public from reveal on (no secret); drives the
   * client "🔥 En feu" streak tag. A value >= 2 is "on fire".
   */
  streak: Record<PlayerId, number>;
}

/**
 * Named reveal call-outs for crowd-target, derived PURELY from already-public
 * reveal data (picks + winning/worst card indexes) — NO new secret. Stable
 * ascending-playerId order; empty when nobody qualifies.
 */
export interface CrowdCallOuts {
  /** Lone-genius — the SOLE picker of a winning (closest) card; empty if 0 or ≥2 pickers hit it. */
  loneGenius: PlayerId[];
  /** Most-fooled — picker(s) of the farthest-from-target card that anyone actually picked. */
  mostFooled: PlayerId[];
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
  /** Named call-outs derived from the public picks/distances (reveal-only social fuel). */
  callOuts: CrowdCallOuts;
  /**
   * CC-2 — per-player consecutive top-2-finish count AFTER this round (a
   * winning-card pick continues the streak; anything else resets to 0). Public
   * from reveal on; drives the client "🔥 En feu" streak tag.
   */
  streak: Record<PlayerId, number>;
}

export type InputGuessRoundResult = ClosestRoundResult | CrowdRoundResult;

// ---------------------------------------------------------------------------
// CC-5 — 'over' epilogue (derived at game-over from ALREADY-PUBLIC state)
// ---------------------------------------------------------------------------

/**
 * Per-player match stats accumulated PURELY from already-public round results
 * (guesses/answer/picks/distances surfaced at each reveal) — NO new in-match
 * secret. Carried in public state and surfaced every reveal; the 'over'
 * epilogue is folded from this map plus the public `scores`.
 */
export interface PlayerMatchStats {
  /** Rounds the player actually answered/picked (denominator for whiff fairness). */
  rounds: number;
  /** Exact hits (closest: |guess−answer|===0 "Pile !"; crowd: picked-card distance 0). */
  exactCount: number;
  /** Σ of this player's per-round distance (lower = sharper overall). */
  totalDistance: number;
  /** Largest single-round distance (the biggest whiff). */
  worstDistance: number;
  /** Longest "on fire" streak reached at any point in the match. */
  bestStreak: number;
}

/**
 * CC-5 epilogue — derived at 'over' from PUBLIC state only (scores + the public
 * `stats` map), NO new secret, NO RNG, NO clock. Stable ascending-id order
 * inside every list (via the kit `leaderboard`/`statLeaders`/`superlativeWinners`
 * helpers), so it is replay-identical. Feeds the session-shell roast + rematch CTA.
 */
export interface OverEpilogue {
  /** Sole top-scorer, or null on a contested crown (tie for first). */
  mvp: PlayerId | null;
  /** True when the top-2 score gap is within the close-finish threshold. */
  closeFinish: boolean;
  /** Top-2 score gap (0 when <2 players or a tie for first). */
  topGap: number;
  /** Most exact hits ("Pile !" / bullseye-0). Empty when nobody hit one. */
  mostExact: PlayerId[];
  /** Sharpest overall — the SMALLEST total distance among players who played. Empty when nobody played. */
  closestOverall: PlayerId[];
  /** Biggest single-round whiff — the LARGEST distance anyone posted. Empty when nobody played. */
  biggestWhiff: PlayerId[];
  /** Longest "on fire" streak of the match (>= 2 to qualify). Empty when nobody got on fire. */
  onFire: PlayerId[];
}

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
  /**
   * PUBLIC append-only lock order for the live submission ticker: the players
   * who have locked in this round, in the order they FIRST submitted. Carries
   * NO value — only identity + order, already implied by the public
   * `hasSubmitted` map. Reset (to []) at every new guess phase alongside
   * `submissions`. Drives the "4/6 verrouillés… Léa first, you're last" beat.
   */
  submitOrder: PlayerId[];
  scores: Record<PlayerId, number>;
  /**
   * CC-2 — PUBLIC per-player consecutive top-2-finish counter, carried across
   * rounds. Updated at every resolve (a top-2 finish increments, anything else
   * resets to 0) via the kit `nextStreak`. Surfaced in the reveal result;
   * NO secret (it's derived from the already-public per-round outcome).
   */
  streak: Record<PlayerId, number>;
  /**
   * CC-5 — PUBLIC per-player match-stats accumulator, folded purely from each
   * round's already-public result. The 'over' epilogue is derived from this +
   * `scores` at game-over; carrying it in state keeps the derivation O(1) and
   * adds NO new secret (every field is already visible at the round it updates).
   */
  stats: Record<PlayerId, PlayerMatchStats>;
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
      /** Live ticker: how many players have locked in (aggregate, no value). */
      submittedCount: number;
      /** Live ticker: who locked in, in first-submission order (identity only). */
      lockOrder: PlayerId[];
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
      /** Live ticker: how many players have locked in (aggregate, no value). */
      submittedCount: number;
      /** Live ticker: who locked in, in first-submission order (identity only). */
      lockOrder: PlayerId[];
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
      /** CC-5 superlatives, derived at 'over' from public scores + stats only. */
      epilogue: OverEpilogue;
      /** Per-player public match stats (the epilogue's evidence; client roast fuel). */
      stats: Record<PlayerId, PlayerMatchStats>;
    };
