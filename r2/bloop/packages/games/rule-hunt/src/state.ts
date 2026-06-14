import type { PlayerId } from '@bloop/engine';
import type { Presence } from '@bloop/kit';

/** Bilingual UI string — the client picks a locale at render time. */
export interface LText {
  fr: string;
  en: string;
}

export type RuleCategory = 'gesture' | 'verbal' | 'social';
export type RuleDifficulty = 'easy' | 'medium' | 'hard';

/**
 * One content item — a cleaned mapping of the authored
 * content/packs/trouvez-la-regle.json shape (spicy items are filtered out by
 * the pack build; decoys are capped at candidateCount-1 at runtime).
 */
export interface RuleItem {
  id: string;
  category: RuleCategory;
  difficulty: RuleDifficulty;
  /** The secret rule — followers-private until reveal. */
  rule: LText;
  /** Plausible same-category alternates; the guess grid = shuffle([rule, ...decoys]). */
  decoys: LText[];
}

export interface RuleHuntContent {
  items: RuleItem[];
}

export type DetectiveCount = 'auto' | 1 | 2;

export interface RuleHuntConfig {
  totalRounds: number;
  briefingMs: number;
  /** The round's master free-play clock — banked across interrupts. */
  liveMs: number;
  /**
   * Heat-check cadence: max live time between forced spotlight micro-beats. The
   * `live` deadline is armed at `min(liveRemainingMs, heatMs)`; on that deadline
   * (with bank + quorum remaining) the round enters a `spotlight`, banking the
   * live clock exactly like an accusation so no live time is ever lost.
   */
  heatMs: number;
  /** Length of one forced spotlight micro-beat (name a follower; everyone flags/clean). */
  spotlightMs: number;
  tribunalMs: number;
  guessMs: number;
  revealMs: number;
  /** 'auto' = 1 detective for 4-7 players, 2 for 8-16. */
  detectiveCount: DetectiveCount;
  /** One shared pool of guess attempts per round for the detective team. */
  teamGuesses: number;
  /** Grid size = 1 true rule + (candidateCount - 1) decoys. */
  candidateCount: number;
  /** Accusation tokens per follower per round. */
  accusationsPerPlayer: number;
  /**
   * CC-2 heat-meter payoff (DEFAULT 0 — identity). Flavour points awarded at
   * reveal to each SURVIVING follower who drew ZERO suspicion-heat all round
   * (the "crime parfait individuel" — stayed coolest under every spotlight).
   * 0 => the existing exact-score matrix is byte-identical.
   */
  coolBonus: number;
  /**
   * CC-2 heat-meter payoff (DEFAULT 0 — identity). Flavour points awarded at
   * reveal to the detective team when the round's accumulated suspicion heat
   * "read true" — i.e. a conviction landed (the room's flinches pointed at a
   * real breaker the tribunal then eliminated). Aggregate-only, never a
   * per-ballot side channel. 0 => existing exact-score matrix unchanged.
   */
  detectiveReadBonus: number;
}

/** The catalog params for trouvez-la-regle (design 2.16 / by-game spec). */
export const TROUVEZ_LA_REGLE_CONFIG: RuleHuntConfig = {
  totalRounds: 3,
  briefingMs: 20_000,
  liveMs: 180_000,
  heatMs: 24_000,
  spotlightMs: 10_000,
  tribunalMs: 25_000,
  guessMs: 20_000,
  revealMs: 12_000,
  detectiveCount: 'auto',
  teamGuesses: 3,
  candidateCount: 8,
  accusationsPerPlayer: 1,
  // Heat-meter payoff is OPT-IN flavour: 0/0 keeps the shipped scoring matrix
  // byte-identical (the suspicion meter is visible & legible, but pays nothing
  // unless a pack turns these on). Re-baseline only the cases that flip them.
  coolBonus: 0,
  detectiveReadBonus: 0,
};

export type RuleHuntPhase =
  | 'briefing'
  | 'live'
  | 'spotlight'
  | 'tribunal'
  | 'guess'
  | 'reveal'
  | 'over';

/** A follower's free, soft heat-check read (distinct from the costly accuse token). */
export type FlagBet = 'flag' | 'clean';
/** A detective's private heat-check bookmark — no elimination power, no clue leaked. */
export type NoteBet = 'suspicious' | 'clear';

export interface TribunalState {
  accused: PlayerId;
  accuser: PlayerId;
  /** HIDDEN buffer — per-voter ballots are NEVER serialized into any view. */
  votes: Record<PlayerId, boolean>;
}

/** Published after a tribunal resolves: aggregate tally + abstainers ONLY. */
export interface TribunalResult {
  accused: PlayerId;
  accuser: PlayerId;
  guilty: boolean;
  tally: { guilty: number; notGuilty: number };
  abstained: PlayerId[];
}

