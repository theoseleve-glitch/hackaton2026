import type { PlayerId } from '@bloop/engine';
import type { LeaderboardEntry, Presence, SideBetBuffer, StreakBonusOpts } from '@bloop/kit';

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

/**
 * P1 tie-relief. `none` (default) keeps the shipped behaviour: a perfect split
 * (`majority === null`) scores nobody. `all-plus-one` is an OPT-IN consolation
 * for starved small even rooms — on a perfect split EVERY player who balloted is
 * awarded `pointsCorrect`, so the PERFECT SPLIT banner becomes a *good* outcome
 * instead of a dead scoreboard. Identity-by-default: existing "a tie awards
 * nothing" tests stay green under `none`.
 */
export type TiePolicy = 'none' | 'all-plus-one';

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
  /**
   * CC-1 KEYSTONE — flavour bonus paid at reveal to a player whose hidden
   * majority-PREDICTION side-bet matched the room's actual majority. 0 disables
   * the prediction channel entirely (the `predict` action is then rejected and
   * no prediction view fields are emitted). Only meaningful under
   * predict-majority; majority-herd keeps it 0.
   */
  predictionBonus: number;
  /**
   * P1 tie-relief (CC — small-room starvation). Default `none`. Opt-in
   * `all-plus-one` consoles a perfect split. Identity-by-default so the existing
   * tie tests stay green.
   */
  tiePolicy?: TiePolicy;
  /**
   * P1 CC-2 streak bonus opts (DEFAULT IDENTITY — omitted/`{}` => +0). The
   * per-player `streak` counter is ALWAYS tracked and surfaced as a TAG
   * ("🔥 x3") regardless; this only adds optional flavour POINTS for landing on
   * the majority repeatedly. Omitting it (both shipped configs) leaves every
   * exact-score test byte-identical — the tag, not the points, is the retention
   * surface (see kit/comeback.ts).
   */
  streakBonus?: StreakBonusOpts;
}

export const TU_PREFERES_CONFIG: OptionVoteConfig = {
  scoring: 'predict-majority',
  totalRounds: 8,
  chooseMs: 15_000,
  revealMs: 9_000,
  debateMs: 0,
  debateSkipThreshold: 0.5,
  pointsCorrect: 1,
  // The flagship "tu connais pas tes potes" bonus — a correct hidden
  // majority-prediction pays +1, exposed by name at the reveal.
  predictionBonus: 1,
};

export const GAUCHE_DROITE_CONFIG: OptionVoteConfig = {
  scoring: 'majority-herd',
  totalRounds: 7,
  chooseMs: 15_000,
  revealMs: 8_000,
  debateMs: 25_000,
  debateSkipThreshold: 0.5,
  pointsCorrect: 1,
  // majority-herd has no prediction channel — the herd vote IS the read.
  predictionBonus: 0,
};

// Coupable ou Innocent ? — same majority-herd room-reading shape as gauche-ou-droite
// (vote a side, the majority scores, debate the verdict). Identical timings: a
// social verdict with a debate beat wants the same 15s vote / 8s reveal / 25s argue.
export const COURTROOM_CONFIG: OptionVoteConfig = {
  scoring: 'majority-herd',
  totalRounds: 7,
  chooseMs: 15_000,
  revealMs: 8_000,
  debateMs: 25_000,
  debateSkipThreshold: 0.5,
  pointsCorrect: 1,
  // majority-herd: the herd vote IS the read — no prediction channel.
  predictionBonus: 0,
};

// Red Flag ou Green Flag ? — same majority-herd room-reading shape; debate ON.
// Same timings as its siblings (the dating-debate loop is identical in cadence).
export const RED_GREEN_FLAG_CONFIG: OptionVoteConfig = {
  scoring: 'majority-herd',
  totalRounds: 7,
  chooseMs: 15_000,
  revealMs: 8_000,
  debateMs: 25_000,
  debateSkipThreshold: 0.5,
  pointsCorrect: 1,
  // majority-herd: the herd vote IS the read — no prediction channel.
  predictionBonus: 0,
};

export type Option = 'A' | 'B';

export type OptionVotePhase = 'choose' | 'reveal' | 'debate' | 'over';

export interface Ballot {
  pick: Option;
  /** Present iff scoring is predict-majority. */
  predict?: Option;
}

/**
 * One named, post-hoc prediction call, exposed at reveal/over (predict-majority
 * only). `predicted` is the option this player bet the room would pick;
 * `correct` is `predicted === majority` (always false on a tie). Drives the
 * "{name} thought the room would go {predicted} — it went {majority}" dunk.
 */
export interface PredictionReveal {
  playerId: PlayerId;
  predicted: Option;
  correct: boolean;
}

/**
 * P1 CC-2 — a player's live consecutive-success streak, promoted to the public
 * reveal so the client can render the "🔥 x3" tag and any bonus animation. Only
 * players whose streak is >= 1 after this round appear. `bonus` is the flavour
 * points the streak just paid (0 under the default identity opts). Drives the
 * "on fire" tag + "one more for the bonus" one-more-round pull.
 */
