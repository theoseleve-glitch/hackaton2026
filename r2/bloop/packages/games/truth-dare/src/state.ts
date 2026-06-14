import type { PlayerId } from '@bloop/engine';
import type { Presence } from '@bloop/kit';

/** Bilingual UI string — the client picks a locale at render time. */
export interface LText {
  fr: string;
  en: string;
}

export type Intensity = 'soft' | 'party' | 'spicy';
export type Choice = 'truth' | 'dare';
/** truth-or-dare-2 pack split: 'fun' (crew) vs 'lover' (couples). */
export type Deck = 'fun' | 'lover';
export type Verdict = 'done' | 'chickened';
export type TurnVerdict = 'done' | 'chickened' | 'passed';

/**
 * CC-4 — fixed-enum escape reaction (zero free text → zero moderation surface).
 * NON-SCORING: a react NEVER resolves or scores a turn. One react per spectator
 * per reveal (first locks); public per-enum counts; owner-only echo; the buffer
 * is cleared at every turn entry. Only offered when the active player did NOT
 * complete (escaped/chickened) — the cowardice becomes a table event.
 */
export type Reaction = 'ouch' | 'respect' | 'coward';
export const REACTIONS: readonly Reaction[] = ['ouch', 'respect', 'coward'];

/** Public per-enum escape-reaction tally — aggregate only, leaks no individual. */
export interface ReactionCounts {
  ouch: number;
  respect: number;
  coward: number;
}

/** A derived drama stamp surfaced at score from the ALREADY-PUBLIC verdict tally (CC-5, no new secret). */
export type DramaTag = 'contested' | 'roasted' | null;

/**
 * One runtime content item — a cleaned mapping of the AUTHORED pack entry
 * (content/packs/truth-or-dare-2.json / truth-or-drink.json): `spicy`/`minAge`
 * are authoring/catalog metadata dropped at build; `deck` is derived from the
 * id prefix (`fun-*` / `lov-*`) for the truth-or-dare-2 pack family.
 * `choice:'dare'` rows double as the FORFEIT POOL under escapeMode
 * 'forfeit-draw' (truth-or-drink) — zero new content schema.
 */
export interface TdItem {
  id: string;
  choice: Choice;
  intensity: Intensity;
  text: LText;
  deck?: Deck;
  props?: boolean;
}

export interface TruthDareContent {
  items: TdItem[];
}

/** Localized client copy overrides (TRUTH_DARE@2 `labels` param). */
export interface TdLabels {
  /** The escape button: "Je passe" / "Je bois 🍺". */
  escape: LText;
  /** The completion claim: "C'est fait !" / "J'ai répondu". */
  claimDone: LText;
  verdictDone: LText;
  verdictChickened: LText;
  /** Stamp shown at score when the escape was taken: "PASSÉ" / "SANTÉ !". */
  forfeitStamp: LText;
}

/**
 * TRUTH_DARE@2 config. @1 fields per the 2026-06-10 canonical design;
 * the three strictly-ADDITIVE @2 params (wave2 synthesis §5.3/§5.4) are
 * `allowedChoices`, `escapeMode` and `labels`, plus the truth-or-dare-2
 * `deck` selector so the lover sibling stays config-only.
 */
