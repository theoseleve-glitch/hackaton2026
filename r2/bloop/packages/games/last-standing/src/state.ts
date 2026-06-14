import type { PlayerId } from '@bloop/engine';
import type { Presence } from '@bloop/kit';

/** Bilingual UI string — the client picks a locale at render time. */
export interface LText {
  fr: string;
  en: string;
}

/**
 * One runtime round card — a cleaned mapping of the authored pack item
 * (content/packs/jeu-du-theme.json). The adapter strips exampleWords (they
 * would prime answers — design risk #9) and tags, and merges the per-locale
 * letter lists into ONE shared list (fr∩en when >= 3 letters, else the fr
 * list): the room shares a single spoken letter, so it must be identical on
 * every phone regardless of device locale, and an intersection letter is
 * pre-validated feasible in BOTH languages.
 */
export interface LastStandingItem {
  id: string;
  theme: LText;
  /** UPPERCASE letters pre-scored offline as feasible for this theme. */
  letters: string[];
  difficulty: 1 | 2 | 3;
}

export interface LastStandingContent {
  items: LastStandingItem[];
}

export type DifficultyCurve = 'ascending' | 'shuffled';

export interface LastStandingConfig {
  totalRounds: number;
  drawMs: number;
  sayMs: number;
  /** Shot clock shrinks per completed rotation lap — convergence guarantee. */
  sayDecayPerLapMs: number;
  minSayMs: number;
  judgeMs: number;
  resultMs: number;
  roundEndMs: number;
  validWordPoints: number;
  survivorPoints: number;
  /**
   * Side-bet reward (P0-1 keystone). Points a non-spotlight predictor earns for
   * a CORRECT "survives | chokes" call on the spotlight, paid into the SEPARATE
   * `betPoints` currency (never survivorPoints/validWordPoints). 0 disables the
   * payout (the bet UI may still render; nobody scores).
   */
  betPointsConfig: number;
  /** Rejected iff rejectVotes/castVotes STRICTLY exceeds this; ties/zero → valid. */
  rejectThreshold: number;
  /** Hard cap: rotation.length × this = max turns per round (safety belt). */
  maxTurnsPerRoundFactor: number;
  difficultyCurve: DifficultyCurve;
  /** Eliminated players join the jury — nobody idle. */
  deadPlayersJudge: boolean;
  allowGiveUp: boolean;
}

/** The binding wave-2 design params (docs/designs/wave2-raw/by-game/jeu-du-theme.json). */
export const JEU_DU_THEME_CONFIG: LastStandingConfig = {
  totalRounds: 3,
  drawMs: 2_500,
  sayMs: 8_000,
  sayDecayPerLapMs: 1_500,
  minSayMs: 3_000,
  judgeMs: 6_000,
  resultMs: 2_800,
  roundEndMs: 4_000,
  validWordPoints: 1,
  survivorPoints: 3,
  betPointsConfig: 1,
  rejectThreshold: 0.5,
  maxTurnsPerRoundFactor: 6,
  difficultyCurve: 'ascending',
  deadPlayersJudge: true,
  allowGiveUp: true,
};

export type LastStandingPhase = 'draw' | 'say' | 'judge' | 'result' | 'roundEnd' | 'over';

export type JudgeVote = 'valid' | 'reject';

/**
 * P0-1 keystone — the spotlight side-bet token. A non-spotlight player secretly
 * predicts whether the current word will SURVIVE the jury (`'survives'`) or
 * CHOKE/fail (`'chokes'`). Resolved at the turn result against the public
 * outcome: a turn that ends 'valid' = survives, anything else = chokes.
 */
export type SpotBet = 'survives' | 'chokes';

export type TurnOutcome = 'valid' | 'rejected' | 'timeout' | 'gaveUp' | 'left';

/** Public from the result beat on: outcome + anonymous tally COUNTS only. */
export interface TurnResult {
  player: PlayerId;
  outcome: TurnOutcome;
  tally: { valid: number; reject: number };
}

/** The drawn round card. Public once drawn — it is shouted in the room anyway. */
export interface CurrentDraw {
  /** Internal no-repeat key — never exposed through view(). */
  itemId: string;
  theme: LText;
  letter: string;
}

