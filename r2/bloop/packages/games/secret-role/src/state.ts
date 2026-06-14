import type { PlayerId } from '@bloop/engine';
import type { Presence, SideBetBuffer } from '@bloop/kit';

/** Bilingual UI string — the client picks a locale at render time. */
export interface LText {
  fr: string;
  en: string;
}

/**
 * One odd-one-out content item (runtime mapping of the authored pack shape —
 * content/packs/double-jeu.json — keeping only what the reducer needs; the
 * authored `mediaType`/`closeness`/`spicyLevel` are offline-pipeline concerns).
 */
export interface SecretRoleItem {
  id: string;
  /** PUBLIC label shown to the whole room in every phase. */
  theme: LText;
  /** HIDDEN: the shared item shown to every civilian (secretReveal only, then public at finalReveal). */
  majority: LText;
  /** HIDDEN: the deliberately-close variant shown to the lone impostor. */
  impostor: LText;
}

export interface SecretRoleContent {
  items: SecretRoleItem[];
}

/** Exact per-match awards (wave2 §2.6 — double-jeu params.scoring, verbatim). */
export interface SecretRoleScoring {
  /** Each civilian: +1 per vote round in which their ballot targeted the impostor (max +2). */
  civilianCorrectBallotPerVote: number;
  /** Team bonus to EVERY civilian when the impostor is caught on vote 1. */
  teamBonusCaughtVote1: number;
  /** Team bonus to EVERY civilian when the impostor is caught on vote 2. */
  teamBonusCaughtVote2: number;
  /** Impostor: banked for surviving vote 1 (kept even if caught on vote 2). */
  impostorSurvivesVote1: number;
  /** Impostor: added on top for surviving vote 2 (win = survives + bonus). */
  impostorWinsBonus: number;
  /** Civilians' consolation when THE impostor disconnects mid-match (impostor gets 0). */
  impostorDisconnectCivilianConsolation: number;
  /**
   * CC-1 side-bet (the "lean") accuracy bonus: points awarded at finalReveal to
   * any player whose hidden discuss-time lean named the actual impostor. Small,
   * upside-only flavour (resolveSideBets clamps non-positive to 0); default 0
   * keeps the side-bet inert and every legacy scoring assertion unchanged.
   */
  leanBonusCorrect: number;
}

/**
 * SECRET_ROLE@2 param surface (synthesis §5.1: double-jeu COEXISTS with the
 * canonical impostor design as a config + the @2 accusation params). v1 ships
 * the accusation branch only; the literal types document the rider axes.
 */
export interface SecretRoleConfig {
  /** 'accusation': no elimination — each vote asks "is the unique plurality target the impostor?". */
  roundMode: 'accusation';
  /** 'none': no structured clue turns — discussion is IRL free talk. */
  clueMode: 'none';
  /** Number of discussion+vote periods per match (double-jeu: 2). */
  maxVoteRounds: number;
  maxImpostors: number;
  impostorWordMode: 'decoy';
  /** false: nobody is told their role — even the impostor only sees "your item". */
  revealRoleToSelf: boolean;
  impostorGuessEnabled: boolean;
  secretRevealMs: number;
  /** Discussion period 1. */
  discussMs: number;
  /** Discussion period 2 (shorter — the cleared-suspect info accelerates deduction). */
  discuss2Ms: number;
  voteMs: number;
  verdictMs: number;
  finalRevealMs: number;
  matchesPerSession: number;
  scoring: SecretRoleScoring;
}

export const DOUBLE_JEU_CONFIG: SecretRoleConfig = {
  roundMode: 'accusation',
  clueMode: 'none',
  maxVoteRounds: 2,
  maxImpostors: 1,
  impostorWordMode: 'decoy',
  revealRoleToSelf: false,
  impostorGuessEnabled: false,
  secretRevealMs: 7_000,
  discussMs: 75_000,
  discuss2Ms: 50_000,
  voteMs: 25_000,
  verdictMs: 8_000,
  finalRevealMs: 9_000,
  matchesPerSession: 3,
  scoring: {
    civilianCorrectBallotPerVote: 1,
    teamBonusCaughtVote1: 2,
    teamBonusCaughtVote2: 1,
    impostorSurvivesVote1: 2,
    impostorWinsBonus: 3,
    impostorDisconnectCivilianConsolation: 1,
    leanBonusCorrect: 1,
  },
};

export type SecretRolePhase =
  | 'secretReveal'
  | 'discuss'
  | 'vote'
  | 'verdict'
  | 'finalReveal'
  | 'over';

/** Promoted from the hidden votes buffer at resolution — tallies only, never individual ballots. */
export interface VoteRecord {
  /** 0-based vote round within the match (0 or 1). */
  voteRound: number;
  /** Counts per accused player (zero entries omitted). */
  tally: Record<PlayerId, number>;
  /** Roster members with no buffered ballot at resolution. */
  abstained: PlayerId[];
  /**
   * The unique plurality target, or null on tie / all-abstain. When the vote
   * MISSED, this is the publicly CLEARED player ("Pas l'imposteur !") — by
   * construction it is never the impostor outside a caught record.
   */
  topAccused: PlayerId | null;
  /** True iff topAccused is the impostor (the match ends on this vote). */
  caught: boolean;
}

