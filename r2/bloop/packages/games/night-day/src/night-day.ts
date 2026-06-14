import type { Effect, GameModule, PlayerId, ReduceResult } from '@bloop/engine';
import { createRng, shuffle } from '@bloop/engine';
import {
  allActed,
  emptyPlayerMap,
  emptySideBets,
  gameOver,
  initPresence,
  placeSideBet,
  setConnected,
  tally,
} from '@bloop/kit';
import type { SideBetBuffer } from '@bloop/kit';
import { aliveConnected, alivePlayers, isStepActor, stepMode, winCheck, zeroScores } from './logic.js';
import type {
  EndReason,
  LText,
  NarrationSlot,
  NightDayAction,
  NightDayConfig,
  NightDayContent,
  NightDayState,
  NightDayView,
  NightStep,
  Role,
  RoleCard,
  Winners,
} from './state.js';
import { NARRATION_SLOTS, V1_ROLES } from './state.js';
import { buildView } from './views.js';

const NIGHT_STEPS: readonly NightStep[] = ['seer', 'wolves', 'witch'];
const STEP_PHASE = { seer: 'nightSeer', wolves: 'nightWolves', witch: 'nightWitch' } as const;

/** Walk the ordered night pipeline from `fromIdx`, skipping per the skip rule; past the end → dawn. */
function enterNightStep(state: NightDayState, fromIdx: number, effects: Effect[]): ReduceResult<NightDayState> {
  for (let i = fromIdx; i < NIGHT_STEPS.length; i++) {
    const step = NIGHT_STEPS[i] as NightStep;
    if (stepMode(state, step) === 'skip') continue;
    return {
      state: { ...state, phase: STEP_PHASE[step], nightActed: emptyPlayerMap<true>() },
      effects,
    };
  }
  return enterDawn(state, effects);
}

/**
 * Atomic dawn resolution: unhealed wolf kill + poison flip `alive`, the
 * report goes public, every night buffer clears. Win-check runs at the dawn
 * DEADLINE (the dawn card is a fixed display window).
 */
function enterDawn(state: NightDayState, effects: Effect[]): ReduceResult<NightDayState> {
  const died: PlayerId[] = [];
  if (state.pendingKill !== null && !state.pendingHealed) died.push(state.pendingKill);
  if (state.pendingPoison !== null && !died.includes(state.pendingPoison)) died.push(state.pendingPoison);
  let alive = state.alive;
  if (died.length > 0) {
    alive = Object.assign(emptyPlayerMap<boolean>(), state.alive);
    for (const p of died) alive[p] = false;
  }
  let revealedRoles: Record<PlayerId, Role> | null = null;
  if (state.config.revealRoleOnDeath) {
    revealedRoles = emptyPlayerMap<Role>();
    for (const p of died) revealedRoles[p] = state.roles[p];
  }
  return {
    state: {
      ...state,
      phase: 'dawn',
      alive,
      lastDawn: { died, revealedRoles },
      pendingKill: null,
      pendingHealed: false,
      pendingPoison: null,
    },
    effects: [
      ...effects,
      { type: 'analytics', name: 'night_resolved', props: { round: state.round, deaths: died.length } },
    ],
  };
}

/**
 * Match-end-only scoring (design §2.17, exact): villageWins → +2 living
 * village-team, +1 dead village-team, 0 wolves. wolvesWin (parity or
 * maxRounds tiebreak) → +3 living wolf, +1 dead wolf, +1 every village-team
 * player. roomCollapsed → gameOver with the current (zero) scores.
 */
function enterOver(
  state: NightDayState,
  winners: Winners,
  endReason: EndReason,
  effects: Effect[],
): ReduceResult<NightDayState> {
  const scores = zeroScores(state.players);
  if (endReason !== 'roomCollapsed') {
    for (const p of state.players) {
      const isWolf = state.roles[p] === 'wolf';
      const living = state.alive[p] === true;
      if (winners === 'village') scores[p] = isWolf ? 0 : living ? 2 : 1;
      else scores[p] = isWolf ? (living ? 3 : 1) : 1;
    }
  }
  return {
    state: { ...state, phase: 'over', scores, winners, endReason },
    effects: [...effects, gameOver(scores)],
  };
}

