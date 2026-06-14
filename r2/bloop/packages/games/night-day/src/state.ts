import type { PlayerId } from '@bloop/engine';
import type { Presence, SideBetBuffer } from '@bloop/kit';

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
  /**
   * P1-1 first-night shield (A/B, opt-in — DEFAULT FALSE so the shipped loop is
   * byte-identical). When true, a wolf kill on round 0 is converted to a public
   * "mark" instead of a death: the marked player is announced at dawn as
   * "attacked but survived the first night" (NO role leak) and only dies if the
   * wolves target them again on a later night. Guarantees nobody is a
   * 10-minute ghost from the literal first dawn. Poison and lynch are NEVER
   * shielded — only the round-0 wolf kill. Off => no `marked` ever appears.
   */
  firstNightShield: boolean;
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
  // P1-1 A/B: OFF by default — the live loop is unchanged; flip per-room to test.
  firstNightShield: false,
  maxRounds: 10,
  roleRevealMs: 10_000,
  nightSeerMs: 20_000,
  nightWolvesMs: 28_000,
  nightWitchMs: 18_000,
  dawnMs: 12_000,
  debateMs: 90_000,
  voteMs: 30_000,
  lynchRevealMs: 9_000,
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
  /**
   * P1-1 first-night shield: the player the wolves struck on round 0 who
   * SURVIVED (the strike was converted to a mark). Public BY DESIGN — "you were
   * hunted night 1, and you're still here" — but carries NO role information and
   * never names a wolf, so the redaction surface is unchanged. `null` whenever
   * the shield is off, no one was struck, or it is not the first dawn.
   */
  marked: PlayerId | null;
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
  /**
   * HIDDEN (CC-1 hidden side-bet) — "Night Read". Per ROUND, each living
   * non-actor's private hunch about who is a wolf. The read locks the seat
   * exactly like `nightAck` (same `nightActed` entry, same all-acted exit) but
   * stores the predicted target in this strictly-more-hidden map. Owner-only
   * echo + public count pre-`over`; the full map is revealed ONLY at `over`,
   * where each correct read pays a small COSMETIC accuracy bonus (never folded
   * into the 0–3 placement scale). Keyed by round so a fresh read opens each
   * night; one read per player per round (re-read rejected => same reference).
   */
  nightReads: Record<number, SideBetBuffer<PlayerId>>;
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
  /**
   * P1-1 first-night shield: the player marked-not-killed on round 0 (public via
   * the dawn report, so PUBLIC here too). A second wolf strike on this player on
   * a later night kills them normally. `null` when the shield is off or no one
   * was shielded. Carries no role info — only survival.
   */
  marked: PlayerId | null;
  /**
   * HIDDEN until `over`: the round each dead player died on (wolf kill / poison /
   * lynch). Recorded at the resolution that flips `alive` to false; revealed only
   * in the `over` epilogue to derive `survivedTo` / `cleanestWolf`. Never in a
   * pre-over view (a death's round is already public via lastDawn/lastLynch, but
   * this aggregate is surfaced only at `over` to keep the pre-over surface tight).
   */
  diedRound: Record<PlayerId, number>;
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
  /** CC-1 Night Read: a living non-actor's private wolf-hunch. Locks the seat like nightAck. */
  | { kind: 'nightRead'; target: PlayerId }
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
 * CC-5 — match epilogue payload (P1-2). Derived PURELY at `over` from
 * already-public over-state (`finalRoles`, `alive`, `diedRound`, and the Night
 * Read accuracy already tracked) — NO new in-match secret, no reducer change.
 * Feeds the session-shell Oracle roast + the rematch CTA ("the wolf who fooled
 * you was {name} — run it back?"). Cosmetic only: never touches placement
 * `scores`. Deterministic (stable id-sorted ties; no rng, no wall-clock).
 */
export interface MatchEpilogue {
  /**
   * Town MVP — the player whose nightly reads clocked the most wolves. `null`
   * on a tie for the top accuracy or when nobody read a wolf (no contested
   * crown). Mirrors kit `statLeaders` semantics on the read-accuracy map.
   */
  townMvp: PlayerId | null;
  /** The best read-accuracy value any player reached (0 when nobody clocked a wolf). */
  bestReadAccuracy: number;
  /** Every player tied at `bestReadAccuracy` (empty when it is 0), id-sorted. */
  bestSeers: PlayerId[];
  /**
   * The wolf who survived longest undetected — the wolf with the highest
   * `survivedTo`. `null` on a tie or when there are no wolves. The rematch hook.
   */
  cleanestWolf: PlayerId | null;
  /**
   * Per player: the last round they were still alive. A survivor (alive at
   * `over`) reports the final round; a dead player reports the round they died.
   * Public-derived; the headline "you lasted N nights" stat.
   */
  survivedTo: Record<PlayerId, number>;
}

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
      /**
       * CC-1 Night Read — OWNER-ONLY echo of the viewer's own read THIS round
       * (the player they marked), or null if they have not read. A uniform key
       * on EVERY night view (decoy parity); the VALUE is redacted owner-only so
       * a non-owner can never recover another player's hunch. NO public count is
       * exposed here: a per-round read count would let an observer distinguish a
       * read from a sleep-tap in aggregate, breaking the decoy indistinguishability
       * (the `acted` lock — identical for read and ack — is the only public signal).
       * The full read map is disclosed only at `over` (see `nightReadAccuracy`).
       */
      myNightRead: PlayerId | null;
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
      /**
       * CC-1 Night Read reveal — surfaced ONLY at `over` (the reads are public
       * alongside the final roles). Per player: how many of their nightly reads
       * correctly clocked a wolf. Cosmetic only; the placement `scores` above
       * are untouched by it.
       */
      nightReadAccuracy: Record<PlayerId, number>;
      /**
       * CC-5 match epilogue (P1-2) — town MVP / best seers / cleanest wolf /
       * survived-to, derived purely from this public over-state. Cosmetic; for
       * the shell's roast + rematch CTA. Never perturbs `scores`.
       */
      epilogue: MatchEpilogue;
    } & NightDayBaseView);
