import type { PlayerId } from '@bloop/engine';
import type { Presence } from '@bloop/kit';

/** Bilingual UI string — the client picks a locale at render time. */
export interface LText {
  fr: string;
  en: string;
}

/** Parallel per-locale taboo word lists (authored shape, carried as-is). */
export interface ForbiddenWords {
  fr: string[];
  en: string[];
}

/**
 * One runtime content item — the cleaned union of the four authored pack
 * shapes (devine-l-action card, devine-l-objet object, mime-inverse action,
 * double-le-mouvement movement prompt). `prompt` is THE secret; everything
 * optional is mode-specific dressing.
 */
export interface PerformJudgeItem {
  id: string;
  /** The secret (action / object / movement). Redacted per promptVisibility until reveal. */
  prompt: LText;
  /** Public-ish hint chip (credit category, puppet category). */
  category?: LText;
  /** Performer-only performance tip (rate mode). Secret like the prompt. */
  hint?: LText;
  /** Constraint card title — PUBLIC on every phone (guided channel label). */
  constraintLabel?: LText;
  /** Constraint one-line rule — PUBLIC (guided channel rule). */
  constraintRule?: LText;
  /** Taboo words — secret exactly like the prompt (guided taboo / puppet). */
  forbidden?: ForbiddenWords;
}

export interface PerformJudgeContent {
  items: PerformJudgeItem[];
}

/**
 * PERFORM_JUDGE — 'spotlight performs, room judges' (wave2 synthesis §3.2).
 * One reducer, four modes on three parameter axes:
 * - promptVisibility: who secretly sees the prompt ('others' = room-not-performer
 *   for guided/puppet; 'performer' for credit/rate's mover).
 * - adjudication: 'verdict' (binary vote, guided/puppet) | 'claim-validate'
 *   (performer credits a guesser, room validates; credit) | 'stars' (1–5, rate).
 * - crewSize / claim / pass-economy / point knobs: per-config scalars.
 */
export type PerformJudgeMode = 'guided' | 'credit' | 'puppet' | 'rate';
export type PromptVisibility = 'performer' | 'others';
export type Adjudication = 'verdict' | 'claim-validate' | 'stars';

export interface PerformJudgeConfig {
  mode: PerformJudgeMode;
  promptVisibility: PromptVisibility;
  adjudication: Adjudication;
  crewSize: 1 | 2;
  minPlayers: number;
  /** Laps of the rotation (totalRounds / roundsPerPlayer / laps in the designs). */
  laps: number;
  /** 0 disables the ready beat entirely (puppet goes straight to perform). */
  readyMs: number;
  performMs: number;
  judgeMs: number;
  revealMs: number;
  /** Used iff scoreboardEvery > 0. */
  scoreboardMs: number;
  /** 0 disables the scoreboard beat (puppet: 4). */
  scoreboardEvery: number;
  /** Prompts offered at turn entry (rate: 2 — the mover picks; others: 1). */
  promptChoices: number;
  passesPerPlayer: number;
  /** Verdict/claim success points for the performer (guided 10, credit 10, puppet 100). */
  successPoints: number;
  /** Per connected non-performer on success (guided helperPoints 5, puppet crewPoints 50). */
  helperPoints: number;
  /** Performer points on a pass (guided 2; credit 0). */
  passPoints: number;
  /** credit fast-claim bonus (+5 each) / puppet speed bonus (+50, success-early only). */
  fastBonusPoints: number;
  /** rate: points = round(avg × starMultiplier) to BOTH crew members. */
  starMultiplier: number;
  /** rate: unanimous 5★ with >= 2 ballots adds this to each crew member. */
  ovationBonus: number;
  /** rate: average used when zero ballots are cast. */
  noVoteDefaultStars: number;
  /** yes/cast >= threshold succeeds (ties generous). */
  verdictThreshold: number;
  /**
   * verdict modes, zero votes CAST at resolve: true = benefit of the doubt
   * (guided "réussi"); false = fail (puppet — but an EMPTY eligible set still
   * voids, never fails, per the mime-inverse design).
   */
  zeroVotesSucceed: boolean;
  /** puppet: strict tap majority during perform resolves success-early. */
  earlyMajorityResolve: boolean;
  /** puppet: show the category hint to the performer (and unknown viewers). */
  showCategoryToPerformer: boolean;
}

/** devine-l-action — PERFORM_JUDGE `guided` (design §2.9). */
export const DEVINE_L_ACTION_CONFIG: PerformJudgeConfig = {
  mode: 'guided',
  promptVisibility: 'others',
  adjudication: 'verdict',
  crewSize: 1,
  minPlayers: 3,
  laps: 2,
  readyMs: 6_000,
  performMs: 75_000,
  judgeMs: 15_000,
  revealMs: 7_000,
  scoreboardMs: 0,
  scoreboardEvery: 0,
  promptChoices: 1,
  passesPerPlayer: 1,
  successPoints: 10,
  helperPoints: 5,
  passPoints: 2,
  fastBonusPoints: 0,
  starMultiplier: 0,
  ovationBonus: 0,
  noVoteDefaultStars: 3,
  verdictThreshold: 0.5,
  zeroVotesSucceed: true,
  earlyMajorityResolve: false,
  showCategoryToPerformer: false,
};

