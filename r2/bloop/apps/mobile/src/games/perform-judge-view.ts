// IMPORT FIREWALL: type-only — erased at compile time; perform-judge server logic never enters the bundle.
import type { LText, PerformJudgeView, TurnResult } from '@bloop/game-perform-judge';

export const PERFORM_JUDGE_GAME_IDS = [
  'devine-l-action',
  'devine-l-objet',
  'mime-inverse',
  'double-le-mouvement',
] as const;

export function isPerformJudgeGame(gameId: string | null): boolean {
  return gameId !== null && (PERFORM_JUDGE_GAME_IDS as readonly string[]).includes(gameId);
}

const isRec = (v: unknown, t: 'number' | 'boolean'): v is Record<string, never> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === t);

const isLText = (v: unknown): v is LText => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.fr === 'string' && typeof o.en === 'string';
};

const isMode = (v: unknown): boolean =>
  v === 'guided' || v === 'credit' || v === 'puppet' || v === 'rate';

const isNullOrLText = (v: unknown): boolean => v === null || v === undefined || isLText(v);

const isSecret = (v: unknown): boolean => {
  if (v === null || v === undefined) return true;
  if (typeof v !== 'object') return false;
  return isLText((v as Record<string, unknown>).prompt);
};

const isConstraint = (v: unknown): boolean => {
  if (v === null || v === undefined) return true;
  if (typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return isLText(o.label) && isLText(o.rule);
};

/** CC-4 — public per-enum reaction tally { fire, laugh, cringe }. */
const isReactionCounts = (v: unknown): boolean => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.fire === 'number' && typeof o.laugh === 'number' && typeof o.cringe === 'number';
};

/** CC-4 — owner-only echo of the viewer's own reaction (or null). */
const isReactionOrNull = (v: unknown): boolean =>
  v === null || v === 'fire' || v === 'laugh' || v === 'cringe';

const isResult = (v: unknown): v is TurnResult => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.performer === 'string'
    && typeof o.outcome === 'string'
    && typeof o.fast === 'boolean'
    && typeof o.points === 'object' && o.points !== null
    && isReactionCounts(o.reactions);
};

function baseOk(o: Record<string, unknown>): boolean {
  return typeof o.turnSeq === 'number'
    && typeof o.lap === 'number'
    && typeof o.laps === 'number'
    && typeof o.performer === 'string'
    && (o.partner === null || typeof o.partner === 'string')
    && Array.isArray(o.rotation) && o.rotation.every((p) => typeof p === 'string')
    && isRec(o.connected, 'boolean')
    && isRec(o.scores, 'number')
    && isRec(o.passesLeft, 'number');
}

/** Runtime narrow of the opaque `view` payload — never crash a render on drift. */
export function asPerformJudgeView(v: unknown): PerformJudgeView | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (!isMode(o.mode)) return null;
  if (o.phase === 'over') {
    return isRec(o.scores, 'number') ? (v as PerformJudgeView) : null;
  }
  if (!baseOk(o)) return null;
  if (o.phase === 'ready') {
    const offersOk = o.offers === null || (Array.isArray(o.offers)
      && o.offers.every((x) => typeof x === 'object' && x !== null
        && typeof (x as Record<string, unknown>).index === 'number'
        && isLText((x as Record<string, unknown>).prompt)));
    return typeof o.canReady === 'boolean' && offersOk && isSecret(o.secret) && isConstraint(o.constraint)
      ? (v as PerformJudgeView) : null;
  }
  if (o.phase === 'perform') {
    return typeof o.tapCount === 'number' && typeof o.tapGoal === 'number'
      && typeof o.myTapped === 'boolean' && typeof o.myDone === 'boolean'
      && typeof o.canClaimDone === 'boolean' && typeof o.canGiveUp === 'boolean'
      && typeof o.canPass === 'boolean'
      && (o.claimTargets === null || (Array.isArray(o.claimTargets) && o.claimTargets.every((p) => typeof p === 'string')))
      && (o.crewDone === null || isRec(o.crewDone, 'boolean'))
      && isReactionCounts(o.reactionCounts) && isReactionOrNull(o.myReaction) && typeof o.canReact === 'boolean'
      && isSecret(o.secret) && isConstraint(o.constraint) && isNullOrLText(o.categoryHint)
      ? (v as PerformJudgeView) : null;
  }
  if (o.phase === 'judge') {
    const kindOk = o.judgeKind === 'verdict' || o.judgeKind === 'claim-validate' || o.judgeKind === 'stars';
    return kindOk && typeof o.votesIn === 'number' && typeof o.votersExpected === 'number'
      && typeof o.youCanVote === 'boolean'
      && (o.myVote === null || o.myVote === 'yes' || o.myVote === 'no')
      && (o.myStars === null || typeof o.myStars === 'number')
      && (o.claimedGuesser === null || typeof o.claimedGuesser === 'string')
      && isSecret(o.secret) && isConstraint(o.constraint)
      ? (v as PerformJudgeView) : null;
  }
  if (o.phase === 'reveal') {
    return isResult(o.result) ? (v as PerformJudgeView) : null;
  }
  if (o.phase === 'scoreboard') {
    return v as PerformJudgeView;
  }
  return null;
}

export { deviceLang, pickL, type Lang } from '../i18n';
