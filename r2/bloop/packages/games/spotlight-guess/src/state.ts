import type { PlayerId } from '@bloop/engine';
import type { Presence, RoundMultiplierOpts, SideBetBuffer } from '@bloop/kit';

/**
 * KEYSTONE (P0-B-lite) — devine react-lite token. A CONTENT-FREE liveness tap
 * during the reverse 'answer' beat: a single value-less 'ready' marker. It is
 * deliberately content-free so it can NEVER triangulate the hidden question
 * (risk #2): no option, no candidate, no answer index ever rides on it. The
 * marker lives in a hidden side-bet buffer (kit `sidebet`), exposed only as a
 * public aggregate count + an owner-only echo — never another player's marker.
 */
export type ReactToken = 'ready';

/** Bilingual UI string — the client picks a locale at render time. */
export interface LText {
  fr: string;
  en: string;
}

/**
 * SPOTLIGHT_GUESS — one rotating spotlight holds a per-round secret (a seeded
 * number, or a pack realIndex); the room converges on it with hidden guesses.
 * Two modes, one reducer, config-driven (design §3.3):
 * - 'scale'            jeu-de-la-note  — secret number on a labeled scale/wheel
 * - 'reverse-question' devine-la-question — secret question behind a public answer
 */
export type SpotlightMode = 'scale' | 'reverse-question';

/** scale10 → integers 1..10; wheel100 → integers 0..100 (snap ticks client-side). */
export type ScaleDomain = 'scale10' | 'wheel100';

/** Runtime scale item — cleaned mapping of content/packs/jeu-de-la-note.json items. */
export interface ScaleItem {
  id: string;
  kind: ScaleDomain;
  /** The instruction the speaker performs out loud, calibrated to the secret number. */
  prompt: LText;
  /** Anchor label for 1 / the left end of the wheel. */
  low: LText;
  /** Anchor label for 10 / the right end of the wheel. */
  high: LText;
}

/** Runtime reverse item — cleaned mapping of content/packs/devine-la-question.json items. */
export interface ReverseItem {
  id: string;
  /** The secret real question. */
  question: LText;
  /** 3-4 honest-answer options the mystery player picks from. */
  answers: LText[];
  /** Fake questions, same register as the real one (>= decoyCount). */
  decoys: LText[];
  /** hintTiers-1 progressive hints, least -> most revealing. */
  hints: LText[];
}

/** Pack data is mode-discriminated: one pack serves exactly one mode. */
export type SpotlightGuessContent =
  | { mode: 'scale'; items: ScaleItem[] }
  | { mode: 'reverse-question'; items: ReverseItem[] };

export interface SpotlightGuessConfig {
  mode: SpotlightMode;
  totalRounds: number;
  /** Shared reveal beat. */
  revealMs: number;
  /** false = overwrites until resolve (scale); true = first-write-wins lock (reverse). */
  lockOnSubmit: boolean;
  // --- scale mode ---
  /** Fallback domain when an item carries no kind (items always do in practice). */
  domain: ScaleDomain;
  targetReadMs: number;
  talkMs: number;
  guessMs: number;
  speakerCanEndTalk: boolean;
  // --- reverse-question mode ---
  answerMs: number;
  /** Number of guess windows; 1 for scale (no hints), 3 for reverse. */
  hintTiers: number;
  hintIntervalMs: number;
  decoyCount: number;
  /** Points by lock tier — length === hintTiers in reverse mode. */
  tierPoints: number[];
  readerPointsPerCorrectGuess: number;
  scoreboardMs: number;
  /** Insert a scoreboard beat every N revealed rounds (and always before over). 0 = final only. */
  scoreboardEvery: number;
  /**
   * P1 (CC-2) — escalating late-round score multiplier. Applied at BOTH award
   * sites (scale band points + spotlight median band; reverse tier points +
   * reader bonus) via the kit's `roundMultiplier`, so late accuracy can erase
   * an early lead (comeback) without touching the band/tier math itself.
   *
   * DEFAULT-IDENTITY: omitting this (or an empty `{}`) yields `roundMultiplier`
   * === 1 every round, so EVERY existing exact-score test stays byte-identical;
   * only the explicitly late-weighted cases re-baseline.
   *   - jeu-de-la-note: the last `multiplierRounds` rounds are worth more.
   *   - devine-la-question: the final round's tier (and reader) points double.
   */
  lateRoundMultiplier?: RoundMultiplierOpts;
  /**
   * P1 (CC-5) — top-2 score gap at/under which the 'over' epilogue flags a
   * close finish (cliffhanger chrome). Tuned per game's point scale. Omitted /
   * negative => the flag is simply never raised (default-safe, no behaviour
   * change beyond an inert `closeFinish:false`).
   */
  closeFinishThreshold?: number;
}

