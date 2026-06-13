// IMPORT FIREWALL: type-only — erased at compile time; night-day server logic never enters the bundle.
import type {
  DawnReport,
  LText,
  LynchReport,
  NightDayView,
  Role,
  RoleCard,
  Seat,
} from '@bloop/game-night-day';

export const NIGHT_DAY_GAME_IDS = ['loup-garou'] as const;

export function isNightDayGame(gameId: string | null): boolean {
  return gameId !== null && (NIGHT_DAY_GAME_IDS as readonly string[]).includes(gameId);
}

const ROLES = ['wolf', 'villager', 'seer', 'witch'] as const;

const isRec = (v: unknown, t: 'number' | 'boolean'): v is Record<string, never> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === t);

const isLText = (v: unknown): v is LText => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return typeof o.fr === 'string' && typeof o.en === 'string';
};

const isRole = (v: unknown): v is Role => (ROLES as readonly unknown[]).includes(v);

const isSeat = (v: unknown): v is Seat => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.alive === 'boolean' && typeof o.connected === 'boolean';
};

const isRoleCard = (v: unknown): v is RoleCard | null => {
  if (v === null) return true;
  if (typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return isLText(o.name) && isLText(o.text);
};

const isSeerLog = (v: unknown): boolean =>
  v === null ||
  (Array.isArray(v) &&
    v.every((e) => {
      if (typeof e !== 'object' || e === null) return false;
      const o = e as Record<string, unknown>;
      return typeof o.round === 'number' && typeof o.target === 'string' && typeof o.isWolf === 'boolean';
    }));

const isStrings = (v: unknown): boolean => Array.isArray(v) && v.every((x) => typeof x === 'string');

const isDawn = (v: unknown): v is DawnReport => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return isStrings(o.died) && (o.revealedRoles === null || (typeof o.revealedRoles === 'object' && o.revealedRoles !== null));
};

const isLynch = (v: unknown): v is LynchReport => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    (o.evicted === null || typeof o.evicted === 'string') &&
    (o.revealedRole === null || isRole(o.revealedRole)) &&
    isRec(o.tally, 'number') &&
    isStrings(o.abstained)
  );
};

const isWitchState = (v: unknown): boolean => {
  if (v === null) return true;
  if (typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.healLeft === 'boolean' && typeof o.poisonLeft === 'boolean';
};

/** Shared base envelope — checked before any phase branch. */
function baseOk(o: Record<string, unknown>): boolean {
  return (
    typeof o.round === 'number' &&
    isRec(o.composition, 'number') &&
    Array.isArray(o.seats) &&
    o.seats.every(isSeat) &&
    isRec(o.scores, 'number') &&
    (o.myRole === null || isRole(o.myRole)) &&
    isRoleCard(o.myRoleCard ?? null) &&
    typeof o.iAmAlive === 'boolean' &&
    (o.wolfPack === null || isStrings(o.wolfPack)) &&
    isSeerLog(o.seerLog ?? null) &&
    (o.narration === null || isLText(o.narration))
  );
}

/** Runtime narrow of the opaque `view` payload — never crash a render on drift. */
export function asNightDayView(v: unknown): NightDayView | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (!baseOk(o)) return null;
  if (o.phase === 'roleReveal') {
    return isRec(o.acked, 'boolean') && typeof o.myAck === 'boolean' ? (v as NightDayView) : null;
  }
  if (o.phase === 'night') {
    return (o.step === 'seer' || o.step === 'wolves' || o.step === 'witch') &&
      isRec(o.acted, 'boolean') &&
      typeof o.myActed === 'boolean' &&
      typeof o.amActor === 'boolean' &&
      (o.wolfVotes === null ||
        (typeof o.wolfVotes === 'object' && !Array.isArray(o.wolfVotes) &&
          Object.values(o.wolfVotes).every((x) => typeof x === 'string'))) &&
      (o.pendingKill === null || typeof o.pendingKill === 'string') &&
      isWitchState(o.witchState ?? null)
      ? (v as NightDayView)
      : null;
  }
  if (o.phase === 'dawn') return isDawn(o.lastDawn) ? (v as NightDayView) : null;
  if (o.phase === 'debate') {
    return (o.lastDawn === null || isDawn(o.lastDawn)) && isRec(o.ready, 'boolean') && typeof o.myReady === 'boolean'
      ? (v as NightDayView)
      : null;
  }
  if (o.phase === 'vote') {
    return isRec(o.hasVoted, 'boolean') && (o.myVote === null || typeof o.myVote === 'string')
      ? (v as NightDayView)
      : null;
  }
  if (o.phase === 'lynchReveal') return isLynch(o.lastLynch) ? (v as NightDayView) : null;
  if (o.phase === 'over') {
    return typeof o.finalRoles === 'object' &&
      o.finalRoles !== null &&
      Object.values(o.finalRoles).every(isRole) &&
      (o.winners === null || o.winners === 'village' || o.winners === 'wolves') &&
      typeof o.endReason === 'string'
      ? (v as NightDayView)
      : null;
  }
  return null;
}

export { deviceLang, pickL, type Lang } from '../i18n';
