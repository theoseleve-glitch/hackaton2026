// IMPORT FIREWALL: type-only — erased at compile time; option-vote server logic never enters the bundle.
import type {
  Ballot, Cliffhanger, LText, OptionVoteView, PredictionReveal, RoundResult, StreakTag,
} from '@bloop/game-option-vote';

export const OPTION_VOTE_GAME_IDS = ['tu-preferes', 'gauche-ou-droite', 'courtroom', 'red-green-flag'] as const;

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

// CC-1: one public, by-name majority-prediction call-out promoted at reveal.
const isPredictionReveal = (v: unknown): v is PredictionReveal => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.playerId === 'string'
    && (o.predicted === 'A' || o.predicted === 'B')
    && typeof o.correct === 'boolean';
};

// Tolerant: drift that omits `predictions` is treated as an empty call-out list.
const isPredictionList = (v: unknown): v is PredictionReveal[] =>
  v === undefined || (Array.isArray(v) && v.every(isPredictionReveal));

// P1 CC-2: one public, by-name streak TAG promoted at reveal ("🔥 x3").
const isStreakTag = (v: unknown): v is StreakTag => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.playerId === 'string'
    && typeof o.streak === 'number'
    && typeof o.bonus === 'number';
};

// Tolerant: drift that omits `streaks` is treated as an empty tag list.
const isStreakList = (v: unknown): v is StreakTag[] =>
  v === undefined || (Array.isArray(v) && v.every(isStreakTag));

// P1 CC-5: the over-screen cliffhanger epilogue, derived from public final scores.
const isLeaderboardEntry = (v: unknown): boolean => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.playerId === 'string' && typeof o.score === 'number' && typeof o.rank === 'number';
};
const isCliffhanger = (v: unknown): v is Cliffhanger => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return Array.isArray(o.leaderboard) && o.leaderboard.every(isLeaderboardEntry)
    && typeof o.topGap === 'number'
    && typeof o.closeFinish === 'boolean'
    && (typeof o.mvp === 'string' || o.mvp === null);
};

const isResult = (v: unknown): v is RoundResult => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  const counts = o.counts as Record<string, unknown> | null;
  return typeof counts === 'object' && counts !== null
    && typeof counts.A === 'number' && typeof counts.B === 'number'
    && (o.majority === 'A' || o.majority === 'B' || o.majority === null)
    && typeof o.picks === 'object' && o.picks !== null
    && Array.isArray(o.awarded)
    // CC-1 KEYSTONE — the public predictions-by-name the reveal renders.
    && isPredictionList(o.predictions)
    // P1 CC-2 — public "🔥 xN" streak tags (tolerant of pre-feature drift).
    && isStreakList(o.streaks)
    // P1 tie-relief — the "perfect split, everyone +1" banner flag.
    && (typeof o.tieReliefApplied === 'boolean' || o.tieReliefApplied === undefined);
};

/** Runtime narrow of the opaque `view` payload — never crash a render on drift. */
export function asOptionVoteView(v: unknown): OptionVoteView | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const scoringOk = o.scoring === 'predict-majority' || o.scoring === 'majority-herd';
  if (!scoringOk || !isRec(o.scores, 'number')) return null;
  if (o.phase === 'over') {
    // CC-1 KEYSTONE — the final round's named predictions persist onto the podium.
    // P1 CC-5 KEYSTONE — the cliffhanger epilogue (tolerant of pre-feature drift).
    return isRec(o.minorityCount, 'number') && isPredictionList(o.lastPredictions)
      && (o.cliffhanger === undefined || isCliffhanger(o.cliffhanger))
      ? (v as OptionVoteView) : null;
  }
  const roundOk = typeof o.round === 'number' && typeof o.totalRounds === 'number' && isItem(o.item ?? null)
    // P1 CC-2 — public per-player streak counters ride every in-match phase.
    && (isRec(o.streak, 'number') || o.streak === undefined);
  if (!roundOk) return null;
  if (o.phase === 'choose') {
    // CC-1 KEYSTONE — owner-only echo (A/B/null) + aggregate "how many predicted".
    // Tolerant of pre-feature drift: missing fields read as "no prediction channel".
    const predOk = (o.myPrediction === 'A' || o.myPrediction === 'B'
        || o.myPrediction === null || o.myPrediction === undefined)
      && (typeof o.predictedCount === 'number' || o.predictedCount === undefined);
    return isRec(o.hasSubmitted, 'boolean') && isBallot(o.myBallot ?? null) && predOk
      ? (v as OptionVoteView) : null;
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
