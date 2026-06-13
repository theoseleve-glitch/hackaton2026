// IMPORT FIREWALL: type-only — erased at compile time; secret-role server logic never enters the bundle.
import type { LText, MatchResult, SecretRoleView, VoteRecord } from '@bloop/game-secret-role';

export const SECRET_ROLE_GAME_IDS = ['double-jeu'] as const;

export function isSecretRoleGame(gameId: string | null): boolean {
  return gameId !== null && (SECRET_ROLE_GAME_IDS as readonly string[]).includes(gameId);
}

const isRec = (v: unknown, t: 'number' | 'boolean'): v is Record<string, never> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === t);

const isLText = (v: unknown): v is LText => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return typeof o.fr === 'string' && typeof o.en === 'string';
};

const isVoteRecord = (v: unknown): v is VoteRecord => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.voteRound === 'number'
    && isRec(o.tally, 'number')
    && Array.isArray(o.abstained) && o.abstained.every((x) => typeof x === 'string')
    && (o.topAccused === null || typeof o.topAccused === 'string')
    && typeof o.caught === 'boolean';
};

const isResult = (v: unknown): v is MatchResult => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.match === 'number'
    && isLText(o.theme) && isLText(o.majorityItem) && isLText(o.impostorItem)
    && typeof o.impostor === 'string'
    && (o.winners === 'civilians' || o.winners === 'impostor')
    && (o.caughtOnVote === null || typeof o.caughtOnVote === 'number')
    && typeof o.endReason === 'string'
    && Array.isArray(o.voteRecords) && o.voteRecords.every(isVoteRecord)
    && isRec(o.points, 'number');
};

const isLastVote = (v: unknown): boolean => v === null || isVoteRecord(v);

/** Runtime narrow of the opaque `view` payload — never crash a render on drift. */
export function asSecretRoleView(v: unknown): SecretRoleView | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.totalMatches !== 'number' || !isRec(o.scores, 'number')) return null;
  if (o.phase === 'over') {
    return Array.isArray(o.results) && o.results.every(isResult) ? (v as SecretRoleView) : null;
  }
  if (typeof o.match !== 'number' || !isLText(o.theme)) return null;
  if (o.phase === 'secretReveal') {
    return (o.myItem === null || isLText(o.myItem)) && isRec(o.acked, 'boolean') && typeof o.iAcked === 'boolean'
      ? (v as SecretRoleView) : null;
  }
  if (o.phase === 'discuss') {
    return typeof o.period === 'number' && isRec(o.ready, 'boolean')
      && typeof o.iAmReady === 'boolean' && isLastVote(o.lastVote ?? null)
      ? (v as SecretRoleView) : null;
  }
  if (o.phase === 'vote') {
    return typeof o.voteRound === 'number' && isRec(o.hasVoted, 'boolean')
      && (o.myVote === null || typeof o.myVote === 'string')
      && Array.isArray(o.votableTargets) && o.votableTargets.every((x) => typeof x === 'string')
      && isLastVote(o.lastVote ?? null)
      ? (v as SecretRoleView) : null;
  }
  if (o.phase === 'verdict') {
    return isVoteRecord(o.vote) ? (v as SecretRoleView) : null;
  }
  if (o.phase === 'finalReveal') {
    return isResult(o.result) ? (v as SecretRoleView) : null;
  }
  return null;
}

export { deviceLang, pickL, type Lang } from '../i18n';
