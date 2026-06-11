import type { Effect, GameModule, PlayerId, ReduceResult } from '@bloop/engine';
import { createRng, shuffle } from '@bloop/engine';
import { allActed, connectedPlayers, emptyPlayerMap, initPresence, setConnected } from '@bloop/kit';
import type {
  Ballot,
  Option,
  OptionVoteAction,
  OptionVoteConfig,
  OptionVoteContent,
  OptionVoteState,
  OptionVoteView,
  RoundResult,
} from './state.js';

const EMPTY_RESULT: RoundResult = { itemId: '', counts: { A: 0, B: 0 }, majority: null, picks: {}, awarded: [] };

function skipQuorumMet(state: OptionVoteState): boolean {
  const connected = connectedPlayers(state.players, state.connected);
  const skips = connected.filter((p) => state.skips[p] === true).length;
  return skips > state.config.debateSkipThreshold * connected.length;
}

/** Promote the hidden buffer atomically: tally, score, expose picks, enter reveal. */
function resolveChoose(state: OptionVoteState): ReduceResult<OptionVoteState> {
  const picks = emptyPlayerMap<Option>();
  let a = 0;
  let b = 0;
  for (const p of state.players) {
    const ballot = state.ballots[p];
    if (ballot === undefined) continue;
    picks[p] = ballot.pick;
    if (ballot.pick === 'A') a += 1;
    else b += 1;
  }
  const majority: Option | null = a > b ? 'A' : b > a ? 'B' : null;

  const scores = Object.assign(emptyPlayerMap<number>(), state.scores);
  let minorityCount = state.minorityCount;
  const awarded: PlayerId[] = [];
  if (majority !== null) {
    if (state.config.scoring === 'predict-majority') {
      // Your own pick never scores — only a correct majority prediction does.
      for (const p of state.players) {
        const ballot = state.ballots[p];
        if (ballot !== undefined && ballot.predict === majority) {
          scores[p] = (scores[p] ?? 0) + state.config.pointsCorrect;
          awarded.push(p);
        }
      }
    } else {
      minorityCount = Object.assign(emptyPlayerMap<number>(), state.minorityCount);
      for (const p of state.players) {
        const ballot = state.ballots[p];
        if (ballot === undefined) continue;
        if (ballot.pick === majority) {
          scores[p] = (scores[p] ?? 0) + state.config.pointsCorrect;
          awarded.push(p);
        } else {
          minorityCount[p] = (minorityCount[p] ?? 0) + 1;
        }
      }
    }
  }

  const lastResult: RoundResult = {
    itemId: state.items[state.round]?.id ?? '',
    counts: { A: a, B: b },
    majority,
    picks,
    awarded,
  };
  return {
    state: { ...state, phase: 'reveal', scores, minorityCount, lastResult },
    effects: [{ type: 'analytics', name: 'round_revealed', props: { round: state.round } }],
  };
}

function endRound(state: OptionVoteState): ReduceResult<OptionVoteState> {
  const effects: Effect[] = [
    { type: 'analytics', name: 'round_completed', props: { round: state.round } },
  ];
  const round = state.round + 1;
  if (round >= state.config.totalRounds) {
    const over: OptionVoteState = { ...state, phase: 'over' };
    return { state: over, effects: [...effects, { type: 'gameOver', scores: { ...over.scores } }] };
  }
  return {
    state: {
      ...state,
      round,
      phase: 'choose',
      ballots: emptyPlayerMap<Ballot>(),
      skips: emptyPlayerMap<true>(),
      lastResult: null,
    },
    effects,
  };
}

function afterReveal(state: OptionVoteState): ReduceResult<OptionVoteState> {
  if (state.config.debateMs > 0) {
    return { state: { ...state, phase: 'debate', skips: emptyPlayerMap<true>() }, effects: [] };
  }
  return endRound(state);
}

/**
 * VOTE@2: ballots over two pack-defined options instead of the player roster.
 * One module, two configs — tu-preferes (predict-majority, no debate) and
 * gauche-ou-droite (majority-herd + debate w/ skip quorum). Per the platform
 * contract: rejecting an event returns the SAME state reference; ballots stay
 * in a hidden buffer until the atomic reveal.
 */