/** Public from reveal on — carries the round's secret out into the open. */
export interface RoundOutcome {
  kind: 'guessed' | 'timeUp';
  guesser: PlayerId | null;
  pickedIndex: number | null;
  /** Zero convictions this round (the brief's "ni enfreinte ni devinée" full win). */
  perfect: boolean;
  trueIndex: number;
  ruleText: LText;
}

export interface RuleHuntState {
  config: RuleHuntConfig;
  /** Match seed — drives the per-round candidate-grid fork; never serialized into views. */
  seed: string;
  players: PlayerId[];
  connected: Presence;
  /** HIDDEN: the full rotation is a spoiler for future rounds. */
  detectiveOrder: PlayerId[];
  detectiveCursor: number;
  /** Resolved 'auto' -> 1|2 at init. */
  detectiveCount: number;
  /** PUBLIC by design — announced at briefing. */
  detectives: PlayerId[];
  /** PUBLIC; round-local; conviction-only — never via disconnect. */
  eliminated: Record<PlayerId, boolean>;
  /** Seed-shuffled item pool; HIDDEN (future rules are spoilers). */
  items: RuleItem[];
  round: number;
  phase: RuleHuntPhase;
  /** Current round's grid, seed-shuffled — same order for every viewer. */
  candidateTexts: LText[];
  /** HIDDEN until reveal — the round's secret index. */
  trueCandidateIndex: number;
  ackRule: Record<PlayerId, boolean>;
  /** The pause/resume clock bank — event-`at` arithmetic only, never wall clock. */
  liveRemainingMs: number;
  /** `at` of the event that (re)entered live. */
  segmentStartedAt: number;
  /** Increments on every live resume so phaseKey re-arms the shorter remainder. */
  liveSeg: number;
  /** Makes every tribunal/guess/spotlight instance phaseKey-unique within a round. */
  interruptSeq: number;
  /**
   * Forced heat-check micro-beat. Non-null only during the `spotlight` phase.
   * `target` is seeded (createRng(`${seed}:spot:${round}:${seq}`)) so the same
   * seed produces the same spotlight order across every replay. `flags` /
   * `notes` are HIDDEN side-bet buffers (kit/sidebet): owner-only echo + public
   * counts, never another player's value pre-resume.
   */
  spotlight: {
    target: PlayerId;
    /** Instance ordinal — the seq used to seed this pick and key the phase. */
    seq: number;
    /** HIDDEN — followers' free soft read. Owner-echo / aggregate-count only. */
    flags: Record<PlayerId, FlagBet>;
    /** HIDDEN — detectives' private bookmark. Owner-echo / aggregate-count only. */
    notes: Record<PlayerId, NoteBet>;
  } | null;
  /** Count of completed spotlights this round — seeds the next pick, keys the phase. */
  spotlightCount: number;
  accusationsLeft: Record<PlayerId, number>;
  teamGuessesLeft: number;
  /** PUBLIC: wrong picks, greyed in the grid. */
  usedCandidates: number[];
  tribunal: TribunalState | null;
  guess: { guesser: PlayerId } | null;
  lastTribunal: TribunalResult | null;
  lastOutcome: RoundOutcome | null;
  /** Convictions this round — perfect = 0 at reveal. */
  infractions: number;
  /**
   * PUBLIC per-target suspicion meter, round-local (reset each round in
   * startRound). At each spotlight resolve the count of soft reads that landed
   * AGAINST the spotlit performer (followers' `'flag'` + detectives'
   * `'suspicious'`) is accumulated onto `heat[target]`. It is an AGGREGATE
   * per-target total only — never a per-voter map, so it cannot be inverted to
   * recover anyone's hidden read. Drives the legible "qui chauffe ?" UI and the
   * CC-2 reveal payoff (coolest follower drew zero heat). The raw hidden
   * `spotlight.flags`/`notes` buffers are still dropped at resolve.
   */
  heat: Record<PlayerId, number>;
  /**
   * CC-5 crime-parfait streak — consecutive `timeUp` + perfect (zero-conviction)
   * rounds. Incremented at reveal when the round is a perfect time-up, reset to
   * 0 on any conviction or a guessed round. Carried across rounds and surfaced
   * on the reveal + over views so the shell can tease "2 crimes parfaits — un
   * troisième et vous entrez dans la légende" into the next briefing. PUBLIC;
   * no new secret (derived from the already-public outcome).
   */
  cleanStreak: number;
  scores: Record<PlayerId, number>;
  endReason: 'finished' | 'roomCollapsed' | null;
}