export interface StreakTag {
  playerId: PlayerId;
  streak: number;
  bonus: number;
}

/** Promoted from the hidden buffers at resolve — public from reveal on. */
export interface RoundResult {
  itemId: string;
  counts: { A: number; B: number };
  /** null = perfect tie (incl. the zero-ballots degenerate case). */
  majority: Option | null;
  picks: Record<PlayerId, Option>;
  /** Who scored this round (correct predictors / majority voters + prediction-bonus winners). */
  awarded: PlayerId[];
  /**
   * CC-1 KEYSTONE — the hidden majority-PREDICTIONS, promoted from the redacted
   * side-bet buffer and made PUBLIC (with player names) ONLY here at reveal/over.
   * Empty under majority-herd / when predictionBonus is 0. Each entry's `correct`
   * flag and the matching `awarded` id power the reveal taunt + bonus animation.
   */
  predictions: PredictionReveal[];
  /**
   * P1 CC-2 — public streak TAGS for every player currently on a streak (>= 1).
   * Surfaced as a tag, not a score change, by default. Stable ascending-id order.
   */
  streaks: StreakTag[];
  /**
   * P1 tie-relief — true iff this round was a perfect split AND `tiePolicy`
   * consoled every balloter (so the PERFECT SPLIT banner reads as a *win*).
   */
  tieReliefApplied: boolean;
}

/**
 * P1 CC-5 cliffhanger epilogue — derived at `over` from the ALREADY-PUBLIC final
 * scores only (no new secret). Feeds the "tout se joue maintenant" sting + the
 * rematch CTA.
 */
export interface Cliffhanger {
  /** Standings, highest first, ties broken by ascending id (kit `leaderboard`). */
  leaderboard: LeaderboardEntry[];
  /** Top1 − top2 (>= 0); 0 when fewer than two players or the top two tie. */
  topGap: number;
  /** True when the crown was contested to the wire (top-2 gap <= 1). */
  closeFinish: boolean;
  /** The sole winner, or null on a contested (tied-for-first) crown. */
  mvp: PlayerId | null;
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
  /**
   * CC-1 KEYSTONE side-bet buffer (predict-majority only). HIDDEN: a SEPARATE
   * map from `ballots` so a prediction is never an `acted` entry and can never
   * gate the primary early-resolve (allActed is over `ballots`). Pre-reveal it
   * leaks only the owner's own pick + an aggregate count (redactSideBets);
   * exposed in full, by name, only at the reveal.
   */
  predictions: SideBetBuffer<Option>;
  /** Debate skip quorum — public as a count only. */
  skips: Record<PlayerId, true>;
  scores: Record<PlayerId, number>;
  /** majority-herd: rounds spent in the minority (end-screen superlative, never affects points). */
  minorityCount: Record<PlayerId, number>;
  /**
   * P1 CC-2 — per-player consecutive-scoring streak (PUBLIC, same class as
   * `scores`). Incremented on a scoring round (correct predictor / majority
   * voter), reset to 0 on a miss. Drives the surfaced streak tag + the opt-in
   * bonus. Never carries an in-match secret.
   */
  streak: Record<PlayerId, number>;
  lastResult: RoundResult | null;
}

export type OptionVoteAction =
  | { kind: 'ballot'; pick: Option; predict?: Option }
  | { kind: 'predict'; option: Option }
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
      /**
       * CC-1 KEYSTONE (predict-majority only; null when predictionBonus is 0).
       * `myPrediction` is the OWNER's own hidden majority-call echoed back (null
       * if not yet placed); `predictedCount` is the aggregate "how many have
       * predicted" — NO other player's prediction is ever in a choose view.
       */
      myPrediction: Option | null;
      predictedCount: number;
      /** P1 CC-2 — PUBLIC per-player streak counters (same class as scores). */
      streak: Record<PlayerId, number>;
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
      /** P1 CC-2 — PUBLIC per-player streak counters (same class as scores). */
      streak: Record<PlayerId, number>;
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
      /** P1 CC-2 — PUBLIC per-player streak counters (same class as scores). */
      streak: Record<PlayerId, number>;
    }
  | {
      phase: 'over';
      scoring: OptionVoteScoring;
      scores: Record<PlayerId, number>;
      minorityCount: Record<PlayerId, number>;
      /**
       * CC-1 KEYSTONE — the FINAL round's public predictions-by-name (the last
       * reveal's call-outs persist onto the podium). Empty under majority-herd.
       */
      lastPredictions: PredictionReveal[];
      /**
       * P1 CC-5 — cliffhanger epilogue derived from the PUBLIC final scores only
       * (no new secret). Powers the "tout se joue maintenant" sting + rematch CTA.
       */
      cliffhanger: Cliffhanger;
    };
