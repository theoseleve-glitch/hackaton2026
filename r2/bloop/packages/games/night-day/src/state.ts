import type { PlayerId } from '@bloop/engine';
import type { Presence } from '@bloop/kit';

/** Bilingual UI string — the client picks a locale at render time. */
export interface LText {
  fr: string;
  en: string;
}

/**
 * v1 MINIMAL role set (design §2.17): wolves MUST see each other; the seer
 * probes; the witch holds one heal + one poison. Hunter/cupid/guardian/
 * little-girl/captain are v2 — the pack adapter drops their roleCards.
 */
export type Role = 'wolf' | 'villager' | 'seer' | 'witch';

export const V1_ROLES: readonly Role[] = ['wolf', 'villager', 'seer', 'witch'];

export type NarrationSlot =
  | 'night.intro'
  | 'dawn.death'
  | 'dawn.noDeath'
  | 'lynch.wolf'
  | 'lynch.villager'
  | 'lynch.none'
  | 'over.village'
  | 'over.wolves';

/** Fixed iteration order so the seeded narration shuffles are deterministic. */
export const NARRATION_SLOTS: readonly NarrationSlot[] = [
  'night.intro',
  'dawn.death',
  'dawn.noDeath',
  'lynch.wolf',
  'lynch.villager',
  'lynch.none',
  'over.village',
  'over.wolves',
];

/** Cleaned mapping of one AUTHORED pack item (content/packs/loup-garou.json). */
export interface RoleCardItem {
  id: string;
  type: 'roleCard';
  role: Role;
  name: LText;
  text: LText;
}

export interface NarrationItem {
  id: string;
  type: 'narration';
  slot: NarrationSlot;
  text: LText;
}

export type NightDayItem = RoleCardItem | NarrationItem;

/** Flavor-only pack: mechanics never depend on content (themed reskins are config+pack drops). */
export interface NightDayContent {
  items: NightDayItem[];
}

export interface NightDayConfig {
  seerEnabled: boolean;
  witchEnabled: boolean;
  /** v2 — must stay false in v1 (death-triggered sub-phase not implemented). */
  hunterEnabled: boolean;
  maxWolves: number;
  revealRoleOnDeath: boolean;
  lynchTieBreak: 'noLynch';
  witchSelfHeal: boolean;
  maxRounds: number;
  roleRevealMs: number;
  nightSeerMs: number;
  nightWolvesMs: number;
  nightWitchMs: number;
  dawnMs: number;
  debateMs: number;
  voteMs: number;
  lynchRevealMs: number;
}

/** Binding params from docs/designs/wave2-raw/by-game/loup-garou.json. */
export const LOUP_GAROU_CONFIG: NightDayConfig = {
  seerEnabled: true,
  witchEnabled: true,
  hunterEnabled: false,
  maxWolves: 4,
  revealRoleOnDeath: true,
  lynchTieBreak: 'noLynch',
  witchSelfHeal: true,
  maxRounds: 10,
  roleRevealMs: 15_000,
  nightSeerMs: 25_000,
  nightWolvesMs: 30_000,
  nightWitchMs: 25_000,
  dawnMs: 10_000,
  debateMs: 90_000,
  voteMs: 30_000,
  lynchRevealMs: 10_000,
};

export type NightDayPhase =
  | 'roleReveal'
  | 'nightSeer'
  | 'nightWolves'
  | 'nightWitch'
  | 'dawn'
  | 'debate'
  | 'vote'
  | 'lynchReveal'
  | 'over';

export interface RoleCard {
  name: LText;
  text: LText;
}

export interface SeerLogEntry {
  round: number;
  target: PlayerId;
  isWolf: boolean;
}

/** Public from dawn on. */
export interface DawnReport {
  died: PlayerId[];
  /** Present iff revealRoleOnDeath. */
  revealedRoles: Record<PlayerId, Role> | null;
}

/** Public from lynchReveal on. */
export interface LynchReport {
  evicted: PlayerId | null;
  revealedRole: Role | null;
  tally: Record<PlayerId, number>;
  abstained: PlayerId[];
}

export type Winners = 'village' | 'wolves';
export type EndReason = 'villageWins' | 'wolvesWin' | 'roomCollapsed' | 'maxRounds';