/** jeu-de-la-note — design docs/designs/wave2-raw/by-game/jeu-de-la-note.json (binding). */
export const JEU_DE_LA_NOTE_CONFIG: SpotlightGuessConfig = {
  mode: 'scale',
  totalRounds: 8,
  revealMs: 9_000,
  lockOnSubmit: false,
  domain: 'scale10',
  targetReadMs: 8_000,
  talkMs: 45_000,
  guessMs: 20_000,
  speakerCanEndTalk: true,
  // reverse-only knobs, inert in scale mode (no scoreboard beat in this game):
  answerMs: 0,
  hintTiers: 1,
  hintIntervalMs: 0,
  decoyCount: 0,
  tierPoints: [],
  readerPointsPerCorrectGuess: 0,
  scoreboardMs: 0,
  scoreboardEvery: 0,
  // P1 (CC-2) — the last two rounds are worth double, so a tight 8-round game
  // stays live to the end instead of compressing to a dead rubber (every round
  // otherwise caps at 4 pts). Rounds 0-5 ×1 (identity), rounds 6-7 ×2.
  lateRoundMultiplier: { finalRoundMultiplier: 2, multiplierRounds: 2 },
  // A 4-point swing (one ×2 perfect read) or less at the buzzer is a photo finish.
  closeFinishThreshold: 4,
};

/** devine-la-question — design docs/designs/wave2-raw/by-game/devine-la-question.json (binding). */
export const DEVINE_LA_QUESTION_CONFIG: SpotlightGuessConfig = {
  mode: 'reverse-question',
  totalRounds: 6,
  revealMs: 9_000,
  lockOnSubmit: true,
  // scale-only knobs, inert in reverse mode:
  domain: 'scale10',
  targetReadMs: 0,
  talkMs: 0,
  guessMs: 0,
  speakerCanEndTalk: false,
  answerMs: 20_000,
  hintTiers: 3,
  hintIntervalMs: 20_000,
  decoyCount: 4,
  tierPoints: [300, 200, 100],
  readerPointsPerCorrectGuess: 75,
  scoreboardMs: 6_000,
  scoreboardEvery: 2,
  // P1 (CC-2) — the LAST round's tier ladder (and reader bonus) doubles, so a
  // player 300 behind at round 5 still has a live shot at the crown. Rounds 0-4
  // ×1 (identity — every shipped tier-ladder test runs at round 0), round 5 ×2.
  lateRoundMultiplier: { finalRoundMultiplier: 2, multiplierRounds: 1 },
  // One missed h0 lock (300) or less between the top two is a nail-biter.
  closeFinishThreshold: 300,
};

/**
 * Union over both modes. scale uses target/talk/guess/reveal; reverse uses
 * answer/guess(+hint tiers)/reveal/scoreboard. 'over' is terminal + untimed.
 */
export type SpotlightPhase =
  | 'target'
  | 'talk'
  | 'answer'
  | 'guess'
  | 'reveal'
  | 'scoreboard'
  | 'over';

export interface ScaleRound {
  itemId: string;
  /** Per-item domain: the authored pack mixes scale10 and wheel100 items. */
  kind: ScaleDomain;
  prompt: LText;
  low: LText;
  high: LText;
}

export interface ReverseRound {
  itemId: string;
  /** Honest-answer options the spotlight picks from — spotlight-only pre-guess. */
  answers: LText[];
  /** Seeded shuffle of [real question, ...decoys] — public from the guess phase. */
  candidates: LText[];
  /** HIDDEN until reveal (spotlight-own echo only). */
  realIndex: number;
  /** Public one tier at a time. */
  hints: LText[];
}

