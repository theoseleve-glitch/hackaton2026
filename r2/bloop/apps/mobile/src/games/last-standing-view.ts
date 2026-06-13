// IMPORT FIREWALL: type-only — erased at compile time; last-standing server logic never enters the bundle.
import type { JudgeVote, LastStandingView, LText, TurnResult } from '@bloop/game-last-standing';

export const LAST_STANDING_GAME_IDS = ['jeu-du-theme'] as const;

export function isLastStandingGame(gameId: string | null): boolean {
  return gameId !== null && (LAST_STANDING_GAME_IDS as readonly string[]).includes(gameId);
}

const isRec = (v: unknown, t: 'number' | 'boolean'): v is Record<string, never> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === t);

const isLText = (v: unknown): v is LText => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.fr === 'string' && typeof o.en === 'string';
};

const isStrArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

/** The drawn card is null only during a pre-draw flicker — both shapes are render-safe. */
const isCurrent = (v: unknown): boolean => {
  if (v === null) return true;
  if (typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return isLText(o.theme) && typeof o.letter === 'string';
};

const OUTCOMES = ['valid', 'rejected', 'timeout', 'gaveUp', 'left'] as const;

const isTurnResult = (v: unknown): v is TurnResult | null => {
  if (v === null) return true;
  if (typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (typeof o.player !== 'string' || !(OUTCOMES as readonly unknown[]).includes(o.outcome)) return false;
  const tally = o.tally as Record<string, unknown> | null;
  return typeof tally === 'object' && tally !== null
    && typeof tally.valid === 'number' && typeof tally.reject === 'number';
};

const isVote = (v: unknown): v is JudgeVote | null => v === null || v === 'valid' || v === 'reject';

/** Runtime narrow of the opaque `view` payload — never crash a render on drift. */
export function asLastStandingView(v: unknown): LastStandingView | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (!isRec(o.scores, 'number') || !isStrArray(o.rotation) || !isRec(o.wordsValidated, 'number')) return null;
  if (o.phase === 'over') return v as LastStandingView;
  const baseOk = typeof o.round === 'number' && typeof o.totalRounds === 'number'
    && typeof o.turnSeq === 'number'
    && isRec(o.alive, 'boolean') && isRec(o.connected, 'boolean')
    && (o.spotlight === null || typeof o.spotlight === 'string')
    && isCurrent(o.current ?? null)
    && typeof o.lapInRound === 'number' && typeof o.sayMsThisLap === 'number'
    && isTurnResult(o.lastTurn ?? null);
  if (!baseOk) return null;
  if (o.phase === 'draw' || o.phase === 'result') return v as LastStandingView;
  if (o.phase === 'say') {
    return typeof o.youAreSpotlight === 'boolean' && typeof o.canGiveUp === 'boolean'
      ? (v as LastStandingView) : null;
  }
  if (o.phase === 'judge') {
    return typeof o.youCanVote === 'boolean' && isVote(o.myVote ?? null)
      && typeof o.votesIn === 'number' && typeof o.votersExpected === 'number'
      ? (v as LastStandingView) : null;
  }
  if (o.phase === 'roundEnd') {
    return isStrArray(o.roundWinners) && typeof o.pointsAwarded === 'number'
      ? (v as LastStandingView) : null;
  }
  return null;
}

export { deviceLang, pickL, type Lang } from '../i18n';