export interface NightDayState {
  config: NightDayConfig;
  players: PlayerId[];
  connected: Presence;
  /** HIDDEN: the redaction surface of the platform. Never in any pre-over view beyond myRole/wolfPack. */
  roles: Record<PlayerId, Role>;
  /** PUBLIC: the role census is announced (classic rule); assignments are the secret. */
  composition: Record<Role, number>;
  /** Pack flavor — a card surfaces only as the OWNER's myRoleCard pre-over. */
  roleCards: Partial<Record<Role, RoleCard>>;
  /** Seeded-shuffled variant lists per slot; views draw `round % length`. Public flavor. */
  narrations: Record<NarrationSlot, LText[]>;
  /** PUBLIC. Flips ONLY via wolf kill / poison / lynch — never via disconnect. */
  alive: Record<PlayerId, boolean>;
  /** 0-based night/day cycle. */
  round: number;
  phase: NightDayPhase;
  /** roleReveal acks — public booleans. */
  ackRole: Record<PlayerId, true>;
  /** Decoy-uniform acted booleans, reset at each night sub-phase entry. PUBLIC. */
  nightActed: Record<PlayerId, true>;
  /** HIDDEN except living wolves during nightWolves. */
  wolfVotes: Record<PlayerId, PlayerId>;
  /** HIDDEN: first-vote order of targets — deterministic tie-break, no rng. */
  wolfVoteSeq: PlayerId[];
  /** HIDDEN except the seer (survives her death — own log, not ghost omniscience). */
  seerLog: SeerLogEntry[];
  /** HIDDEN except the witch. */
  witchState: { healLeft: boolean; poisonLeft: boolean };
  /** HIDDEN: wolves' resolved victim — disclosed ONLY to the living witch, ONLY during nightWitch. */
  pendingKill: PlayerId | null;
  /** HIDDEN: heal consumed this night (cancels pendingKill at dawn). */
  pendingHealed: boolean;
  /** HIDDEN until dawn. */
  pendingPoison: PlayerId | null;
  lastDawn: DawnReport | null;
  /** Debate early-exit toggles — public booleans. */
  readyToVote: Record<PlayerId, true>;
  /** HIDDEN lynch ballots: hasVoted booleans public, targets promoted at lynchReveal. */
  votes: Record<PlayerId, PlayerId>;
  lastLynch: LynchReport | null;
  scores: Record<PlayerId, number>;
  winners: Winners | null;
  endReason: EndReason | null;
}

export type NightDayAction =
  | { kind: 'ackRole' }
  | { kind: 'nightAck' }
  | { kind: 'seerPeek'; target: PlayerId }
  | { kind: 'wolfVote'; target: PlayerId }
  | { kind: 'witchAct'; heal: boolean; poisonTarget: PlayerId | null }
  | { kind: 'readyToVote' }
  | { kind: 'vote'; target: PlayerId };

export interface Seat {
  id: PlayerId;
  alive: boolean;
  connected: boolean;
}

export type NightStep = 'seer' | 'wolves' | 'witch';

/**
 * Base envelope (design redaction matrix): own-only secrets are null for
 * everyone else INCLUDING spectators/'__proto__'. wolfPack is the deliberate
 * asymmetric disclosure (wolves only, alive or dead); seerLog survives the
 * seer's death (own log).
 */
export interface NightDayBaseView {
  round: number;
  composition: Record<Role, number>;
  seats: Seat[];
  scores: Record<PlayerId, number>;
  myRole: Role | null;
  myRoleCard: RoleCard | null;
  iAmAlive: boolean;
  wolfPack: PlayerId[] | null;
  seerLog: SeerLogEntry[] | null;
  narration: LText | null;
}

/**
 * The three night sub-phases share ONE view shape (the decoy protocol):
 * every viewer gets identical KEYS; only values differ for the real actor.
 */
export type NightDayView =
  | ({ phase: 'roleReveal'; acked: Record<PlayerId, boolean>; myAck: boolean } & NightDayBaseView)
  | ({
      phase: 'night';
      step: NightStep;
      acted: Record<PlayerId, boolean>;
      myActed: boolean;
      /** True iff the viewer is THIS sub-phase's living real actor. */
      amActor: boolean;
      /** Living wolves only, only during the wolves step. */
      wolfVotes: Record<PlayerId, PlayerId> | null;
      /** Living witch only, only during the witch step. */
      pendingKill: PlayerId | null;
      /** Witch only (her own potion shelf — survives her death). */
      witchState: { healLeft: boolean; poisonLeft: boolean } | null;
    } & NightDayBaseView)
  | ({ phase: 'dawn'; lastDawn: DawnReport } & NightDayBaseView)
  | ({
      phase: 'debate';
      lastDawn: DawnReport | null;
      ready: Record<PlayerId, boolean>;
      myReady: boolean;
    } & NightDayBaseView)
  | ({ phase: 'vote'; hasVoted: Record<PlayerId, boolean>; myVote: PlayerId | null } & NightDayBaseView)
  | ({ phase: 'lynchReveal'; lastLynch: LynchReport } & NightDayBaseView)
  | ({
      phase: 'over';
      finalRoles: Record<PlayerId, Role>;
      winners: Winners | null;
      endReason: EndReason;
    } & NightDayBaseView);
