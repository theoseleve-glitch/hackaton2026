import type { PlayerId } from '@bloop/engine';
import type { LeaderboardEntry, Presence, StreakBonusOpts } from '@bloop/kit';

/** Bilingual UI string — the client picks a locale at render time. */
export interface LText {
  fr: string;
  en: string;
}

// ---------------------------------------------------------------------------
// Content (runtime ContentPack data — a cleaned mapping of the authored pack)
// ---------------------------------------------------------------------------

/**
 * One ranking prompt card. The prompt is "Du plus {most} au moins {least}" /
 * "Most {most} to least {least}" ABOUT THE PLAYERS IN THE ROOM — `most`/`least`
 * are the two superlative poles. `text` is the fully-composed bilingual prompt
 * (so the client can render either the composed line or the poles). `spicy`
 * follows the platform tier convention (0 = clean-hands floor, filterable so
 * `spicy > 0` can be gated). Authoring-only fields (tags) are carried for
 * catalog filtering; nothing here is a value-secret (prompts are public from
 * `rank` on).
 */
export interface RankingPrompt {
  id: string;
  /** Fully composed bilingual line ("Du plus … au moins …"). Public from rank on. */
  text: LText;
  /** The "most ___" pole (e.g. "susceptible de survivre à l'apocalypse"). */
  most: LText;
  /** The "least ___" pole — the same axis, opposite end. */
  least: LText;
  /** Platform spicy tier. 0 = clean floor; >0 is gate-filterable. */
  spicy: number;
  tags?: string[];
}