export type RuleHuntAction =
  | { kind: 'ackRule' }
  | { kind: 'accuse'; target: PlayerId }
  | { kind: 'tribunalVote'; guilty: boolean }
  | { kind: 'openGuess' }
  | { kind: 'pickCandidate'; index: number }
  /** Heat-check: a non-spotlit follower's free soft read of the spotlit performer. */
  | { kind: 'flagBreak'; flag: FlagBet }
  /** Heat-check: a detective's private bookmark on the spotlit performer (no power). */
  | { kind: 'noteSuspicious'; note: NoteBet };

export type RuleHuntRole = 'detective' | 'follower' | null;

/**
 * CC-5 epilogue — derived at 'over' from ALREADY-PUBLIC state only (final
 * scores + the public crime-parfait streak). No new in-match secret. Feeds the
 * shell's roast + rematch CTA.
 */
export interface RuleHuntEpilogue {
  /** The sole top-scorer, or null on a tied/empty crown (kit `mvp`). */
  mvp: PlayerId | null;
  /** Top-1 vs top-2 score gap (kit `topGap`); 0 when <2 players or tied. */
  topGap: number;
  /** True when the top-2 gap is within the close-finish threshold (kit `isCloseFinish`). */
  closeFinish: boolean;
  /**
   * The crime-parfait superlative: the longest clean (perfect time-up) streak
   * reached this match and who held it at the end. `length` 0 / empty `holders`
   * when no perfect round ever landed — a superlative nobody earned is not
   * awarded (kit `statLeaders` semantics, applied to the public streak).
   */
  cleanStreak: { length: number; holders: PlayerId[] };
}

export interface SeatView {
  id: PlayerId;
  connected: boolean;
  eliminated: boolean;
  isDetective: boolean;
}

export interface RuleHuntViewBase {
  round: number;
  totalRounds: number;
  seats: SeatView[];
  scores: Record<PlayerId, number>;
  /** null for unknown viewers (spectators, hostile ids). */
  myRole: RuleHuntRole;
  iAmEliminated: boolean;
  /** Followers only (INCLUDING eliminated followers — they knew it); null otherwise. */
  myRule: LText | null;
  myAccusationsLeft: number;
  teamGuessesLeft: number;
  usedCandidates: number[];
  lastTribunal: TribunalResult | null;
  /**
   * PUBLIC per-target suspicion meter for the CURRENT round (aggregate read
   * totals; 0-entries omitted, matching the `tally` convention). Lets the room
   * see "qui chauffe ?" during live/spotlight/guess and the reveal pay it off.
   * Aggregate-only — never a per-voter map, so it leaks no hidden read.
   */
  heat: Record<PlayerId, number>;
  /** PUBLIC crime-parfait streak so far (consecutive perfect time-up rounds). */
  cleanStreak: number;
}

export type RuleHuntView =
  | (RuleHuntViewBase & { phase: 'briefing'; acked: Record<PlayerId, boolean> })
  | (RuleHuntViewBase & { phase: 'live' })
  | (RuleHuntViewBase & {
      phase: 'spotlight';
      /** PUBLIC — the named performer (the whole table looks at them). */
      target: PlayerId;
      /** True for the spotlit follower only ("Toi. Maintenant."). */
      iAmSpotlit: boolean;
      /** Aggregate heat — how many flags/notes have landed (leaks no value, no voter). */
      flagCount: number;
      noteCount: number;
      /** Owner echo only — my own flag/note this beat, or null. Never a foreign read. */
      myFlag: FlagBet | null;
      myNote: NoteBet | null;
    })
  | (RuleHuntViewBase & {
      phase: 'tribunal';
      accused: PlayerId;
      accuser: PlayerId;
      /** The currently expected voter set (presence-derived, public). */
      voters: PlayerId[];
      hasVoted: Record<PlayerId, boolean>;
      /** Owner echo only — null for everyone else. */
      myVote: boolean | null;
    })
  | (RuleHuntViewBase & {
      phase: 'guess';
      guesser: PlayerId;
      iAmGuessing: boolean;
      /** Byte-identical order for every roster viewer; null (omitted) for unknown viewers. */
      candidates: LText[] | null;
    })
  | (RuleHuntViewBase & {
      phase: 'reveal';
      outcome: RoundOutcome;
      candidates: LText[];
      /**
       * CC-2 payoff, derived at reveal from the PUBLIC `heat` meter: the
       * surviving followers who drew ZERO suspicion-heat this round (the
       * coolest performers). Stable ascending-id order. Always surfaced for the
       * legible "crime parfait individuel" chrome even when `coolBonus` is 0;
       * the actual points moved are visible via the climbing `scores`.
       */
      coolestFollowers: PlayerId[];
      /** Flavour points each coolest follower just earned (0 by default — identity). */
      coolBonusEach: number;
    })
  | (RuleHuntViewBase & {
      phase: 'over';
      endReason: 'finished' | 'roomCollapsed';
      /** CC-5 epilogue derived from already-PUBLIC end-of-match state. */
      epilogue: RuleHuntEpilogue;
    });