export interface TruthDareConfig {
  /** Laps of the rotation before `over`. */
  totalRounds: number;
  chooseMs: number;
  promptMs: number;
  verdictMs: number;
  scoreMs: number;
  /** Lifetime passes per player — only consulted when escapeMode is 'pass'. */
  passesPerPlayer: number;
  allowedIntensities: Intensity[];
  donePoints: number;
  passPoints: number;
  chickenedPoints: number;
  /** Extra for a verdicted-done DARE over a TRUTH. */
  dareBonus: number;
  /**
   * CC-2 tier-weighted done bonus (P1-1): extra points a verdicted-DONE turn
   * earns for the prompt's intensity, so completing a spicier dare scores more
   * and later/spicier laps stay live for a trailing player. A pure
   * intensity->points map, DEFAULT FLAT (all zero = identity), so existing
   * exact-score tests stay green until a config opts in. Locked (NOT
   * host-tunable) so placement-XP comparability holds, exactly like
   * `spectatorPoints` — internal-scale only, never affects the cross-game XP
   * scale. Only added on a DONE verdict; pass/chicken are never tier-weighted.
   */
  tierBonus: Record<Intensity, number>;
  /**
   * CC-4 escape-react beat (P1-3): when true, non-active spectators may tap a
   * fixed-enum reaction (ouch/respect/coward) during the `score` reveal of a
   * turn the active player did NOT complete (escaped/chickened). Counts-only,
   * NON-SCORING, never resolves the turn. Defaults to false so the siblings
   * stay byte-untouched until they opt in.
   */
  reactOnEscape: boolean;
  /** Fraction of cast votes needed for 'done' (>= compare: ties -> done). */
  verdictThreshold: number;
  /**
   * Locked (NOT host-tunable, so placement-XP comparability holds): points a
   * spectator earns for a correct "call your shot" prediction (CC-1). Must stay
   * small (<= active done 10/15) so the seat is still where the game is won, but
   * non-zero so spectating has stakes. Defaults to 2.
   */
  spectatorPoints: number;
  /** @2: ['truth'] auto-resolves the choose phase (0 ms, straight to prompt). */
  allowedChoices: Choice[];
  /** @2: 'pass' = limited skip economy; 'forfeit-draw' = unlimited escape drawing a forfeit card from the dare deck. */
  escapeMode: 'pass' | 'forfeit-draw';
  /** truth-or-dare-2 pack deck filter; null = use every item in the pack. */
  deck: Deck | null;
  /** @2: localized client copy for the escape/claim/verdict buttons. */
  labels: TdLabels;
}

/** truth-or-dare-2 (FUN mainline config — wave2 §2.7). */
export const TRUTH_OR_DARE_2_CONFIG: TruthDareConfig = {
  totalRounds: 3,
  chooseMs: 9_000,
  promptMs: 38_000,
  verdictMs: 14_000,
  scoreMs: 8_500,
  passesPerPlayer: 2,
  allowedIntensities: ['soft', 'party'],
  donePoints: 10,
  passPoints: 3,
  chickenedPoints: 0,
  dareBonus: 5,
  // CC-2 default-identity: flat (no tier weighting) so the shipped 10/15 exact
  // scores are byte-unchanged. A pack opts in to escalation by overriding this.
  tierBonus: { soft: 0, party: 0, spicy: 0 },
  reactOnEscape: false,
  verdictThreshold: 0.5,
  spectatorPoints: 2,
  allowedChoices: ['truth', 'dare'],
  escapeMode: 'pass',
  deck: 'fun',
  labels: {
    escape: { fr: 'Je passe', en: 'Pass' },
    claimDone: { fr: "C'est fait !", en: 'Done!' },
    verdictDone: { fr: 'Fait ✅', en: 'Done ✅' },
    verdictChickened: { fr: 'Dégonflé 🐔', en: 'Chickened 🐔' },
    forfeitStamp: { fr: 'PASSÉ', en: 'PASSED' },
  },
};

/** Config-only LOVER sibling (wave2 §2.7: 2–8 players, party+spicy, 18+). */
export const TRUTH_OR_DARE_LOVER_CONFIG: TruthDareConfig = {
  ...TRUTH_OR_DARE_2_CONFIG,
  totalRounds: 4,
  passesPerPlayer: 3,
  allowedIntensities: ['party', 'spicy'],
  deck: 'lover',
};

/** truth-or-drink (wave2 §2.8 — TRUTH_DARE@2, truth-only, escape = drink). */
export const TRUTH_OR_DRINK_CONFIG: TruthDareConfig = {
  totalRounds: 2,
  chooseMs: 0, // auto-skipped: allowedChoices has one entry
  promptMs: 30_000,
  verdictMs: 12_000,
  scoreMs: 8_500,
  passesPerPlayer: 0, // ignored: escape is unlimited under forfeit-draw
  allowedIntensities: ['party', 'spicy'],
  donePoints: 10,
  passPoints: 3,
  chickenedPoints: 0,
  dareBonus: 0,
  tierBonus: { soft: 0, party: 0, spicy: 0 }, // CC-2 default-identity (no tier weighting)
  reactOnEscape: false,
  verdictThreshold: 0.5,
  spectatorPoints: 2,
  allowedChoices: ['truth'],
  escapeMode: 'forfeit-draw',
  deck: null,
  labels: {
    escape: { fr: 'Je bois 🍺', en: 'I drink 🍺' },
    claimDone: { fr: "J'ai répondu", en: 'I answered' },
    verdictDone: { fr: 'Vraie réponse ✅', en: 'Real answer ✅' },
    verdictChickened: { fr: 'Esquive 🐔', en: 'Dodged 🐔' },
    forfeitStamp: { fr: 'SANTÉ !', en: 'CHEERS!' },
  },
};