/** scale: value = dial integer; reverse: value = candidateIndex. tier = lock tier (0 in scale). */
export interface GuessEntry {
  value: number;
  tier: number;
}

export interface SpotlightGuessState {
  config: SpotlightGuessConfig;
  players: PlayerId[];
  /** Seeded shuffle — the spotlight rotation order (pack-independent: first rng draw). */
  turnOrder: PlayerId[];
  connected: Presence;
  round: number;
  phase: SpotlightPhase;
  /** Index into turnOrder of the current spotlight (speaker / mystery player). */
  spotIndex: number;
  /** Reverse guess sub-tier (0-based). Always 0 in scale mode. */
  hintTier: number;
  /** Scale mode round material ([] in reverse mode). */
  scaleRounds: ScaleRound[];
  /** HIDDEN: pre-drawn secret targets for ALL rounds (seeded at init; [] in reverse mode). */
  targets: number[];
  /** Reverse mode round material — realIndex inside is HIDDEN until reveal. */
  reverseRounds: ReverseRound[];
  /** HIDDEN during 'answer' (spotlight echo only); public from 'guess' on. */
  chosenAnswer: number | null;
  /** HIDDEN buffer: never exposed pre-reveal beyond acted-booleans + owner echo. */
  guesses: Record<PlayerId, GuessEntry>;
  /**
   * KEYSTONE (P0-B-lite) — HIDDEN react buffer for the reverse 'answer' beat.
   * Content-free 'ready' markers; exposed only as a public count + owner echo
   * (kit `redactSideBets`). SEPARATE from `guesses` so it can never be counted
   * toward the primary `allActed`/early-resolve, and never leaks the ballot.
   */
  reacts: SideBetBuffer<ReactToken>;
  /** True when the round was voided (spotlight left / never answered). */
  voided: boolean;
  /** Points gained in the last resolved round — public from reveal on. */
  lastGained: Record<PlayerId, number>;
  scores: Record<PlayerId, number>;
  /**
   * P1 (CC-5) — PUBLIC per-player tallies, accrued ONLY at reveal from outcomes
   * that are already public there (no new in-match secret). They summarise the
   * reveal nobody could un-see, so the 'over' epilogue is a pure fold over them:
   *   - mindReads: rounds a guesser read the secret perfectly (scale: distance 0
   *     i.e. the top band; reverse: a correct candidate lock). Feeds "best
   *     mind-reader".
   *   - whiffs: rounds a guesser submitted but scored nothing (scale: band 0;
   *     reverse: a wrong lock). Feeds "most-fooled".
   * The spotlight never guesses, so neither counter ever moves for them.
   */
  mindReads: Record<PlayerId, number>;
  whiffs: Record<PlayerId, number>;
}

export type SpotlightGuessAction =
  | { kind: 'ready' }
  | { kind: 'openVotes' }
  | { kind: 'answer'; answerIndex: number }
  | { kind: 'guess'; value: number }
  /** KEYSTONE (P0-B-lite) — content-free liveness tap during reverse 'answer'. */
  | { kind: 'react' };

// ---------------------------------------------------------------------------
// Views — every player-visible content string is bilingual {fr,en}.
// ---------------------------------------------------------------------------

export interface ScaleItemView {
  id: string;
  prompt: LText;
  low: LText;
  high: LText;
}

interface ViewBase {
  round: number;
  totalRounds: number;
  spotlightId: PlayerId;
  scores: Record<PlayerId, number>;
  connected: Record<PlayerId, boolean>;
}

