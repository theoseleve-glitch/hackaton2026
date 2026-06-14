// IMPORT FIREWALL: type-only — erased at compile time; ranking server logic never enters the bundle.
import type {
  CloseResult, Epilogue, LText, RankingPrompt, RankingView, RoundResult,
} from '@bloop/game-ranking';

export const RANKING_GAME_IDS = ['le-classement'] as const;

export function isRankingGame(gameId: string | null): boolean {
  return gameId !== null && (RANKING_GAME_IDS as readonly string[]).includes(gameId);
}

/** The narrowed per-phase slices the RankingPlay render paths read. */
export type RankingRankView = Extract<RankingView, { phase: 'rank' }>;
export type RankingRevealView = Extract<RankingView, { phase: 'reveal' }>;
export type RankingOverView = Extract<RankingView, { phase: 'over' }>;
export type { CloseResult, Epilogue, LText, RankingPrompt, RankingView, RoundResult };

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

const isRecOf = (v: unknown, t: 'number' | 'boolean'): v is Record<string, never> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === t);

const isLText = (v: unknown): v is LText => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return typeof o.fr === 'string' && typeof o.en === 'string';
};

// prompt may be null past the deck; otherwise carries the composed line + poles.
const isPrompt = (v: unknown): v is RankingPrompt | null => {
  if (v === null) return true;
  if (typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === 'string' && isLText(o.text) && isLText(o.most) && isLText(o.least);
};

const isCloseResult = (v: unknown): v is CloseResult => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.playerId === 'string' && typeof o.distance === 'number'
    && typeof o.band === 'number' && typeof o.points === 'number';
};

const isResult = (v: unknown): v is RoundResult => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.promptId === 'string'
    && isStringArray(o.aggregate)
    && typeof o.ballots === 'object' && o.ballots !== null
    && Array.isArray(o.closeness) && o.closeness.every(isCloseResult)
    && isRecOf(o.pointsEarned, 'number')
    && isStringArray(o.bestReaders);
};

const isLeaderboardEntry = (v: unknown): boolean => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.playerId === 'string' && typeof o.score === 'number' && typeof o.rank === 'number';
};

const isEpilogue = (v: unknown): v is Epilogue => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return Array.isArray(o.leaderboard) && o.leaderboard.every(isLeaderboardEntry)
    && (typeof o.mvp === 'string' || o.mvp === null)
    && typeof o.topGap === 'number'
    && typeof o.closeFinish === 'boolean'
    && isStringArray(o.onFire);
};

/** Runtime narrow of the opaque `view` payload — never crash a render on drift. */
export function asRankingView(v: unknown): RankingView | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (!isRecOf(o.scores, 'number')) return null;
  if (o.phase === 'over') {
    return isEpilogue(o.epilogue) ? (v as RankingView) : null;
  }
  const roundOk = typeof o.round === 'number' && typeof o.totalRounds === 'number'
    && isPrompt(o.prompt ?? null) && isRecOf(o.streak, 'number');
  if (!roundOk) return null;
  if (o.phase === 'rank') {
    return isStringArray(o.roster) && isRecOf(o.hasSubmitted, 'boolean')
      && (o.myOrder === null || isStringArray(o.myOrder))
      ? (v as RankingView) : null;
  }
  if (o.phase === 'reveal') {
    return isResult(o.result) ? (v as RankingView) : null;
  }
  return null;
}

export { deviceLang, pickL, type Lang } from '../i18n';