export function createOptionVote(
  id: string,
  config: OptionVoteConfig,
): GameModule<OptionVoteState, OptionVoteAction, OptionVoteView, OptionVoteContent> {
  return {
    id,
    version: 1,
    minPlayers: 3,
    maxPlayers: 16,

    init(seed, players, content) {
      const items = shuffle(createRng(seed), content.data.items);
      const totalRounds = Math.min(config.totalRounds, items.length);
      const scores = emptyPlayerMap<number>();
      const minorityCount = emptyPlayerMap<number>();
      for (const p of players) {
        scores[p] = 0;
        minorityCount[p] = 0;
      }
      return {
        config: { ...config, totalRounds },
        players: [...players],
        connected: initPresence(players),
        items,
        round: 0,
        phase: 'choose',
        ballots: emptyPlayerMap<Ballot>(),
        skips: emptyPlayerMap<true>(),
        scores,
        minorityCount,
        lastResult: null,
      };
    },

    reduce(state, event) {
      if (state.phase === 'over') return { state, effects: [] };

      if (event.type === 'action') {
        const { playerId, action } = event;
        if (!state.players.includes(playerId)) return { state, effects: [] };

        if (action.kind === 'ballot' && state.phase === 'choose') {
          if (action.pick !== 'A' && action.pick !== 'B') return { state, effects: [] };
          let ballot: Ballot;
          if (state.config.scoring === 'predict-majority') {
            // The atomic two-tap: a ballot without a prediction is incomplete.
            if (action.predict !== 'A' && action.predict !== 'B') return { state, effects: [] };
            ballot = { pick: action.pick, predict: action.predict };
          } else {
            ballot = { pick: action.pick };
          }
          const ballots = Object.assign(emptyPlayerMap<Ballot>(), state.ballots, { [playerId]: ballot });
          const next = { ...state, ballots };
          if (allActed(connectedPlayers(next.players, next.connected), ballots)) {
            return resolveChoose(next);
          }
          return { state: next, effects: [] };
        }

        if (action.kind === 'skip' && state.phase === 'debate') {
          if (state.connected[playerId] !== true) return { state, effects: [] };
          if (state.skips[playerId] === true) return { state, effects: [] };
          const skips = Object.assign(emptyPlayerMap<true>(), state.skips, { [playerId]: true as const });
          const next = { ...state, skips };
          if (skipQuorumMet(next)) return endRound(next);
          return { state: next, effects: [] };
        }

        return { state, effects: [] };
      }

      if (event.type === 'deadline') {
        if (state.phase === 'choose') return resolveChoose(state);
        if (state.phase === 'reveal') return afterReveal(state);
        if (state.phase === 'debate') return endRound(state);
        return { state, effects: [] };
      }

      if (event.type === 'playerLeft' || event.type === 'playerRejoined') {
        const wantConnected = event.type === 'playerRejoined';
        if (!state.players.includes(event.playerId)) return { state, effects: [] };
        if (state.connected[event.playerId] === wantConnected) return { state, effects: [] };
        const next = { ...state, connected: setConnected(state.connected, event.playerId, wantConnected) };
        // A leave can complete the expected set — never let an absent player block.
        if (!wantConnected && next.phase === 'choose'
          && allActed(connectedPlayers(next.players, next.connected), next.ballots)) {
          return resolveChoose(next);
        }
        if (!wantConnected && next.phase === 'debate' && skipQuorumMet(next)) {
          return endRound(next);
        }
        return { state: next, effects: [] };
      }

      return { state, effects: [] };
    },

    view(state, viewer) {
      const item = state.items[state.round] ?? null;
      const base = {
        round: state.round,
        totalRounds: state.config.totalRounds,
        scoring: state.config.scoring,
        scores: state.scores,
      };
      if (state.phase === 'choose') {
        const hasSubmitted = emptyPlayerMap<boolean>();
        for (const p of state.players) hasSubmitted[p] = state.ballots[p] !== undefined;
        return { phase: 'choose', ...base, item, hasSubmitted, myBallot: state.ballots[viewer] ?? null };
      }
      if (state.phase === 'reveal') {
        return {
          phase: 'reveal',
          ...base,
          item,
          result: state.lastResult ?? EMPTY_RESULT,
          hasDebate: state.config.debateMs > 0,
        };
      }
      if (state.phase === 'debate') {
        const connected = connectedPlayers(state.players, state.connected);
        const skipCount = connected.filter((p) => state.skips[p] === true).length;
        const skipNeeded = Math.floor(state.config.debateSkipThreshold * connected.length) + 1;
        return {
          phase: 'debate',
          ...base,
          item,
          result: state.lastResult ?? EMPTY_RESULT,
          skipCount,
          skipNeeded,
          mySkip: state.skips[viewer] === true,
        };
      }
      return {
        phase: 'over',
        scoring: state.config.scoring,
        scores: state.scores,
        minorityCount: state.minorityCount,
      };
    },

    phaseDurationMs(state) {
      if (state.phase === 'choose') return state.config.chooseMs;
      if (state.phase === 'reveal') return state.config.revealMs;
      if (state.phase === 'debate') return state.config.debateMs;
      return null;
    },

    phaseKey(state) {
      return state.phase === 'over' ? 'over' : `${state.phase}:r${state.round}`;
    },
  };
}