export type SpotlightGuessView =
  | (ViewBase & {
      mode: 'scale';
      phase: 'target';
      domain: ScaleDomain;
      item: ScaleItemView | null;
      canEndTalk: boolean;
      /** The secret — spotlight only; null for everyone else. */
      myTarget: number | null;
    })
  | (ViewBase & {
      mode: 'scale';
      phase: 'talk';
      domain: ScaleDomain;
      item: ScaleItemView | null;
      canEndTalk: boolean;
      /** The secret — spotlight only; null for everyone else. */
      myTarget: number | null;
      /**
       * KEYSTONE (P0-A) live-dial — acted-booleans for the first-impression dial
       * written into the SAME hidden guess buffer during talk (public aggregate).
       */
      hasGuessed: Record<PlayerId, boolean>;
      /** Owner echo only — the viewer's own first-impression dial (null if none). */
      myGuess: number | null;
    })
  | (ViewBase & {
      mode: 'scale';
      phase: 'guess';
      domain: ScaleDomain;
      item: ScaleItemView | null;
      hasGuessed: Record<PlayerId, boolean>;
      /** Owner echo only. */
      myGuess: number | null;
      myTarget: number | null;
    })
  | (ViewBase & {
      mode: 'scale';
      phase: 'reveal';
      domain: ScaleDomain;
      item: ScaleItemView | null;
      /** null on a voided round (the performance never happened). */
      target: number | null;
      /** Public from reveal on. */
      guesses: Record<PlayerId, number>;
      gained: Record<PlayerId, number>;
      voided: boolean;
    })
  | (ViewBase & {
      mode: 'reverse-question';
      phase: 'answer';
      /** Spotlight only; null for guessers/spectators (zero leak — no candidates either). */
      question: LText | null;
      answers: LText[] | null;
      /**
       * KEYSTONE (P0-B-lite) react-lite — public aggregate ONLY: how many guessers
       * have tapped the content-free 'ready' marker (avatars light up). Carries no
       * value, no per-player map, nothing that could triangulate the question.
       */
      reactCount: number;
      /** Owner echo only — has THIS viewer tapped? (true/false, never anyone else's). */
      myReact: boolean;
    })
  | (ViewBase & {
      mode: 'reverse-question';
      phase: 'guess';
      hintTier: number;
      hintTiers: number;
      tierPoints: number[];
      chosenAnswer: LText | null;
      candidates: LText[];
      hintsRevealed: LText[];
      /** Booleans ONLY — never anyone's pick. */
      locked: Record<PlayerId, boolean>;
      /** Owner echo only. */
      myGuess: GuessEntry | null;
      /** The spotlight's own secret echo; null for everyone else. */
      myRealIndex: number | null;
    })
  | (ViewBase & {
      mode: 'reverse-question';
      phase: 'reveal';
      chosenAnswer: LText | null;
      candidates: LText[];
      /** null on a voided round. */
      realIndex: number | null;
      picks: Record<PlayerId, GuessEntry>;
      gained: Record<PlayerId, number>;
      voided: boolean;
    })
  | (ViewBase & {
      mode: 'reverse-question';
      phase: 'scoreboard';
      gained: Record<PlayerId, number>;
    })
  | (SpotlightEpilogue & {
      mode: SpotlightMode;
      phase: 'over';
      scores: Record<PlayerId, number>;
    });

/**
 * P1 (CC-5) — the game-over epilogue, DERIVED at 'over' from already-PUBLIC
 * state only (final scores + the public mindReads/whiffs tallies). No new
 * secret; pure, deterministic, replay-identical (kit `mvp`/`statLeaders` use a
 * stable ascending-id order). Feeds the session-shell roast + rematch CTA.
 */
export interface SpotlightEpilogue {
  /** Sole crown holder, or null on a contested (tied) first place. */
  mvp: PlayerId | null;
  /** True when the top-2 score gap is within `closeFinishThreshold` (cliffhanger chrome). */
  closeFinish: boolean;
  /** Superlative: best mind-reader(s) — most perfect reads; [] when nobody read anyone. */
  bestMindReaders: PlayerId[];
  /** The winning read count behind `bestMindReaders` (0 when nobody read). */
  bestMindReads: number;
  /** Superlative: most-fooled — the guesser(s) with the most whiffed rounds; [] when nobody whiffed. */
  mostFooled: PlayerId[];
  /** The whiff count behind `mostFooled` (0 when nobody whiffed). */
  mostFooledWhiffs: number;
  /** PUBLIC per-player tallies the superlatives fold over (for the client breakdown). */
  mindReads: Record<PlayerId, number>;
  whiffs: Record<PlayerId, number>;
}