function afterDawn(state: NightDayState): ReduceResult<NightDayState> {
  const win = winCheck(state, state.round);
  if (win !== null) return enterOver(state, win.winners, win.endReason, []);
  return { state: { ...state, phase: 'debate', readyToVote: emptyPlayerMap<true>() }, effects: [] };
}

function enterVote(state: NightDayState): ReduceResult<NightDayState> {
  return { state: { ...state, phase: 'vote', votes: emptyPlayerMap<PlayerId>() }, effects: [] };
}

/** Lynch: unique plurality evicts; tie at top (or zero votes) → no lynch (deterministic, no revote). */
function resolveLynch(state: NightDayState): ReduceResult<NightDayState> {
  const counts = tally(state.votes);
  let evicted: PlayerId | null = null;
  let bestN = 0;
  let tied = false;
  for (const [id, n] of Object.entries(counts)) {
    if (n > bestN) {
      evicted = id;
      bestN = n;
      tied = false;
    } else if (n === bestN && n > 0) {
      tied = true;
    }
  }
  if (tied || bestN === 0) evicted = null;
  const abstained = alivePlayers(state).filter((p) => state.votes[p] === undefined);
  let alive = state.alive;
  if (evicted !== null) {
    alive = Object.assign(emptyPlayerMap<boolean>(), state.alive);
    alive[evicted] = false;
  }
  return {
    state: {
      ...state,
      phase: 'lynchReveal',
      alive,
      votes: emptyPlayerMap<PlayerId>(),
      lastLynch: {
        evicted,
        revealedRole: evicted !== null && state.config.revealRoleOnDeath ? state.roles[evicted] : null,
        tally: counts,
        abstained,
      },
    },
    effects: [],
  };
}

/** lynchReveal deadline: the ad-cadence boundary — win-check, then next night (round+1) or over. */
function afterLynch(state: NightDayState): ReduceResult<NightDayState> {
  const effects: Effect[] = [
    { type: 'analytics', name: 'round_completed', props: { round: state.round } },
  ];
  const win = winCheck(state, state.round + 1);
  if (win !== null) return enterOver(state, win.winners, win.endReason, effects);
  return enterNightStep({ ...state, round: state.round + 1 }, 0, effects);
}

/** Leaving roleReveal: night 0 begins (unacked players proceed anyway). */
function startFirstNight(state: NightDayState): ReduceResult<NightDayState> {
  return enterNightStep(state, 0, [
    { type: 'analytics', name: 'match_started', props: { players: state.players.length } },
  ]);
}

/** Wolves' plurality with the deterministic tie-break: earliest first-vote among tied (wolfVoteSeq). */
function resolveWolves(state: NightDayState): ReduceResult<NightDayState> {
  const counts = tally(state.wolfVotes);
  let pendingKill: PlayerId | null = null;
  let bestN = 0;
  for (const t of state.wolfVoteSeq) {
    const n = counts[t] ?? 0;
    if (n > bestN) {
      pendingKill = t;
      bestN = n;
    }
  }
  return enterNightStep(
    { ...state, pendingKill, wolfVotes: emptyPlayerMap<PlayerId>(), wolfVoteSeq: [] },
    2,
    [],
  );
}

/** All-acted or deadline on a night sub-phase. */
function endNightStep(state: NightDayState): ReduceResult<NightDayState> {
  if (state.phase === 'nightSeer') return enterNightStep(state, 1, []);
  if (state.phase === 'nightWolves') return resolveWolves(state);
  return enterDawn(state, []);
}

function isNightPhase(state: NightDayState): boolean {
  return state.phase === 'nightSeer' || state.phase === 'nightWolves' || state.phase === 'nightWitch';
}

/** Mark acted (the uniform decoy-protocol lock) and end the sub-phase when the expected set is complete. */
function actedAndMaybeEnd(state: NightDayState, playerId: PlayerId): ReduceResult<NightDayState> {
  const nightActed = Object.assign(emptyPlayerMap<true>(), state.nightActed, { [playerId]: true as const });
  const next = { ...state, nightActed };
  if (allActed(aliveConnected(next), nightActed)) return endNightStep(next);
  return { state: next, effects: [] };
}