/** devine-l-objet — PERFORM_JUDGE `credit` (design §2.15). */
export const DEVINE_L_OBJET_CONFIG: PerformJudgeConfig = {
  mode: 'credit',
  promptVisibility: 'performer',
  adjudication: 'claim-validate',
  crewSize: 1,
  minPlayers: 3,
  laps: 2,
  readyMs: 4_000,
  performMs: 45_000,
  judgeMs: 12_000,
  revealMs: 6_000,
  scoreboardMs: 0,
  scoreboardEvery: 0,
  promptChoices: 1,
  passesPerPlayer: 1,
  successPoints: 10,
  helperPoints: 0,
  passPoints: 0,
  fastBonusPoints: 5,
  starMultiplier: 0,
  ovationBonus: 0,
  noVoteDefaultStars: 3,
  verdictThreshold: 0.5,
  zeroVotesSucceed: true,
  earlyMajorityResolve: false,
  showCategoryToPerformer: true,
};

/** mime-inverse — PERFORM_JUDGE `puppet` (design §2.13). */
export const MIME_INVERSE_CONFIG: PerformJudgeConfig = {
  mode: 'puppet',
  promptVisibility: 'others',
  adjudication: 'verdict',
  crewSize: 1,
  minPlayers: 3,
  laps: 1,
  readyMs: 0,
  performMs: 30_000,
  judgeMs: 10_000,
  revealMs: 7_000,
  scoreboardMs: 6_000,
  scoreboardEvery: 4,
  promptChoices: 1,
  passesPerPlayer: 0,
  successPoints: 100,
  helperPoints: 50,
  passPoints: 0,
  fastBonusPoints: 50,
  starMultiplier: 0,
  ovationBonus: 0,
  noVoteDefaultStars: 3,
  verdictThreshold: 0.5,
  zeroVotesSucceed: false,
  earlyMajorityResolve: true,
  showCategoryToPerformer: true,
};

/** double-le-mouvement — PERFORM_JUDGE `rate`, crew of 2 (design §2.12). */
export const DOUBLE_LE_MOUVEMENT_CONFIG: PerformJudgeConfig = {
  mode: 'rate',
  promptVisibility: 'performer',
  adjudication: 'stars',
  crewSize: 2,
  minPlayers: 4,
  laps: 1,
  readyMs: 15_000,
  performMs: 30_000,
  judgeMs: 15_000,
  revealMs: 7_000,
  scoreboardMs: 0,
  scoreboardEvery: 0,
  promptChoices: 2,
  passesPerPlayer: 0,
  successPoints: 0,
  helperPoints: 0,
  passPoints: 0,
  fastBonusPoints: 0,
  starMultiplier: 20,
  ovationBonus: 25,
  noVoteDefaultStars: 3,
  verdictThreshold: 0.5,
  zeroVotesSucceed: true,
  earlyMajorityResolve: false,
  showCategoryToPerformer: false,
};

export type PerformJudgePhase = 'ready' | 'perform' | 'judge' | 'reveal' | 'scoreboard' | 'over';

/**
 * success         — réussi / validated find / verdict yes / stars resolved
 * success-early   — puppet strict tap majority during perform (+speed bonus)
 * passed          — performer burned a pass (guided +2 / credit 0)
 * fail            — timeout, give-up, verdict no (MISSED / RATÉ)
 * contested       — credit validation voted down (0/0)
 * void            — performer left mid-turn (answer still revealed, 0 pts)
 */
export type PerformJudgeOutcome = 'success' | 'success-early' | 'passed' | 'fail' | 'contested' | 'void';

/** Promoted at reveal — fully public from then on. */
export interface TurnResult {
  performer: PlayerId;
  /** rate: the dubber; credit: the credited guesser; else null. */
  partner: PlayerId | null;
  item: PerformJudgeItem | null;
  outcome: PerformJudgeOutcome;
  /** Aggregate ONLY — individual votes are never published. */
  tally: { yes: number; no: number } | null;
  stars: { avg: number; cast: number; ovation: boolean } | null;
  /** credit: claim landed in the first half of the perform timer. */
  fast: boolean;
  /** Points gained this turn (cloned plain record; only non-zero gains listed). */
  points: Record<PlayerId, number>;
}