export interface RankingContent {
  prompts: RankingPrompt[];
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface RankingConfig {
  totalRounds: number;
  /** rank phase duration — a full ordering takes longer than a single vote. */
  rankMs: number;
  /** reveal phase duration — aggregate + scores + every ballot shown at once. */
  revealMs: number;
  /**
   * Points awarded to the player(s) whose ordering is CLOSEST to the room's
   * aggregate verdict (rank band 0). Subsequent bands earn `pointsByBand[i]`.
   * A player not in a band earns 0. The bands reward "reading the room".
   */
  pointsByBand: number[];
  /**
   * P1 CC-2 streak bonus opts (DEFAULT IDENTITY — omitted/`{}` => +0). The
   * per-player `streak` counter (consecutive top-band finishes) is ALWAYS
   * tracked + surfaced; this only adds optional flavour POINTS. Omitting it
   * leaves every exact-score test byte-identical.
   */
  streakBonus?: StreakBonusOpts;
  /**
   * P1 CC-5 close-finish threshold for the epilogue cliffhanger (top-2 gap).
   * Omitted => no closeFinish flag.
   */
  closeFinishThreshold?: number;
}

/**
 * LE CLASSEMENT — the flagship "rank the room" config. ~6 prompts, a 40s rank
 * window, a single 12s reveal of the room's verdict + everyone's ballot, and a
 * closeness scoring band of 3/2/1 (closest reader of the room wins most).
 */
export const LE_CLASSEMENT_CONFIG: RankingConfig = {
  totalRounds: 6,
  rankMs: 40_000,
  revealMs: 12_000,
  // Reading the room pays: the closest ordering(s) to the aggregate score 3,
  // the next band 2, the next 1; everyone below the third band scores 0.
  pointsByBand: [3, 2, 1],
  closeFinishThreshold: 3,
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type RankingPhase = 'rank' | 'reveal' | 'over';

/**
 * A single player's submitted FULL ORDERING of the roster, most -> least.
 * A valid ballot is a PERMUTATION of `state.players` (every roster id exactly
 * once, including the submitter — you place yourself too). HIDDEN until reveal.
 */
export type Ballot = PlayerId[];

/**
 * One player's closeness result, promoted from the hidden buffer at reveal.
 * `distance` is the inverted-Spearman foot-rule distance between their ballot
 * and the aggregate (sum over targets of |posInBallot − posInAggregate|);
 * `band` is their 0-based closeness band (0 = closest); `points` is what the
 * band paid (incl. any streak bonus). Public from reveal on.
 */
export interface CloseResult {
  playerId: PlayerId;
  distance: number;
  band: number;
  points: number;
}

/**
 * Promoted from the hidden ballot buffer at the atomic reveal — PUBLIC from
 * reveal on. Carries the room's verdict + every player's now-public ordering +
 * the closeness scoring breakdown. Nothing here exists during `rank`.
 */
export interface RoundResult {
  promptId: string;
  /**
   * THE ROOM'S VERDICT: the aggregate ordering of the roster, most -> least,
   * by Borda count (sum of positions; seeded tie-break). The drama line
   * ("the room ranked YOU last") reads off the tail of this list.
   */
  aggregate: PlayerId[];
  /** Per-target Borda points behind the aggregate (higher = ranked-higher by the room). */
  bordaPoints: Record<PlayerId, number>;
  /** EVERY player's now-public full ordering (the hidden buffer, revealed). */
  ballots: Record<PlayerId, Ballot>;
  /** Per-player closeness-to-aggregate scoring, stable ascending-id order. */
  closeness: CloseResult[];
  /** Points each player earned THIS round (closeness band + streak bonus). */
  pointsEarned: Record<PlayerId, number>;
  /** Who landed the top closeness band this round (drives the streak). */
  bestReaders: PlayerId[];
}

/**
 * P1 CC-5 cliffhanger epilogue — derived at `over` from the ALREADY-PUBLIC
 * final scores only (no new secret). Feeds the rematch CTA + closing sting.
 */
export interface Epilogue {
  /** Standings, highest first, ties broken by ascending id (kit `leaderboard`). */
  leaderboard: LeaderboardEntry[];
  /** The sole winner ("best reader of the room"), or null on a contested crown. */
  mvp: PlayerId | null;
  /** Top1 − top2 (>= 0). */
  topGap: number;
  /** True when the crown was contested to the wire. */
  closeFinish: boolean;
  /** Players whose best consecutive top-band streak == the match max (>= 2). */
  onFire: PlayerId[];
}

export interface RankingState {
  config: RankingConfig;
  players: PlayerId[];
  connected: Presence;
  /** Seed-shuffled prompts, indexed by round. */
  prompts: RankingPrompt[];
  round: number;
  phase: RankingPhase;
  /** Seed captured at init — drives the deterministic Borda tie-break. */
  seed: string;
  /**
   * HIDDEN: never exposed through view() during `rank` beyond `hasSubmitted` +
   * the owner's own echo. Player-keyed null-proto map; `ballots[p]` is p's
   * submitted full ordering. Promoted into the reveal result atomically.
   */
  ballots: Record<PlayerId, Ballot>;
  scores: Record<PlayerId, number>;
  /**
   * P1 CC-2 — per-player consecutive top-closeness-band streak (PUBLIC, same
   * class as scores). Incremented when a player lands the top band, reset to 0
   * otherwise. Drives the surfaced streak tag + opt-in bonus.
   */
  streak: Record<PlayerId, number>;
  /** P1 CC-5 — best streak each player ever reached (public end-of-match stat). */
  bestStreak: Record<PlayerId, number>;
  lastResult: RoundResult | null;
}

// ---------------------------------------------------------------------------
// Action / View
// ---------------------------------------------------------------------------

/**
 * A player submits ONE complete ordered ballot at a time (atomic; no per-slot
 * streaming). `order` must be a permutation of the roster, most -> least.
 * Re-submitting a valid ballot overwrites the prior one. Semantic validity
 * (permutation / correct roster) is enforced in reduce(), not the schema.
 */
export type RankingAction = { kind: 'rank'; order: PlayerId[] };

export type RankingView =
  | {
      phase: 'rank';
      round: number;
      totalRounds: number;
      prompt: RankingPrompt | null;
      /** The roster you order, most -> least (stable; the full table incl. self). */
      roster: PlayerId[];
      /** Public "is this player done?" — NEVER their ballot. */
      hasSubmitted: Record<PlayerId, boolean>;
      /** OWNER-ONLY echo of the viewer's own submitted ordering, else null. */
      myOrder: Ballot | null;
      scores: Record<PlayerId, number>;
      /** P1 CC-2 — PUBLIC per-player streak counters (same class as scores). */
      streak: Record<PlayerId, number>;
    }
  | {
      phase: 'reveal';
      round: number;
      totalRounds: number;
      prompt: RankingPrompt | null;
      /** The hidden buffer, promoted: verdict + all ballots + closeness scores. */
      result: RoundResult;
      scores: Record<PlayerId, number>;
      /** P1 CC-2 — PUBLIC per-player streak counters (same class as scores). */
      streak: Record<PlayerId, number>;
    }
  | {
      phase: 'over';
      scores: Record<PlayerId, number>;
      /** P1 CC-5 — cliffhanger epilogue derived from the PUBLIC final scores. */
      epilogue: Epilogue;
    };
