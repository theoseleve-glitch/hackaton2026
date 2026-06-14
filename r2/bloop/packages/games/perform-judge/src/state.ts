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
  /**
   * CC-2 — "Money Round" final-lap multiplier. The awarded points map is scaled
   * by this on the FINAL lap only (via the kit `roundMultiplier`, which returns
   * identity off the final lap). DEFAULT 1 = OFF (single-lap puppet/rate are
   * unaffected — final lap == only lap, ×1 — and every existing exact-score test
   * runs on lap 0 of a multi-lap config, so it stays byte-identical at ×1). The
   * 2-lap guided/credit set this to 1.5 so a trailing seat stays mathematically
   * alive into the finale (risk register #5: re-baseline only the cases that
   * intentionally land on the final lap).
   */
  finalLapMultiplier: number;
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
  performMs: 55_000,
  judgeMs: 12_000,
  revealMs: 8_000,
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
  finalLapMultiplier: 1.5, // Money Round: 2-lap match, final lap scores ×1.5
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
  revealMs: 8_000,
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
  finalLapMultiplier: 1.5, // Money Round: 2-lap match, final lap scores ×1.5
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
  revealMs: 8_000,
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
  finalLapMultiplier: 1, // single lap (laps:1): final lap == only lap, ×1 = off
};

/** double-le-mouvement — PERFORM_JUDGE `rate`, crew of 2 (design §2.12). */
export const DOUBLE_LE_MOUVEMENT_CONFIG: PerformJudgeConfig = {
  mode: 'rate',
  promptVisibility: 'performer',
  adjudication: 'stars',
  crewSize: 2,
  minPlayers: 4,
  laps: 1,
  readyMs: 8_000,
  performMs: 30_000,
  judgeMs: 12_000,
  revealMs: 8_000,
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
  finalLapMultiplier: 1, // single lap (laps:1): final lap == only lap, ×1 = off
};

/**
 * CC-4 — audience live-reaction enum (fixed, zero free text → zero moderation
 * surface). NON-SCORING: a react never resolves/scores a turn, unlike a puppet
 * `tap`. One react per audience member per turn (first locks); public per-enum
 * counts; owner-only echo for "what did I react"; cleared at phase exit.
 */
export type Reaction = 'fire' | 'laugh' | 'cringe';
export const REACTIONS: readonly Reaction[] = ['fire', 'laugh', 'cringe'];

/** Public per-enum reaction tally — leaks no individual ballot. */
export interface ReactionCounts {
  fire: number;
  laugh: number;
  cringe: number;
}

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

/**
 * P1-2 — post-reveal social-fuel stamp, derived from the AGGREGATE tally/stars
 * ONLY (never a per-voter ballot — anonymity invariant locked, keepAsIs §4):
 * - 'nailbiter' — a verdict/validate within ONE vote of flipping
 *   (`abs(yes-no) <= 1`, at least one ballot cast). "the room nearly let it slide".
 * - 'split'     — a polarised star table (`max - min >= 3` with >= 2 ballots).
 *   Min/max of an ANONYMOUS multiset leaks no individual ballot.
 */
export type PerformJudgeDrama = 'nailbiter' | 'split' | null;

/** Promoted at reveal — fully public from then on. */
export interface TurnResult {
  performer: PlayerId;
  /** rate: the dubber; credit: the credited guesser; else null. */
  partner: PlayerId | null;
  item: PerformJudgeItem | null;
  outcome: PerformJudgeOutcome;
  /** Aggregate ONLY — individual votes are never published. */
  tally: { yes: number; no: number } | null;
  /** Aggregate ONLY — min/max of an anonymous multiset, never a per-rater value. */
  stars: { avg: number; cast: number; ovation: boolean; min: number; max: number } | null;
  /** credit: claim landed in the first half of the perform timer. */
  fast: boolean;
  /**
   * Whether the Money Round (final-lap CC-2 multiplier) applied to this turn's
   * points — lets the reveal card scream "DOUBLE POINTS". Public flag, no secret.
   */
  moneyRound: boolean;
  /** P1-2 aggregate-only near-miss/split stamp (no per-voter ballot). */
  drama: PerformJudgeDrama;
  /** Points gained this turn (cloned plain record; only non-zero gains listed). */
  points: Record<PlayerId, number>;
  /**
   * CC-4 PUBLIC audience reaction tally accumulated during perform — rides into
   * the reveal card ("the room reacted 11×"). Aggregate counts only; no ballot.
   */
  reactions: ReactionCounts;
}

