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
  /** Fraction of cast votes needed for 'done' (>= compare: ties -> done). */
  verdictThreshold: number;
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
  chooseMs: 15_000,
  promptMs: 45_000,
  verdictMs: 20_000,
  scoreMs: 6_000,
  passesPerPlayer: 2,
  allowedIntensities: ['soft', 'party'],
  donePoints: 10,
  passPoints: 3,
  chickenedPoints: 0,
  dareBonus: 5,
  verdictThreshold: 0.5,
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
  promptMs: 35_000,
  verdictMs: 15_000,
  scoreMs: 7_000,
  passesPerPlayer: 0, // ignored: escape is unlimited under forfeit-draw
  allowedIntensities: ['party', 'spicy'],
  donePoints: 10,
  passPoints: 3,
  chickenedPoints: 0,
  dareBonus: 0,
  verdictThreshold: 0.5,
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
  | { kind: 'verdict'; vote: Verdict };

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
    })
  | {
      phase: 'over';
      scores: Record<PlayerId, number>;
      rotation: PlayerId[];
      labels: TdLabels;
    };