/**
 * NIGHT_DAY — moderator-less werewolf (loup-garou is its first config; themed
 * reskins are config+pack drops). Per the platform contract: rejecting an
 * event returns the SAME state reference; ballots/peeks/potions live in
 * hidden buffers promoted atomically; a disconnected player never blocks a
 * phase; no Date.now/Math.random — all nondeterminism enters via the seed.
 */
export function createNightDay(
  id: string,
  config: NightDayConfig,
): GameModule<NightDayState, NightDayAction, NightDayView, NightDayContent> {
  return {
    id,
    version: 1,
    minPlayers: 5,
    maxPlayers: 16,

    init(seed, players, content) {
      const rng = createRng(seed);
      // Roles draw from the rng FIRST so assignments never depend on pack contents.
      const order = shuffle(rng, players);
      const n = players.length;
      const wolfCount = Math.min(config.maxWolves, Math.max(1, Math.floor(n / 4)));
      const roles = emptyPlayerMap<Role>();
      let idx = 0;
      for (let i = 0; i < wolfCount && idx < n; i++) roles[order[idx++] as PlayerId] = 'wolf';
      const seerCount = config.seerEnabled && idx < n ? 1 : 0;
      if (seerCount === 1) roles[order[idx++] as PlayerId] = 'seer';
      const witchCount = config.witchEnabled && idx < n ? 1 : 0;
      if (witchCount === 1) roles[order[idx++] as PlayerId] = 'witch';
      for (; idx < n; idx++) roles[order[idx] as PlayerId] = 'villager';
      const composition: Record<Role, number> = {
        wolf: wolfCount,
        villager: n - wolfCount - seerCount - witchCount,
        seer: seerCount,
        witch: witchCount,
      };

      // v1 role set only — extra pack roleCards (hunter, cupid, …) are dropped.
      const roleCards: Partial<Record<Role, RoleCard>> = {};
      const bySlot = {} as Record<NarrationSlot, LText[]>;
      for (const slot of NARRATION_SLOTS) bySlot[slot] = [];
      for (const item of content.data.items) {
        if (item.type === 'roleCard') {
          if ((V1_ROLES as readonly string[]).includes(item.role) && roleCards[item.role] === undefined) {
            roleCards[item.role] = { name: item.name, text: item.text };
          }
        } else if (item.type === 'narration' && bySlot[item.slot] !== undefined) {
          bySlot[item.slot].push(item.text);
        }
      }
      const narrations = {} as Record<NarrationSlot, LText[]>;
      for (const slot of NARRATION_SLOTS) narrations[slot] = shuffle(rng, bySlot[slot]);

      const alive = emptyPlayerMap<boolean>();
      for (const p of players) alive[p] = true;

      return {
        config: { ...config },
        players: [...players],
        connected: initPresence(players),
        roles,
        composition,
        roleCards,
        narrations,
        alive,
        round: 0,
        phase: 'roleReveal',
        ackRole: emptyPlayerMap<true>(),
        nightActed: emptyPlayerMap<true>(),
        nightReads: emptyPlayerMap<SideBetBuffer<PlayerId>>(),
        wolfVotes: emptyPlayerMap<PlayerId>(),
        wolfVoteSeq: [],
        seerLog: [],
        witchState: { healLeft: config.witchEnabled, poisonLeft: config.witchEnabled },
        pendingKill: null,
        pendingHealed: false,
        pendingPoison: null,
        lastDawn: null,
        readyToVote: emptyPlayerMap<true>(),
        votes: emptyPlayerMap<PlayerId>(),
        lastLynch: null,
        scores: zeroScores(players),
        winners: null,
        endReason: null,
      };
    },

    reduce(state, event) {
      if (state.phase === 'over') return { state, effects: [] };

      if (event.type === 'action') {
        const { playerId, action } = event;
        if (!state.players.includes(playerId)) return { state, effects: [] };

        if (action.kind === 'ackRole' && state.phase === 'roleReveal') {
          if (state.alive[playerId] !== true) return { state, effects: [] };
          if (state.ackRole[playerId] === true) return { state, effects: [] };
          const ackRole = Object.assign(emptyPlayerMap<true>(), state.ackRole, { [playerId]: true as const });
          const next = { ...state, ackRole };
          if (allActed(aliveConnected(next), ackRole)) return startFirstNight(next);
          return { state: next, effects: [] };
        }

        if (isNightPhase(state)) {
          // The uniform first-action lock: any night action (real or decoy) locks the seat.
          if (state.alive[playerId] !== true) return { state, effects: [] };
          if (state.nightActed[playerId] === true) return { state, effects: [] };

          if (action.kind === 'nightAck') return actedAndMaybeEnd(state, playerId);

          if (action.kind === 'nightRead') {
            // CC-1 Night Read: a living NON-ACTOR's private wolf-hunch. It locks
            // the seat byte-identically to nightAck (same actedAndMaybeEnd path)
            // and stores the prediction in a strictly-more-hidden buffer. The
            // active role of THIS sub-phase reads via their real action, not here.
            const target = action.target;
            if (target === playerId) return { state, effects: [] };
            if (!state.players.includes(target) || state.alive[target] !== true) {
              return { state, effects: [] };
            }
            if (isStepActor(state, playerId)) return { state, effects: [] };
            const round = state.round;
            const buffer = state.nightReads[round] ?? emptySideBets<PlayerId>();
            // placeSideBet => null on a re-read this round (already locked => caught
            // above by nightActed, but the buffer guard stays the structural backstop).
            const placed = placeSideBet(buffer, playerId, target, true);
            if (placed === null) return { state, effects: [] };
            const nightReads = Object.assign(
              emptyPlayerMap<SideBetBuffer<PlayerId>>(),
              state.nightReads,
              { [round]: placed },
            );
            return actedAndMaybeEnd({ ...state, nightReads }, playerId);
          }

          if (action.kind === 'seerPeek' && state.phase === 'nightSeer') {
            if (state.roles[playerId] !== 'seer') return { state, effects: [] };
            const target = action.target;
            if (target === playerId) return { state, effects: [] };
            if (!state.players.includes(target) || state.alive[target] !== true) return { state, effects: [] };
            const entry = { round: state.round, target, isWolf: state.roles[target] === 'wolf' };
            return actedAndMaybeEnd({ ...state, seerLog: [...state.seerLog, entry] }, playerId);
          }

          if (action.kind === 'wolfVote' && state.phase === 'nightWolves') {
            if (state.roles[playerId] !== 'wolf') return { state, effects: [] };
            const target = action.target;
            if (!state.players.includes(target) || state.alive[target] !== true) return { state, effects: [] };
            if (state.roles[target] === 'wolf') return { state, effects: [] };
            const wolfVotes = Object.assign(emptyPlayerMap<PlayerId>(), state.wolfVotes, { [playerId]: target });
            const wolfVoteSeq = state.wolfVoteSeq.includes(target)
              ? state.wolfVoteSeq
              : [...state.wolfVoteSeq, target];
            return actedAndMaybeEnd({ ...state, wolfVotes, wolfVoteSeq }, playerId);
          }

          if (action.kind === 'witchAct' && state.phase === 'nightWitch') {
            if (state.roles[playerId] !== 'witch') return { state, effects: [] };
            const { heal, poisonTarget } = action;
            if (heal) {
              if (!state.witchState.healLeft || state.pendingKill === null) return { state, effects: [] };
              if (!state.config.witchSelfHeal && state.pendingKill === playerId) return { state, effects: [] };
            }
            if (poisonTarget !== null) {
              if (!state.witchState.poisonLeft) return { state, effects: [] };
              if (!state.players.includes(poisonTarget) || state.alive[poisonTarget] !== true) {
                return { state, effects: [] };
              }
            }
            return actedAndMaybeEnd(
              {
                ...state,
                pendingHealed: heal ? true : state.pendingHealed,
                pendingPoison: poisonTarget,
                witchState: {
                  healLeft: state.witchState.healLeft && !heal,
                  poisonLeft: state.witchState.poisonLeft && poisonTarget === null,
                },
              },
              playerId,
            );
          }

          return { state, effects: [] };
        }

        if (action.kind === 'readyToVote' && state.phase === 'debate') {
          if (state.alive[playerId] !== true) return { state, effects: [] };
          if (state.readyToVote[playerId] === true) return { state, effects: [] };
          const readyToVote = Object.assign(emptyPlayerMap<true>(), state.readyToVote, {
            [playerId]: true as const,
          });
          const next = { ...state, readyToVote };
          if (allActed(aliveConnected(next), readyToVote)) return enterVote(next);
          return { state: next, effects: [] };
        }

        if (action.kind === 'vote' && state.phase === 'vote') {
          if (state.alive[playerId] !== true) return { state, effects: [] };
          if (state.votes[playerId] !== undefined) return { state, effects: [] }; // first vote locks
          const target = action.target;
          if (target === playerId) return { state, effects: [] }; // self-vote inert
          if (!state.players.includes(target) || state.alive[target] !== true) return { state, effects: [] };
          const votes = Object.assign(emptyPlayerMap<PlayerId>(), state.votes, { [playerId]: target });
          const next = { ...state, votes };
          if (allActed(aliveConnected(next), votes)) return resolveLynch(next);
          return { state: next, effects: [] };
        }

        return { state, effects: [] };
      }

      if (event.type === 'deadline') {
        if (state.phase === 'roleReveal') return startFirstNight(state);
        if (isNightPhase(state)) return endNightStep(state);
        if (state.phase === 'dawn') return afterDawn(state);
        if (state.phase === 'debate') return enterVote(state);
        if (state.phase === 'vote') return resolveLynch(state);
        if (state.phase === 'lynchReveal') return afterLynch(state);
        return { state, effects: [] };
      }

      if (event.type === 'playerLeft' || event.type === 'playerRejoined') {
        const wantConnected = event.type === 'playerRejoined';
        if (!state.players.includes(event.playerId)) return { state, effects: [] };
        if (state.connected[event.playerId] === wantConnected) return { state, effects: [] };
        // Presence is NOT elimination: `alive` never flips here.
        const next = { ...state, connected: setConnected(state.connected, event.playerId, wantConnected) };
        if (!wantConnected) {
          // A leave can complete the expected set — never let an absent player block.
          const expected = aliveConnected(next);
          if (next.phase === 'roleReveal' && allActed(expected, next.ackRole)) return startFirstNight(next);
          if (isNightPhase(next) && allActed(expected, next.nightActed)) return endNightStep(next);
          if (next.phase === 'debate' && allActed(expected, next.readyToVote)) return enterVote(next);
          if (next.phase === 'vote' && allActed(expected, next.votes)) return resolveLynch(next);
        }
        return { state: next, effects: [] };
      }

      return { state, effects: [] };
    },

    view(state, viewer) {
      return buildView(state, viewer);
    },

    phaseDurationMs(state) {
      switch (state.phase) {
        case 'roleReveal':
          return state.config.roleRevealMs;
        case 'nightSeer':
          return state.config.nightSeerMs;
        case 'nightWolves':
          return state.config.nightWolvesMs;
        case 'nightWitch':
          return state.config.nightWitchMs;
        case 'dawn':
          return state.config.dawnMs;
        case 'debate':
          return state.config.debateMs;
        case 'vote':
          return state.config.voteMs;
        case 'lynchReveal':
          return state.config.lynchRevealMs;
        default:
          return null;
      }
    },

    phaseKey(state) {
      switch (state.phase) {
        case 'roleReveal':
          return 'roleReveal';
        case 'nightSeer':
          return `night:r${state.round}:seer`;
        case 'nightWolves':
          return `night:r${state.round}:wolves`;
        case 'nightWitch':
          return `night:r${state.round}:witch`;
        case 'dawn':
          return `dawn:r${state.round}`;
        case 'debate':
          return `debate:r${state.round}`;
        case 'vote':
          return `vote:r${state.round}`;
        case 'lynchReveal':
          return `lynch:r${state.round}`;
        default:
          return 'over';
      }
    },
  };
}
