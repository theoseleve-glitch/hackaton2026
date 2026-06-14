import type { PlayerId } from '@bloop/engine';
import type { RevealStep } from '@bloop/kit';

export type { RevealStep };

/** Bilingual content string — carried through views AS-IS; the client picks a locale at render time. */
export interface LText {
  fr: string;
  en: string;
}

/**
 * One designation card. Legacy packs (tracer-core) author plain strings;
 * wave-2 bilingual packs (pires-potes) author {fr,en} objects. The reducer
 * never inspects a prompt — it flows from the pack through view() untouched,
 * so a mixed array is also valid.
 */
export type TracerPrompt = string | LText;

export interface TracerConfig {
  totalRounds: number;
  voteMs: number;
  revealMs: number;
  /**
   * CC-2 final-round weighting (comeback lever, brief P1-2). The award at the
   * verdict beat is multiplied by `roundMultiplier(round, totalRounds, …)` so
   * the climax round can decide the crown and no round is a dead rubber.
   *
   * DEFAULTS TO IDENTITY: omitted / undefined / <= 0 / non-finite => ×1, so
   * every existing exact-score test stays byte-for-byte green. Only the cases
   * that explicitly opt into a multiplier are re-baselined. Magnitude of the
   * late-round multiplier; `multiplierRounds` (default 1 = final round only)
   * sets how many trailing rounds get it, `doubleFromRound` is an absolute
   * fixed-round trigger that takes precedence when set. Passed straight to the
   * kit `roundMultiplier` — same clamps, same identity default.
   */
  finalRoundMultiplier?: number;
  multiplierRounds?: number;
  doubleFromRound?: number;
  /**
   * CC-5 close-finish threshold for the over-view cliffhanger payload. The
   * `closeFinish` flag is true when the top-2 score gap is at most this many
   * points. Default 1 (a one-card crown reads as a nailbiter). A negative /
   * non-finite value disables the flag (kit `isCloseFinish` contract).
   */
  closeFinishThreshold?: number;
}

export const DEFAULT_CONFIG: TracerConfig = {
  totalRounds: 3,
  voteMs: 20_000,
  revealMs: 5_000,
};

/**
 * pires-potes (Pires Potes / Worst Mates) — design §2.3, by-game spec params:
 * 7 rounds × (18 s vote + 6 s reveal) ≈ 3 min session. Pure config on the
 * tracer machinery (VOTE@1): vote a PLAYER, most-voted "wins the shame card".
 */
export const PIRES_POTES_CONFIG: TracerConfig = {
  totalRounds: 7,
  voteMs: 18_000,
  revealMs: 6_000,
};

export type TracerPhase = 'vote' | 'reveal' | 'over';

export interface TracerState {
  config: TracerConfig;
  players: PlayerId[];
  prompts: TracerPrompt[];
  round: number;
  phase: TracerPhase;
  /**
   * Two-beat reveal cursor (CC-3). Only meaningful while `phase === 'reveal'`:
   * 'suspense' holds the scoreboard frozen at its PRE-round value (the breath),
   * 'verdict' is the slam where the deferred `+1` lands and the room-designated
   * player is named. `null` outside the reveal phase. Deterministic; advanced
   * only by a deadline hop, never by wall clock.
   */
  revealStep: RevealStep | null;
  /** HIDDEN: never exposed through view(). */
  votes: Record<PlayerId, PlayerId>;
  scores: Record<PlayerId, number>;
  /**
   * CC-5 hot-seat tracking (kit `nextStreak`). Derived ENTIRELY from PUBLIC
   * reveals: at each verdict beat every designated (room-pointed-at) player's
   * consecutive-designation `current` streak increments, everyone else resets
   * to 0, and `best` keeps that player's longest run. This is NOT a new secret
   * — `designated` is already published every reveal, so `best` is just an
   * accumulated function of already-public data. The over-view cliffhanger
   * reads `best` to name the longest hot-seat streak; the reveal view surfaces
   * the live `current` map as the "X est en PLS / on a roll" tease.
   */
  hotStreaks: Record<PlayerId, { current: number; best: number }>;
}

export type TracerAction = { kind: 'vote'; target: PlayerId };

export type TracerView =
  | {
      phase: 'vote';
      round: number;
      totalRounds: number;
      prompt: TracerPrompt;
      hasVoted: Record<PlayerId, boolean>;
      myVote: PlayerId | null;
      scores: Record<PlayerId, number>;
    }
  | {
      phase: 'reveal';
      round: number;
      totalRounds: number;
      prompt: TracerPrompt;
      tally: Record<PlayerId, number>;
      /**
       * 'suspense' = the breath (scores FROZEN at pre-round value), 'verdict' =
       * the slam (scores show the climbed total). The two-beat reveal (CC-3).
       */
      revealStep: RevealStep;
      /**
       * Points just awarded this round, per player (kit `scoreDelta`). EMPTY in
       * 'suspense' (nothing has landed yet) so the client can hold, populated in
       * 'verdict' so it can animate the climb honestly. Derived from PUBLIC
       * scores — never leaks ballots.
       */
      delta: Record<PlayerId, number>;
      /**
       * The room-DESIGNATED player(s): everyone tied at the max tally (i.e. who
       * "wins the card"). Aggregate-derived from the public tally, identical for
       * every viewer — names WHO the room pointed at, never WHO voted. Empty on
       * a zero-vote round.
       */
      designated: PlayerId[];
      /**
       * CC-2 — the score multiplier IN EFFECT for this round (kit
       * `roundMultiplier`). 1 on a normal round, `finalRoundMultiplier` on a
       * weighted climax round so the client can render "ROUND DOUBLE" and the
       * verdict delta reads as caused, not arbitrary. Public, viewer-identical.
       */
      roundMultiplier: number;
      /**
       * CC-5 hot-seat tease (kit `nextStreak`). Per-player CURRENT consecutive
       * designation streak AFTER this verdict (empty during suspense — the
       * streak only updates on the slam). Derived from public designations; lets
       * the client surface "X est sur une lancée" on a 2+ run. Viewer-identical.
       */
      hotSeat: Record<PlayerId, number>;
      scores: Record<PlayerId, number>;
    }
  | {
      phase: 'over';
      scores: Record<PlayerId, number>;
      /**
       * CC-5 cliffhanger epilogue (cross-game synthesis §1, CC-5). Derived at
       * 'over' from ALREADY-PUBLIC state only — final `scores` (kit
       * `isCloseFinish` / `mvp`) and the public hot-seat history (kit
       * `statLeaders` over `best`). No new in-match secret. Feeds the shell
       * Oracle roast + rematch CTA.
       */
      cliffhanger: TracerEpilogue;
    };

/** CC-5 over-view epilogue payload, derived from PUBLIC end-of-match state. */
export interface TracerEpilogue {
  /** True when the top-2 score gap is within `closeFinishThreshold` (a nailbiter). */
  closeFinish: boolean;
  /** Top-2 score gap (0 on a tie / solo). Drives "lost by N cards" chrome. */
  topGap: number;
  /** The sole crowned player, or null on a contested (tied-for-first) crown. */
  mvp: PlayerId | null;
  /** The longest hot-seat run any player held, and who held it (kit `statLeaders`). */
  longestHotSeat: { value: number; players: PlayerId[] };
}
