import type { PlayerId } from '@bloop/engine';
import { emptyPlayerMap } from '@bloop/kit';
import type {
  DawnReport,
  LText,
  LynchReport,
  NightDayBaseView,
  NightDayState,
  NightDayView,
  NightStep,
  Role,
  Seat,
} from './state.js';

const EMPTY_DAWN: DawnReport = { died: [], revealedRoles: null };
const EMPTY_LYNCH: LynchReport = { evicted: null, revealedRole: null, tally: {}, abstained: [] };

/** Seeded-shuffled variant list, indexed deterministically — no rng at view time. */
function variant(list: readonly LText[], idx: number): LText | null {
  if (list.length === 0) return null;
  return list[idx % list.length] ?? null;
}

/**
 * Narration is PUBLIC flavor and must never encode a secret: when
 * revealRoleOnDeath is false the lynch slot would leak the evicted player's
 * side (wolf vs villager variants), so it returns null instead.
 */
function narrationFor(state: NightDayState): LText | null {
  const n = state.narrations;
  const r = state.round;
  switch (state.phase) {
    case 'nightSeer':
    case 'nightWolves':
    case 'nightWitch':
      return variant(n['night.intro'], r);
    case 'dawn':
    case 'debate': {
      const died = state.lastDawn?.died ?? [];
      return variant(died.length > 0 ? n['dawn.death'] : n['dawn.noDeath'], r);
    }
    case 'lynchReveal': {
      const evicted = state.lastLynch?.evicted ?? null;
      if (evicted === null) return variant(n['lynch.none'], r);
      if (!state.config.revealRoleOnDeath) return null; // side-coded slots would leak the hidden role
      return variant(state.roles[evicted] === 'wolf' ? n['lynch.wolf'] : n['lynch.villager'], r);
    }
    case 'over':
      return state.winners === 'wolves' ? variant(n['over.wolves'], 0) : variant(n['over.village'], 0);
    default:
      return null;
  }
}

/** Full-roster public booleans (decoy-uniform: keys never depend on roles). */
function flags(players: readonly PlayerId[], acted: Record<PlayerId, unknown>): Record<PlayerId, boolean> {
  const m = emptyPlayerMap<boolean>();
  for (const p of players) m[p] = acted[p] !== undefined;
  return m;
}

/**
 * Per-viewer projection (the platform's largest redaction surface — design
 * §2.17 redaction matrix). Own-only secrets are null for every other viewer
 * INCLUDING spectators and hostile ids ('__proto__'): myRole/myRoleCard
 * (owner), wolfPack (wolves only, alive or dead — the deliberate asymmetric
 * disclosure), seerLog (seer only, survives her death), witchState (witch
 * only), wolfVotes (LIVING wolves, wolves step only), pendingKill (LIVING
 * witch, witch step only). The three night sub-phases share ONE view shape so
 * actor and non-actor screens have identical keys (decoy protocol).
 */
export function buildView(state: NightDayState, viewer: PlayerId): NightDayView {
  const isPlayer = state.players.includes(viewer);
  const myRole: Role | null = isPlayer ? state.roles[viewer] ?? null : null;
  const iAmAlive = isPlayer && state.alive[viewer] === true;
  const seats: Seat[] = state.players.map((id) => ({
    id,
    alive: state.alive[id] === true,
    connected: state.connected[id] === true,
  }));
  const base: NightDayBaseView = {
    round: state.round,
    composition: state.composition,
    seats,
    scores: state.scores,
    myRole,
    myRoleCard: myRole !== null ? state.roleCards[myRole] ?? null : null,
    iAmAlive,
    wolfPack: myRole === 'wolf' ? state.players.filter((p) => state.roles[p] === 'wolf') : null,
    seerLog: myRole === 'seer' ? state.seerLog : null,
    narration: narrationFor(state),
  };

  switch (state.phase) {
    case 'roleReveal':
      return {
        phase: 'roleReveal',
        ...base,
        acked: flags(state.players, state.ackRole),
        myAck: state.ackRole[viewer] === true,
      };
    case 'nightSeer':
    case 'nightWolves':
    case 'nightWitch': {
      const step: NightStep =
        state.phase === 'nightSeer' ? 'seer' : state.phase === 'nightWolves' ? 'wolves' : 'witch';
      const amActor =
        iAmAlive &&
        (step === 'seer' ? myRole === 'seer' : step === 'wolves' ? myRole === 'wolf' : myRole === 'witch');
      return {
        phase: 'night',
        step,
        ...base,
        acted: flags(state.players, state.nightActed),
        myActed: state.nightActed[viewer] === true,
        amActor,
        wolfVotes: step === 'wolves' && myRole === 'wolf' && iAmAlive ? state.wolfVotes : null,
        pendingKill: step === 'witch' && myRole === 'witch' && iAmAlive ? state.pendingKill : null,
        witchState: myRole === 'witch' ? state.witchState : null,
      };
    }
    case 'dawn':
      return { phase: 'dawn', ...base, lastDawn: state.lastDawn ?? EMPTY_DAWN };
    case 'debate':
      return {
        phase: 'debate',
        ...base,
        lastDawn: state.lastDawn,
        ready: flags(state.players, state.readyToVote),
        myReady: state.readyToVote[viewer] === true,
      };
    case 'vote':
      return {
        phase: 'vote',
        ...base,
        hasVoted: flags(state.players, state.votes),
        // Owner echo only — never an indexed lookup that could return a foreign ballot.
        myVote: state.votes[viewer] ?? null,
      };
    case 'lynchReveal':
      return { phase: 'lynchReveal', ...base, lastLynch: state.lastLynch ?? EMPTY_LYNCH };
    default:
      return {
        phase: 'over',
        ...base,
        finalRoles: state.roles,
        winners: state.winners,
        endReason: state.endReason ?? 'maxRounds',
      };
  }
}
