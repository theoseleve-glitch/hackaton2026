// IMPORT FIREWALL: type-only — erased at compile time; who-said-that server logic never enters the bundle.
import type {
  LText, RoundResult, WhoSaidThatEpilogue, WhoSaidThatStatement, WhoSaidThatView,
} from '@bloop/game-who-said-that';

export const WHO_SAID_THAT_GAME_IDS = ['qui-a-dit-ca'] as const;

export function isWhoSaidThatGame(gameId: string | null): boolean {
  return gameId !== null && (WHO_SAID_THAT_GAME_IDS as readonly string[]).includes(gameId);
}

/** The narrowed per-phase slices the WhoSaidThatPlay render paths read. */
export type WhoSaidThatConfessView = Extract<WhoSaidThatView, { phase: 'confess' }>;
export type WhoSaidThatAttributeView = Extract<WhoSaidThatView, { phase: 'attribute' }>;
export type WhoSaidThatRevealView = Extract<WhoSaidThatView, { phase: 'reveal' }>;
export type WhoSaidThatOverView = Extract<WhoSaidThatView, { phase: 'over' }>;
export type { LText, RoundResult, WhoSaidThatEpilogue, WhoSaidThatStatement, WhoSaidThatView };

const isRecOf = (v: unknown, t: 'number' | 'boolean' | 'string'): v is Record<string, never> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === t);

const isLText = (v: unknown): v is LText => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return typeof o.fr === 'string' && typeof o.en === 'string';
};

// A statement card flows through AS-IS: a plain string (legacy single locale) or a {fr,en} card.
const isStatement = (v: unknown): v is WhoSaidThatStatement => typeof v === 'string' || isLText(v);

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

// accuser -> accused record (every value is a roster id).
const isStringRec = (v: unknown): boolean =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === 'string');

const isResult = (v: unknown): v is RoundResult => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return isStringArray(o.confessors)
    && isStringRec(o.accusations)
    && isStringArray(o.hits)
    && isStringArray(o.ghosts)
    && isRecOf(o.delta, 'number');
};

const isEpilogue = (v: unknown): v is WhoSaidThatEpilogue => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.closeFinish === 'boolean'
    && typeof o.topGap === 'number'
    && (typeof o.mvp === 'string' || o.mvp === null);
};

/** Runtime narrow of the opaque `view` payload — never crash a render on drift. */
export function asWhoSaidThatView(v: unknown): WhoSaidThatView | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (!isRecOf(o.scores, 'number')) return null;
  if (o.phase === 'over') {
    return isEpilogue(o.cliffhanger) ? (v as WhoSaidThatView) : null;
  }
  const roundOk = typeof o.round === 'number' && typeof o.totalRounds === 'number'
    && isStatement(o.statement);
  if (!roundOk) return null;
  if (o.phase === 'confess') {
    return isRecOf(o.hasConfessed, 'boolean')
      && (o.myConfession === null || typeof o.myConfession === 'boolean')
      ? (v as WhoSaidThatView) : null;
  }
  if (o.phase === 'attribute') {
    return typeof o.confessorCount === 'number'
      && isRecOf(o.hasAccused, 'boolean')
      && (o.myAccusation === null || typeof o.myAccusation === 'string')
      ? (v as WhoSaidThatView) : null;
  }
  if (o.phase === 'reveal') {
    return isResult(o.result) ? (v as WhoSaidThatView) : null;
  }
  return null;
}

export { deviceLang, pickL, type Lang } from '../i18n';