export interface PerformJudgeState {
  config: PerformJudgeConfig;
  players: PlayerId[];
  /** Seeded permutation — spotlight order. */
  rotation: PlayerId[];
  connected: Presence;
  phase: PerformJudgePhase;
  /** Monotonic, ++ per turn entry — powers phaseKey. */
  turnSeq: number;
  seatIndex: number;
  lap: number;
  performer: PlayerId;
  /** rate crew of 2: the dubber (prompt-blind). */
  partner: PlayerId | null;
  /** HIDDEN: shuffled deck — leaks every upcoming prompt. */
  deck: PerformJudgeItem[];
  /** HIDDEN. */
  cursor: number;
  /** HIDDEN until reveal: the promptChoices items offered this turn. */
  offer: PerformJudgeItem[];
  /** HIDDEN until reveal (rate: null until the mover picks). */
  chosenIndex: number | null;
  /** event.at at perform entry — powers the deterministic fast bonus. */
  performStartedAt: number | null;
  /** credit: the performer's credit claim. */
  claim: { guesser: PlayerId; at: number } | null;
  /** puppet "Trouvé !" taps (count-only in views) / rate crew Done taps (public). */
  taps: Record<PlayerId, true>;
  /** HIDDEN per-voter verdict/validate ballots — counts only until the reveal tally. */
  votes: Record<PlayerId, 'yes' | 'no'>;
  /** HIDDEN per-rater star ballots — aggregate only, individuals never published. */
  stars: Record<PlayerId, number>;
  passesLeft: Record<PlayerId, number>;
  scores: Record<PlayerId, number>;
  /** Turns completed since the last scoreboard beat (puppet). */
  sinceScoreboard: number;
  lastResult: TurnResult | null;
}

export type PerformJudgeAction =
  | { kind: 'ready' }
  | { kind: 'pick'; index: number }
  | { kind: 'claimDone' }
  | { kind: 'giveUp' }
  | { kind: 'pass' }
  | { kind: 'claimFound'; guesser: PlayerId }
  | { kind: 'done' }
  | { kind: 'tap' }
  | { kind: 'vote'; vote: 'yes' | 'no' }
  | { kind: 'rate'; stars: number };

/** Mode-gated secret card: prompt + dressing, only for entitled viewers. */
export interface SecretCard {
  prompt: LText;
  hint: LText | null;
  category: LText | null;
  forbidden: ForbiddenWords | null;
}

/** Public constraint card (guided channel) — on EVERY phone, every phase. */
export interface ConstraintCard {
  label: LText;
  rule: LText;
}

export interface OfferView {
  index: number;
  prompt: LText;
  hint: LText | null;
}

interface ViewBase {
  mode: PerformJudgeMode;
  turnSeq: number;
  lap: number;
  laps: number;
  performer: PlayerId;
  partner: PlayerId | null;
  rotation: PlayerId[];
  connected: Record<PlayerId, boolean>;
  scores: Record<PlayerId, number>;
  passesLeft: Record<PlayerId, number>;
}

export type PerformJudgeView =
  | (ViewBase & {
      phase: 'ready';
      constraint: ConstraintCard | null;
      /** guided: helpers see the secret during ready; credit/rate: null here. */
      secret: SecretCard | null;
      /** rate: the mover's 2-prompt offer. Null for everyone else. */
      offers: OfferView[] | null;
      /** guided performer can end the ready beat early. */
      canReady: boolean;
    })
  | (ViewBase & {
      phase: 'perform';
      constraint: ConstraintCard | null;
      secret: SecretCard | null;
      /** Public hint chip (credit category to all; puppet category per config). */
      categoryHint: LText | null;
      /** puppet: "Trouvé !" count + strict-majority goal. */
      tapCount: number;
      tapGoal: number;
      myTapped: boolean;
      /** rate: crew Done flags (public booleans). */
      crewDone: Record<PlayerId, boolean> | null;
      myDone: boolean;
      canClaimDone: boolean;
      canGiveUp: boolean;
      canPass: boolean;
      /** credit performer: tappable roster (connected minus self). */
      claimTargets: PlayerId[] | null;
    })
  | (ViewBase & {
      phase: 'judge';
      judgeKind: Adjudication;
      constraint: ConstraintCard | null;
      /** guided/puppet: judges still see the secret while voting. */
      secret: SecretCard | null;
      /** credit validate: the object is on the table — public to ALL. */
      publicItem: { prompt: LText; category: LText | null } | null;
      claimedGuesser: PlayerId | null;
      categoryHint: LText | null;
      votesIn: number;
      votersExpected: number;
      youCanVote: boolean;
      myVote: 'yes' | 'no' | null;
      myStars: number | null;
    })
  | (ViewBase & { phase: 'reveal'; result: TurnResult })
  | (ViewBase & { phase: 'scoreboard' })
  | { phase: 'over'; mode: PerformJudgeMode; scores: Record<PlayerId, number> };