export type TdPhase = 'choose' | 'prompt' | 'verdict' | 'score' | 'over';

/** The drawn prompt of the current turn — public from `prompt` on. */
export interface ActivePrompt {
  choice: Choice;
  intensity: Intensity;
  id: string;
  text: LText;
}

/** Result of the just-resolved turn, shown during `score`. */
export interface TdResult {
  activePlayer: PlayerId;
  choice: Choice;
  intensity: Intensity;
  promptText: LText;
  verdict: TurnVerdict;
  /** Public only from `score` on — the in-flight per-voter map stays hidden. */
  tally: { done: number; chickened: number };
  pointsAwarded: number;
  /** Drawn from the dare deck when the escape was taken under 'forfeit-draw'; null otherwise. */
  forfeitText: LText | null;
  /**
   * "Call your shot" outcome (CC-1) — COUNTS ONLY, no names (TK10 anti-griefing
   * floor preserved). `correct`: spectators whose prediction matched the final
   * verdict; `total`: spectators who predicted at all; `pointsEach`: the
   * spectatorPoints each correct predictor was awarded.
   */
  spectatorTally: { correct: number; total: number; pointsEach: number };
  /**
   * CC-5 drama stamp (P1-2) — DERIVED at score from the already-public verdict
   * `tally`, no new in-match secret and no per-voter names (TK10 floor intact):
   *   'contested' — a close split (>=1 vote each side, |done-chickened| <= 1):
   *                 "la salle est divisée".
   *   'roasted'   — the room mostly called bullshit (chickened strictly the
   *                 majority of cast votes): "tout le monde a dit non".
   *   null        — neither (clear/uncontested, or no votes cast).
   * Pass/chicken/escape turns (no contested vote) are always null.
   */
  dramaTag: DramaTag;
  /**
   * CC-4 escape-react beat (P1-3) — PUBLIC per-enum counts of spectator
   * reactions accumulated during this reveal, OR null when the beat is off
   * (reactOnEscape false) or the turn was completed (done). Aggregate only; no
   * individual reaction is ever published.
   */
  reactions: ReactionCounts | null;
}

export interface TruthDareState {
  config: TruthDareConfig;
  /** Seeds the per-turn auto-pick coin; never surfaced by view(). */
  seed: string;
  players: PlayerId[];
  connected: Presence;

  // --- rotation / progress ---
  /** Seeded permutation of players = the lap order (fixed for the game). */
  rotation: PlayerId[];
  turnIndex: number;
  /** Monotonic, ++ on each turn entry; powers phaseKey uniqueness. */
  turnSeq: number;
  /** 0-based lap counter. */
  round: number;
  phase: TdPhase;

  // --- current turn ---
  activePlayer: PlayerId;
  choice: Choice | null;
  prompt: ActivePrompt | null;
  outcome: TurnVerdict | null;

  // --- content pools ---
  /** HIDDEN: full item catalog by id — only the current prompt/lastResult text ever surfaces. */
  itemsById: Record<string, TdItem>;
  /** HIDDEN: ordered draw decks per `${choice}:${intensity}` (seeded shuffle at init). */
  decks: Record<string, string[]>;
  /** HIDDEN: per-deck next-undrawn cursor. */
  cursors: Record<string, number>;
  /** HIDDEN: ids already served, so re-draws never repeat. */
  usedPromptIds: string[];

  // --- verdict ---
  /** HIDDEN: per-voter verdict buffer; promoted to a public tally only at score. */
  verdicts: Record<PlayerId, Verdict>;

