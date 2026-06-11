// IMPORT FIREWALL: type-only — erased at compile time; option-vote server logic never enters the bundle.
import type { Ballot, LText, OptionVoteView, RoundResult } from '@bloop/game-option-vote';

export const OPTION_VOTE_GAME_IDS = ['tu-preferes', 'gauche-ou-droite'] as const;

export function isOptionVoteGame(gameId: string | null): boolean {
  return gameId !== null && (OPTION_VOTE_GAME_IDS as readonly string[]).includes(gameId);
}

const isRec = (v: unknown, t: 'number' | 'boolean'): v is Record<string, never> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === t);

const isLText = (v: unknown): v is LText => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.fr === 'string' && typeof o.en === 'string';
};

const isItem = (v: unknown): boolean => {
  if (v === null) return true; // item may be null past the pool
  if (typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === 'string' && isLText(o.optionA) && isLText(o.optionB);
};

const isBallot = (v: unknown): v is Ballot | null => {
  if (v === null) return true;
  if (typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return o.pick === 'A' || o.pick === 'B';
};

const isResult = (v: unknown): v is RoundResult => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  const counts = o.counts as Record<string, unknown> | null;
  return typeof counts === 'object' && counts !== null
    && typeof counts.A === 'number' && typeof counts.B === 'number'
    && (o.majority === 'A' || o.majority === 'B' || o.majority === null)
    && typeof o.picks === 'object' && o.picks !== null
    && Array.isArray(o.awarded);
};

/** Runtime narrow of the opaque `view` payload — never crash a render on drift. */
export function asOptionVoteView(v: unknown): OptionVoteView | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const scoringOk = o.scoring === 'predict-majority' || o.scoring === 'majority-herd';
  if (!scoringOk || !isRec(o.scores, 'number')) return null;
  if (o.phase === 'over') return isRec(o.minorityCount, 'number') ? (v as OptionVoteView) : null;
  const roundOk = typeof o.round === 'number' && typeof o.totalRounds === 'number' && isItem(o.item ?? null);
  if (!roundOk) return null;
  if (o.phase === 'choose') {
    return isRec(o.hasSubmitted, 'boolean') && isBallot(o.myBallot ?? null) ? (v as OptionVoteView) : null;
  }
  if (o.phase === 'reveal') {
    return isResult(o.result) && typeof o.hasDebate === 'boolean' ? (v as OptionVoteView) : null;
  }
  if (o.phase === 'debate') {
    return isResult(o.result) && typeof o.skipCount === 'number'
      && typeof o.skipNeeded === 'number' && typeof o.mySkip === 'boolean'
      ? (v as OptionVoteView) : null;
  }
  return null;
}

export { deviceLang, pickL, type Lang } from '../i18n';
