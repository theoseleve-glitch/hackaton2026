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
}

/** The catalog params for trouvez-la-regle (design 2.16 / by-game spec). */
export const TROUVEZ_LA_REGLE_CONFIG: RuleHuntConfig = {
  totalRounds: 3,
  briefingMs: 20_000,
  liveMs: 180_000,
  tribunalMs: 25_000,
  guessMs: 20_000,
  revealMs: 12_000,
  detectiveCount: 'auto',
  teamGuesses: 3,
  candidateCount: 8,
  accusationsPerPlayer: 1,
};

export type RuleHuntPhase = 'briefing' | 'live' | 'tribunal' | 'guess' | 'reveal' | 'over';

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
  /** Makes every tribunal/guess instance phaseKey-unique within a round. */
  interruptSeq: number;
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
  scores: Record<PlayerId, number>;
  endReason: 'finished' | 'roomCollapsed' | null;
}

export type RuleHuntAction =
  | { kind: 'ackRule' }
  | { kind: 'accuse'; target: PlayerId }
  | { kind: 'tribunalVote'; guilty: boolean }
  | { kind: 'openGuess' }
  | { kind: 'pickCandidate'; index: number };

export type RuleHuntRole = 'detective' | 'follower' | null;

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
}

export type RuleHuntView =
  | (RuleHuntViewBase & { phase: 'briefing'; acked: Record<PlayerId, boolean> })
  | (RuleHuntViewBase & { phase: 'live' })
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
  | (RuleHuntViewBase & { phase: 'reveal'; outcome: RoundOutcome; candidates: LText[] })
  | (RuleHuntViewBase & { phase: 'over'; endReason: 'finished' | 'roomCollapsed' });