export interface LastStandingState {
  config: LastStandingConfig;
  /** HIDDEN: drives the per-round letter rng streams. Never in any view. */
  seed: string;
  players: PlayerId[];
  /** Seeded permutation of the roster = lap order (continues across rounds). */
  rotation: PlayerId[];
  connected: Presence;
  phase: LastStandingPhase;
  round: number;
  /** Global monotonic — ++ per turn entry; keys say/judge/result phases. */
  turnSeq: number;
  lapInRound: number;
  turnsThisRound: number;
  /** Index into rotation of the current/last spotlight; -1 before the first turn. */
  spotIndex: number;
  spotlight: PlayerId | null;
  /** Per-round elimination — reset to the connected snapshot at each draw. Presence ≠ elimination. */
  alive: Record<PlayerId, boolean>;
  current: CurrentDraw | null;
  /** HIDDEN: ordered theme deck (upcoming themes are the game's only content secret). */
  deck: LastStandingItem[];
  /** HIDDEN */
  themeCursor: number;
  /** HIDDEN: per-item letters already drawn (cross-round no-repeat). */
  usedLetters: Record<string, string[]>;
  /** HIDDEN: in-flight ballots — only tallies are ever published. */
  judgeVotes: Record<PlayerId, JudgeVote>;
  /**
   * HIDDEN (P0-1 keystone): in-flight spotlight side-bets for the current turn.
   * A SEPARATE buffer from judgeVotes — it is NEVER counted toward the jury
   * tally or the allActed early-resolve. Per-turn, reset at each enterTurn.
   * Redacted exactly like judgeVotes: owner-echo + public count only, never a
   * foreign player's call. Resolved into betPoints at toResult.
   */
  spotBets: Record<PlayerId, SpotBet>;
  lastTurn: TurnResult | null;
  roundWinners: PlayerId[];
  scores: Record<PlayerId, number>;
  /**
   * Side-bet currency (P0-1). DISTINCT from `scores` — correct survives/chokes
   * predictions accrue here so eliminated players keep earning without ever
   * touching word/survivor points or the survival/elimination logic.
   */
  betPoints: Record<PlayerId, number>;
  /** Validated-words count per player (end-screen superlative + participation). */
  wordsValidated: Record<PlayerId, number>;
}

export type LastStandingAction =
  | { kind: 'wordSaid' }
  | { kind: 'giveUp' }
  | { kind: 'judge'; vote: JudgeVote }
  | { kind: 'bet'; value: SpotBet };

/** Common scaffold for every in-game phase view. */
export interface LastStandingViewBase {
  round: number;
  totalRounds: number;
  turnSeq: number;
  rotation: PlayerId[];
  alive: Record<PlayerId, boolean>;
  connected: Record<PlayerId, boolean>;
  spotlight: PlayerId | null;
  current: { theme: LText; letter: string } | null;
  lapInRound: number;
  /** The decayed shot-clock duration for the current lap (UI hint). */
  sayMsThisLap: number;
  scores: Record<PlayerId, number>;
  /**
   * Side-bet currency (P0-1) — PUBLIC like `scores`. It only ever changes when a
   * turn resolves (in toResult), so a live value can never leak an in-flight
   * call: the per-player `spotBets` buffer stays hidden until then.
   */
  betPoints: Record<PlayerId, number>;
  wordsValidated: Record<PlayerId, number>;
  lastTurn: TurnResult | null;
}

export type LastStandingView =
  | (LastStandingViewBase & { phase: 'draw' })
  | (LastStandingViewBase & {
      phase: 'say';
      youAreSpotlight: boolean;
      canGiveUp: boolean;
      /** P0-1: this viewer may place a survives/chokes call (non-spotlight, present, not-yet-bet). */
      youCanBet: boolean;
      /** Own side-bet echo ONLY — never anyone else's call. */
      myBet: SpotBet | null;
      /** Aggregate count of bets placed this turn (leaks no value). */
      betsIn: number;
    })
  | (LastStandingViewBase & {
      phase: 'judge';
      youCanVote: boolean;
      /** Own-vote echo ONLY — never anyone else's ballot. */
      myVote: JudgeVote | null;
      votesIn: number;
      votersExpected: number;
    })
  | (LastStandingViewBase & { phase: 'result' })
  | (LastStandingViewBase & { phase: 'roundEnd'; roundWinners: PlayerId[]; pointsAwarded: number })
  | {
      phase: 'over';
      scores: Record<PlayerId, number>;
      rotation: PlayerId[];
      wordsValidated: Record<PlayerId, number>;
      /** Side-bet currency (P0-1) — public end-screen tally of correct calls. */
      betPoints: Record<PlayerId, number>;
    };