/**
 * CC-5 — end-of-match epilogue cards, derived at 'over' PURELY from ALREADY-PUBLIC
 * state (final `scores` + the running, per-turn-public `reactionTotals` /
 * `nailbiterCount` tallies) via the kit epilogue helpers. NO new in-match secret,
 * no RNG, no clock; every list is stable ascending-playerId order. Respects the
 * anonymity lock — nothing here names an individual ballot.
 */
export interface Epilogue {
  /** Best performer = the sole top scorer, or null on a tied/empty crown. */
  bestPerformer: PlayerId | null;
  /** Crowd favourite(s) = performer(s) who drew the most audience reactions. */
  crowdFavourite: PlayerId[];
  /** Total reactions each performer drew across the match (public running tally). */
  reactionTotals: Record<PlayerId, number>;
  /** Cliffhanger flag: the top-2 gap is within the closeFinish threshold. */
  closeFinish: boolean;
  /** Top score minus runner-up (0 when < 2 players or a tie at the top). */
  topGap: number;
  /** How many turns were nailbiters this match (aggregate drama stat). */
  nailbiters: number;
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
  /**
   * CC-4 HIDDEN per-audience-member reaction buffer (own-echo + public counts;
   * never another player's value pre-reveal). NON-SCORING and a SEPARATE field
   * from `taps`/`votes` so it can never gate the primary early-resolve. Cleared
   * at every turn entry (advanceTurn) — fresh per perform beat.
   */
  reactions: Record<PlayerId, Reaction>;
  /** HIDDEN per-voter verdict/validate ballots — counts only until the reveal tally. */
  votes: Record<PlayerId, 'yes' | 'no'>;
  /** HIDDEN per-rater star ballots — aggregate only, individuals never published. */
  stars: Record<PlayerId, number>;
  passesLeft: Record<PlayerId, number>;
  scores: Record<PlayerId, number>;
  /** Turns completed since the last scoreboard beat (puppet). */
  sinceScoreboard: number;
  lastResult: TurnResult | null;
  /**
   * CC-5 running PUBLIC tally: total audience reactions each PERFORMER drew over
   * the match (summed at each reveal from the already-public per-turn counts).
   * Drives the 'crowd favourite' epilogue card — no new secret, just an
   * accumulation of data that was public every turn.
   */
  reactionTotals: Record<PlayerId, number>;
  /** CC-5 running count of nailbiter turns (aggregate drama stat). */
  nailbiterCount: number;
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
  | { kind: 'react'; reaction: Reaction }
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
  /**
   * CC-2 Money Round flag — true on the final lap when the multiplier is armed
   * (> 1). Lets every in-turn card (ready/perform/judge/reveal) scream "DOUBLE
   * POINTS". Pure projection of lap/laps/config; no secret.
   */
  isFinalLap: boolean;
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
      /** CC-4 PUBLIC per-enum audience reaction counts (no individual ballot). */
      reactionCounts: ReactionCounts;
      /** CC-4 owner-only echo: this viewer's own reaction, or null. */
      myReaction: Reaction | null;
      /** CC-4 may this viewer react now (connected non-actor, hasn't yet)? */
      canReact: boolean;
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
  | {
      phase: 'over';
      mode: PerformJudgeMode;
      scores: Record<PlayerId, number>;
      /** CC-5 epilogue cards, derived from already-public state at 'over'. */
      epilogue: Epilogue;
    };
