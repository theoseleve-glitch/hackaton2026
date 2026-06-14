// IMPORT FIREWALL: type-only — erased at compile time; secret-role server logic never enters the bundle.
import type {
  LText,
  MatchResult,
  SecretRoleView,
  SessionCliffhanger,
  SessionStreak,
  VoteRecord,
} from '@bloop/game-secret-role';

export const SECRET_ROLE_GAME_IDS = ['double-jeu'] as const;

export function isSecretRoleGame(gameId: string | null): boolean {
  return gameId !== null && (SECRET_ROLE_GAME_IDS as readonly string[]).includes(gameId);
}

/**
 * CC-2 comeback weighting (Wave-2) — the per-match score multiplier the
 * double-jeu pack ships (`DOUBLE_JEU_CONFIG.matchScoreMultiplier`). The value
 * lives server-side and is folded into `result.points`/`scores` BEFORE the
 * view is built, so it never appears as a field on the payload. The firewall
 * forbids importing the config VALUE (type-only only), so we mirror the pack's
 * sequence here purely so the client can render the "doubled finale" chrome.
 * Keep in lock-step with the pack: [match0, match1, match2] = [1, 1.5, 2].
 */
const DOUBLE_JEU_MATCH_MULTIPLIER: readonly number[] = [1, 1.5, 2];

/**
 * Clamp-safe read of the match multiplier — mirrors the engine's
 * `matchMultiplier()`: a missing / non-finite / <= 0 entry yields 1 (identity),
 * so a drifted match index can never invent a phantom multiplier banner.
 */
export function secretRoleMatchMultiplier(match: number): number {
  const m = DOUBLE_JEU_MATCH_MULTIPLIER[match];
  return m === undefined || !Number.isFinite(m) || m <= 0 ? 1 : m;
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

const isStreak = (v: unknown): v is SessionStreak => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (o.side === null || o.side === 'civilians' || o.side === 'impostor')
    && typeof o.count === 'number';
};

/** CC-5 cliffhanger/epilogue payload — derived purely from public results. */
const isCliffhanger = (v: unknown): v is SessionCliffhanger => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return isStreak(o.streak)
    && (o.detectiveMvp === null || typeof o.detectiveMvp === 'string')
    && isRec(o.detectiveHits, 'number')
    && typeof o.matchesPlayed === 'number';
};

/** Runtime narrow of the opaque `view` payload — never crash a render on drift. */
export function asSecretRoleView(v: unknown): SecretRoleView | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.totalMatches !== 'number' || !isRec(o.scores, 'number')) return null;
  if (o.phase === 'over') {
    // Wave-2: epilogue payload (CC-5 cliffhanger) must validate so the over screen can render it.
    return Array.isArray(o.results) && o.results.every(isResult) && isCliffhanger(o.cliffhanger)
      ? (v as SecretRoleView) : null;
  }
  if (typeof o.match !== 'number' || !isLText(o.theme)) return null;
  if (o.phase === 'secretReveal') {
    return (o.myItem === null || isLText(o.myItem)) && isRec(o.acked, 'boolean') && typeof o.iAcked === 'boolean'
      ? (v as SecretRoleView) : null;
  }
  if (o.phase === 'discuss') {
    // CC-1 lean: owner-only echo (`myLean`) + a public count (`leanCount`).
    return typeof o.period === 'number' && isRec(o.ready, 'boolean')
      && typeof o.iAmReady === 'boolean' && isLastVote(o.lastVote ?? null)
      && (o.myLean === null || typeof o.myLean === 'string')
      && typeof o.leanCount === 'number'
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
    // Wave-2: CC-5 cliffhanger rides finalReveal so the reveal screen can tease the streak.
    return isResult(o.result) && isCliffhanger(o.cliffhanger) ? (v as SecretRoleView) : null;
  }
  return null;
}

export { deviceLang, pickL, type Lang } from '../i18n';