  // --- call-your-shot predictions (CC-1) ---
  /**
   * HIDDEN: per-spectator "call your shot" prediction buffer (done|chickened),
   * placed during `prompt` by non-active connected players. A SEPARATE buffer
   * from `verdicts` — a prediction is NEVER an `acted` verdict entry and is
   * never counted toward the verdict's `allActed` early-resolve. Resolved
   * against the turn's FINAL public outcome at score; only owner-echo + an
   * aggregate count ever surface (per-voter identity NEVER exposed, TK10).
   */
  predictions: Record<PlayerId, Verdict>;

  // --- escape-react beat (CC-4) ---
  /**
   * HIDDEN: per-spectator escape reaction (ouch|respect|coward), placed during
   * the `score` reveal of a NON-completed turn when `reactOnEscape` is on. A
   * SEPARATE buffer — a reaction is NON-SCORING and NEVER an `acted`/verdict
   * entry, so it cannot touch any early-resolve. Only the owner-echo + public
   * per-enum counts ever surface (per-spectator identity NEVER exposed, TK10);
   * cleared at every turn entry.
   */
  reactions: Record<PlayerId, Reaction>;

  // --- persistent ---
  scores: Record<PlayerId, number>;
  passesLeft: Record<PlayerId, number>;
  lastResult: TdResult | null;
}

export type TruthDareAction =
  | { kind: 'chooseType'; choice: Choice }
  | { kind: 'declare'; result: Verdict }
  /** The escape button: pass (limited) or drink/forfeit (unlimited), per escapeMode. */
  | { kind: 'pass' }
  | { kind: 'verdict'; vote: Verdict }
  /** CC-1 "call your shot": a non-active spectator's hidden done|chickened prediction, placed during `prompt`. */
  | { kind: 'predict'; bet: Verdict }
  /** CC-4 escape react: a non-active spectator's fixed-enum reaction during a non-completed turn's `score` reveal. NON-SCORING. */
  | { kind: 'react'; reaction: Reaction };

/** Scaffolding present in every non-over view (rotation rail + HUD). */
export interface TdCommonView {
  round: number;
  totalRounds: number;
  turnSeq: number;
  rotation: PlayerId[];
  activePlayer: PlayerId;
  connected: Record<PlayerId, boolean>;
  scores: Record<PlayerId, number>;
  passesLeft: Record<PlayerId, number>;
  escapeMode: 'pass' | 'forfeit-draw';
  labels: TdLabels;
}

export type TruthDareView =
  | (TdCommonView & {
      phase: 'choose';
      youAreActive: boolean;
      choices: Choice[];
    })
  | (TdCommonView & {
      phase: 'prompt';
      youAreActive: boolean;
      choice: Choice;
      intensity: Intensity;
      promptText: LText;
      /** Viewer-specific: active AND the escape is available to them. */
      canPass: boolean;
      /** CC-1 viewer-specific: non-active && connected && not-yet-predicted. */
      youCanPredict: boolean;
      /** CC-1 owner-only echo of the viewer's own prediction — never anyone else's. */
      youPredicted: Verdict | null;
      /** CC-1 aggregate: how many spectators have called their shot (count only, no names). */
      predictionsIn: number;
    })
  | (TdCommonView & {
      phase: 'verdict';
      youAreActive: boolean;
      choice: Choice;
      intensity: Intensity;
      promptText: LText;
      /** What the active player CLAIMED (always 'done' — the only path in). */
      outcome: TurnVerdict;
      youCanVote: boolean;
      /** Own vote echoed back — never anyone else's. */
      youVoted: Verdict | null;
      /** Count only — individual votes stay hidden until score. */
      votesIn: number;
      votersExpected: number;
    })
  | (TdCommonView & {
      phase: 'score';
      lastResult: TdResult;
      /** Who is up next, or null when the game ends after this reveal. */
      nextActive: PlayerId | null;
      /** CC-4 PUBLIC live per-enum escape-reaction counts, or null when the beat is off / the turn was completed. */
      reactionCounts: ReactionCounts | null;
      /** CC-4 owner-only echo: this viewer's own escape reaction, or null. */
      youReacted: Reaction | null;
      /** CC-4 may this viewer react now (escape beat on, non-active, connected, not yet reacted)? */
      youCanReact: boolean;
    })
  | {
      phase: 'over';
      scores: Record<PlayerId, number>;
      rotation: PlayerId[];
      labels: TdLabels;
    };