export type MatchEndReason = 'caughtVote1' | 'caughtVote2' | 'impostorWins' | 'impostorLeft';

/** Full atomic reveal for one completed match — public from finalReveal on. */
export interface MatchResult {
  match: number;
  itemId: string;
  theme: LText;
  majorityItem: LText;
  impostorItem: LText;
  impostor: PlayerId;
  winners: 'civilians' | 'impostor';
  /** 0 | 1 when caught on that vote, null otherwise (impostor won or left). */
  caughtOnVote: number | null;
  endReason: MatchEndReason;
  /** Tallies of the resolved vote rounds — never individual ballots. */
  voteRecords: VoteRecord[];
  /** This match's exact points per player (already folded into scores). */
  points: Record<PlayerId, number>;
}

export interface SecretRoleState {
  config: SecretRoleConfig;
  /** Fixed roster from init. */
  players: PlayerId[];
  connected: Presence;
  /** HIDDEN: one item per match — word values must never reach a pre-finalReveal view. */
  items: SecretRoleItem[];
  /**
   * HIDDEN: seeded per-match impostor preference order. The match impostor is
   * the first CONNECTED player in that match's order at match entry (so a
   * ghost — a player who left during the previous finalReveal — can never be
   * seeded as the player the room hunts).
   */
  impostorPool: PlayerId[][];
  /** HIDDEN: the CURRENT match's impostor (fixed at match entry). */
  impostor: PlayerId;
  /** min(config.matchesPerSession, pack pool size). */
  totalMatches: number;
  match: number;
  phase: SecretRolePhase;
  /** Discussion/vote period within the match: 0 or 1. */
  period: number;
  /** secretReveal acks — exposed as booleans only. */
  acked: Record<PlayerId, true>;
  /** discuss "ready to vote" set — exposed as booleans only. */
  ready: Record<PlayerId, true>;
  /** HIDDEN buffer: accuser -> accused for the current vote round. First vote locks. */
  votes: Record<PlayerId, PlayerId>;
  /**
   * HIDDEN side-bet buffer (CC-1 "lean"): bettor -> the player they secretly
   * suspect is the impostor. Written during `discuss`, re-opened (cleared) at
   * each discuss entry so a player re-leans with fresh info across the two
   * periods, and resolved at `finalReveal` against the now-public impostor for a
   * small accuracy bonus. OWNER-ONLY (`redactSideBets`, no revealAll pre-`over`):
   * a non-owner sees only the aggregate count, never another player's suspect —
   * so it can NEVER be inverted to out the impostor mid-match. It is a SEPARATE
   * field from `votes`/`ready`, never counted toward `allActed`/early-resolve.
   */
  leans: SideBetBuffer<PlayerId>;
  /** Resolved vote records of the CURRENT match — public once resolved. */
  voteRecords: VoteRecord[];
  /** HIDDEN until finalReveal: this match's accrued points (correct ballots + impostor survival). */
  pendingPoints: Record<PlayerId, number>;
  /** Completed matches — public. */
  results: MatchResult[];
  /** Session totals across matches. */
  scores: Record<PlayerId, number>;
}

export type SecretRoleAction =
  | { kind: 'ack' }
  | { kind: 'ready' }
  | { kind: 'vote'; target: PlayerId }
  | { kind: 'lean'; target: PlayerId };

interface SecretRoleViewBase {
  match: number;
  totalMatches: number;
  /** PUBLIC theme of the current match's item. */
  theme: LText;
  scores: Record<PlayerId, number>;
}

export type SecretRoleView =
  | (SecretRoleViewBase & {
      phase: 'secretReveal';
      /** The viewer's OWN item only (majority for civilians, the close variant for the impostor — no role flag). null for non-players. */
      myItem: LText | null;
      acked: Record<PlayerId, boolean>;
      iAcked: boolean;
    })
  | (SecretRoleViewBase & {
      phase: 'discuss';
      period: number;
      ready: Record<PlayerId, boolean>;
      iAmReady: boolean;
      /** Public record of the previous vote round of THIS match (null in period 0). */
      lastVote: VoteRecord | null;
      /**
       * The viewer's OWN secret lean (suspected impostor id) for this discuss
       * period, or null if they have not leaned. Owner-only echo — a non-owner
       * NEVER receives another player's lean.
       */
      myLean: PlayerId | null;
      /** PUBLIC aggregate: how many players have placed a lean this period (a count, leaks no suspect). */
      leanCount: number;
    })
  | (SecretRoleViewBase & {
      phase: 'vote';
      voteRound: number;
      /** Booleans only — targets stay hidden. */
      hasVoted: Record<PlayerId, boolean>;
      /** The viewer's OWN ballot echo. null for non-voters/non-players. */
      myVote: PlayerId | null;
      /** Roster minus self; empty for non-players. */
      votableTargets: PlayerId[];
      lastVote: VoteRecord | null;
    })
  | (SecretRoleViewBase & {
      phase: 'verdict';
      /** The missed vote 1: tally bars + the cleared topAccused (null on tie). */
      vote: VoteRecord;
    })
  | (SecretRoleViewBase & {
      phase: 'finalReveal';
      result: MatchResult;
    })
  | {
      phase: 'over';
      totalMatches: number;
      scores: Record<PlayerId, number>;
      results: MatchResult[];
    };
