import type { Effect, GameModule, PlayerId, ReduceResult } from '@bloop/engine';
import { createRng, shuffle } from '@bloop/engine';
import { allActed, emptyPlayerMap, gameOver, initPresence, setConnected } from '@bloop/kit';
import {
  aliveConnectedFollowers,
  bank,
  buildGrid,
  collapsed,
  connectedFollowers,
  eligibleVoters,
  isDetectiveOf,
  pickDetectives,
  resolveDetectiveCount,
  scoreRound,
} from './round.js';
import type {
  LText,
  RoundOutcome,
  RuleHuntAction,
  RuleHuntConfig,
  RuleHuntContent,
  RuleHuntRole,
  RuleHuntState,
  RuleHuntView,
  RuleHuntViewBase,
  TribunalResult,
} from './state.js';

const EMPTY_LTEXT: LText = { fr: '', en: '' };
const EMPTY_OUTCOME: RoundOutcome = {
  kind: 'timeUp', guesser: null, pickedIndex: null, perfect: false, trueIndex: -1, ruleText: EMPTY_LTEXT,
};

/** Fresh briefing for round `round`: rotated detectives, new grid, reset round-locals. */
function startRound(state: RuleHuntState, round: number): RuleHuntState {
  const { detectives, nextCursor } = pickDetectives(
    state.detectiveOrder, state.detectiveCursor, state.detectiveCount, state.connected);
  const grid = buildGrid(state.seed, round, state.items[round], state.config.candidateCount);
  const accusationsLeft = emptyPlayerMap<number>();
  for (const p of state.players) {
    if (!detectives.includes(p)) accusationsLeft[p] = state.config.accusationsPerPlayer;
  }
  return {
    ...state,
    round,
    phase: 'briefing',
    detectives,
    detectiveCursor: nextCursor,
    eliminated: emptyPlayerMap<boolean>(),
    candidateTexts: grid.candidateTexts,
    trueCandidateIndex: grid.trueCandidateIndex,
    ackRule: emptyPlayerMap<boolean>(),
    liveRemainingMs: state.config.liveMs,
    segmentStartedAt: 0,
    liveSeg: 0,
    interruptSeq: 0,
    accusationsLeft,
    teamGuessesLeft: state.config.teamGuesses,
    usedCandidates: [],
    tribunal: null,
    guess: null,
    lastTribunal: null,
    lastOutcome: null,
    infractions: 0,
  };
}

function endGame(
  state: RuleHuntState,
  endReason: 'finished' | 'roomCollapsed',
  extra: Effect[] = [],
): ReduceResult<RuleHuntState> {
  const over: RuleHuntState = { ...state, phase: 'over', endReason, tribunal: null, guess: null };
  return { state: over, effects: [...extra, gameOver(over.scores)] };
}

/** briefing -> live (all-acked, leave-completed, or deadline). The clock segment starts at the resolving event's `at`. */
function enterLiveFromBriefing(state: RuleHuntState, at: number): ReduceResult<RuleHuntState> {
  if (collapsed(state)) return endGame(state, 'roomCollapsed');
  return { state: { ...state, phase: 'live', segmentStartedAt: at }, effects: [] };
}

/** Atomic round resolution: outcome published, scoring applied on entry, round_completed fired. */
function enterReveal(
  state: RuleHuntState,
  kind: 'guessed' | 'timeUp',
  guesser: PlayerId | null,
  pickedIndex: number | null,
  extra: Effect[],
): ReduceResult<RuleHuntState> {
  const perfect = state.infractions === 0;
  const outcome: RoundOutcome = {
    kind,
    guesser,
    pickedIndex,
    perfect,
    trueIndex: state.trueCandidateIndex,
    ruleText: state.items[state.round]?.rule ?? EMPTY_LTEXT,
  };
  return {
    state: {
      ...state,
      phase: 'reveal',
      lastOutcome: outcome,
      scores: scoreRound(state, kind, perfect),
      tribunal: null,
      guess: null,
    },
    effects: [...extra, { type: 'analytics', name: 'round_completed', props: { round: state.round, kind, perfect } }],
  };
}

/**
 * Post-interrupt resolution point: room collapse -> over; clock empty or
 * fewer than two playable followers -> reveal('timeUp'); else resume live
 * with the banked remainder (liveSeg++ re-arms the shorter deadline).
 */
function resumeLiveOrReveal(state: RuleHuntState, at: number, extra: Effect[]): ReduceResult<RuleHuntState> {
  if (collapsed(state)) return endGame(state, 'roomCollapsed', extra);
  if (state.liveRemainingMs <= 0 || aliveConnectedFollowers(state).length < 2) {
    return enterReveal(state, 'timeUp', null, null, extra);
  }
  return {
    state: { ...state, phase: 'live', segmentStartedAt: at, liveSeg: state.liveSeg + 1, tribunal: null, guess: null },
    effects: extra,
  };
}

/** Majority of CAST votes convicts; tie or zero votes = not guilty (funny never cruel). Aggregate tally + abstainers only go public. */
function resolveTribunal(state: RuleHuntState, at: number): ReduceResult<RuleHuntState> {
  const t = state.tribunal;
  if (t === null) return { state, effects: [] };
  let guiltyCount = 0;
  let notGuiltyCount = 0;
  for (const p of state.players) {
    const v = t.votes[p];
    if (v === true) guiltyCount += 1;
    else if (v === false) notGuiltyCount += 1;
  }
  const guilty = guiltyCount > notGuiltyCount;
  const lastTribunal: TribunalResult = {
    accused: t.accused,
    accuser: t.accuser,
    guilty,
    tally: { guilty: guiltyCount, notGuilty: notGuiltyCount },
    abstained: eligibleVoters(state, t.accused).filter((p) => t.votes[p] === undefined),
  };
  let next: RuleHuntState = { ...state, tribunal: null, lastTribunal };
  if (guilty) {
    next = {
      ...next,
      eliminated: Object.assign(emptyPlayerMap<boolean>(), next.eliminated, { [t.accused]: true }),
      infractions: next.infractions + 1,
    };
  }
  return resumeLiveOrReveal(next, at, [
    { type: 'analytics', name: 'tribunal_resolved', props: { round: state.round, guilty } },
  ]);
}

/** One team attempt is SPENT on pick, deadline, or guesser-leave (anti pause-stalling). */
function resolveGuess(state: RuleHuntState, at: number, picked: number | null): ReduceResult<RuleHuntState> {
  const g = state.guess;
  if (g === null) return { state, effects: [] };
  const spent: RuleHuntState = { ...state, guess: null, teamGuessesLeft: state.teamGuessesLeft - 1 };
  if (picked !== null && picked === state.trueCandidateIndex) {
    return enterReveal(spent, 'guessed', g.guesser, picked, [
      { type: 'analytics', name: 'guess_attempted', props: { round: state.round, correct: true } },
    ]);
  }
  const next = picked !== null ? { ...spent, usedCandidates: [...spent.usedCandidates, picked] } : spent;
  const extra: Effect[] = picked !== null
    ? [{ type: 'analytics', name: 'guess_attempted', props: { round: state.round, correct: false } }]
    : [];
  return resumeLiveOrReveal(next, at, extra);
}

/**
 * RULE_HUNT — inverted social deduction: 1-2 PUBLIC detectives hunt the
 * secret behavioral rule the rest of the room obeys until the banked live
 * clock expires. Pure module per the platform contract: rejected events
 * return the SAME state reference; the pause/resume clock uses only event
 * `at` arithmetic; all randomness flows from the seed.
 */
export function createRuleHunt(
  id: string,
  config: RuleHuntConfig,
): GameModule<RuleHuntState, RuleHuntAction, RuleHuntView, RuleHuntContent> {
  return {
    id,
    version: 1,
    minPlayers: 4,
    maxPlayers: 16,

    init(seed, players, content) {
      const rng = createRng(seed);
      const items = shuffle(rng, content.data.items);
      const detectiveOrder = shuffle(rng, players);
      const totalRounds = Math.min(config.totalRounds, items.length);
      const scores = emptyPlayerMap<number>();
      for (const p of players) scores[p] = 0;
      const base: RuleHuntState = {
        config: { ...config, totalRounds },
        seed,
        players: [...players],
        connected: initPresence(players),
        detectiveOrder,
        detectiveCursor: 0,
        detectiveCount: resolveDetectiveCount(config, players.length),
        detectives: [],
        eliminated: emptyPlayerMap<boolean>(),
        items,
        round: 0,
        phase: 'briefing',
        candidateTexts: [],
        trueCandidateIndex: -1,
        ackRule: emptyPlayerMap<boolean>(),
        liveRemainingMs: config.liveMs,
        segmentStartedAt: 0,
        liveSeg: 0,
        interruptSeq: 0,
        accusationsLeft: emptyPlayerMap<number>(),
        teamGuessesLeft: config.teamGuesses,
        usedCandidates: [],
        tribunal: null,
        guess: null,
        lastTribunal: null,
        lastOutcome: null,
        infractions: 0,
        scores,
        endReason: null,
      };
      return startRound(base, 0);
    },

    reduce(state, event) {
      if (state.phase === 'over') return { state, effects: [] };

      if (event.type === 'action') {
        const { playerId, action } = event;
        if (!state.players.includes(playerId)) return { state, effects: [] };
        const isDet = isDetectiveOf(state, playerId);

        if (action.kind === 'ackRule' && state.phase === 'briefing') {
          if (isDet) return { state, effects: [] };
          if (state.connected[playerId] !== true) return { state, effects: [] };
          if (state.ackRule[playerId] === true) return { state, effects: [] };
          const ackRule = Object.assign(emptyPlayerMap<boolean>(), state.ackRule, { [playerId]: true });
          const next = { ...state, ackRule };
          if (allActed(connectedFollowers(next), ackRule)) return enterLiveFromBriefing(next, event.at);
          return { state: next, effects: [] };
        }

        if (action.kind === 'accuse' && state.phase === 'live') {
          if (isDet) return { state, effects: [] };
          if (state.connected[playerId] !== true) return { state, effects: [] };
          if (state.eliminated[playerId] === true) return { state, effects: [] };
          if ((state.accusationsLeft[playerId] ?? 0) <= 0) return { state, effects: [] };
          const target = action.target;
          if (typeof target !== 'string' || target === playerId) return { state, effects: [] };
          if (!state.players.includes(target)) return { state, effects: [] };
          if (isDetectiveOf(state, target)) return { state, effects: [] };
          if (state.eliminated[target] === true) return { state, effects: [] };
          return {
            state: {
              ...state,
              phase: 'tribunal',
              liveRemainingMs: bank(state, event.at),
              interruptSeq: state.interruptSeq + 1,
              accusationsLeft: Object.assign(emptyPlayerMap<number>(), state.accusationsLeft, {
                [playerId]: (state.accusationsLeft[playerId] ?? 0) - 1,
              }),
              tribunal: { accused: target, accuser: playerId, votes: emptyPlayerMap<boolean>() },
            },
            effects: [],
          };
        }

        if (action.kind === 'tribunalVote' && state.phase === 'tribunal' && state.tribunal !== null) {
          const t = state.tribunal;
          if (typeof action.guilty !== 'boolean') return { state, effects: [] };
          if (!eligibleVoters(state, t.accused).includes(playerId)) return { state, effects: [] };
          if (t.votes[playerId] !== undefined) return { state, effects: [] }; // first vote locks
          const votes = Object.assign(emptyPlayerMap<boolean>(), t.votes, { [playerId]: action.guilty });
          const next: RuleHuntState = { ...state, tribunal: { ...t, votes } };
          if (allActed(eligibleVoters(next, t.accused), votes)) return resolveTribunal(next, event.at);
          return { state: next, effects: [] };
        }

        if (action.kind === 'openGuess' && state.phase === 'live') {
          if (!isDet) return { state, effects: [] };
          if (state.connected[playerId] !== true) return { state, effects: [] };
          if (state.teamGuessesLeft <= 0) return { state, effects: [] };
          return {
            state: {
              ...state,
              phase: 'guess',
              liveRemainingMs: bank(state, event.at),
              interruptSeq: state.interruptSeq + 1,
              guess: { guesser: playerId },
            },
            effects: [],
          };
        }

        if (action.kind === 'pickCandidate' && state.phase === 'guess' && state.guess !== null) {
          if (playerId !== state.guess.guesser) return { state, effects: [] };
          const idx = action.index;
          if (!Number.isInteger(idx) || idx < 0 || idx >= state.candidateTexts.length) return { state, effects: [] };
          if (state.usedCandidates.includes(idx)) return { state, effects: [] };
          return resolveGuess(state, event.at, idx);
        }

        return { state, effects: [] };
      }

      if (event.type === 'deadline') {
        if (state.phase === 'briefing') return enterLiveFromBriefing(state, event.at);
        if (state.phase === 'live') {
          if (collapsed(state)) return endGame(state, 'roomCollapsed');
          return enterReveal({ ...state, liveRemainingMs: 0 }, 'timeUp', null, null, []);
        }
        if (state.phase === 'tribunal') return resolveTribunal(state, event.at);
        if (state.phase === 'guess') return resolveGuess(state, event.at, null);
        if (state.phase === 'reveal') {
          if (collapsed(state)) return endGame(state, 'roomCollapsed');
          const round = state.round + 1;
          if (round >= state.config.totalRounds) return endGame(state, 'finished');
          return { state: startRound(state, round), effects: [] };
        }
        return { state, effects: [] };
      }

      if (event.type === 'playerLeft' || event.type === 'playerRejoined') {
        const wantConnected = event.type === 'playerRejoined';
        if (!state.players.includes(event.playerId)) return { state, effects: [] };
        if (state.connected[event.playerId] === wantConnected) return { state, effects: [] };
        const next: RuleHuntState = { ...state, connected: setConnected(state.connected, event.playerId, wantConnected) };
        if (!wantConnected) {
          // A leave can complete an expected set — an absent player never blocks.
          if (next.phase === 'briefing' && allActed(connectedFollowers(next), next.ackRule)) {
            return enterLiveFromBriefing(next, event.at);
          }
          if (next.phase === 'tribunal' && next.tribunal !== null
            && allActed(eligibleVoters(next, next.tribunal.accused), next.tribunal.votes)) {
            return resolveTribunal(next, event.at);
          }
          // Guesser left mid-guess: resolve as a deadline (attempt spent, resume).
          if (next.phase === 'guess' && next.guess !== null && event.playerId === next.guess.guesser) {
            return resolveGuess(next, event.at, null);
          }
        }
        return { state: next, effects: [] };
      }

      return { state, effects: [] };
    },

    view(state, viewer) {
      const isRoster = state.players.includes(viewer);
      const myRole: RuleHuntRole = isRoster ? (isDetectiveOf(state, viewer) ? 'detective' : 'follower') : null;
      const base: RuleHuntViewBase = {
        round: state.round,
        totalRounds: state.config.totalRounds,
        seats: state.players.map((p) => ({
          id: p,
          connected: state.connected[p] === true,
          eliminated: state.eliminated[p] === true,
          isDetective: isDetectiveOf(state, p),
        })),
        scores: state.scores,
        myRole,
        iAmEliminated: state.eliminated[viewer] === true,
        // Followers only, INCLUDING eliminated ones (they knew it); null for detectives and unknown viewers.
        myRule: myRole === 'follower' ? state.items[state.round]?.rule ?? null : null,
        myAccusationsLeft: state.accusationsLeft[viewer] ?? 0,
        teamGuessesLeft: state.teamGuessesLeft,
        usedCandidates: state.usedCandidates,
        lastTribunal: state.lastTribunal,
      };
      if (state.phase === 'briefing') {
        const acked = emptyPlayerMap<boolean>();
        for (const p of state.players) {
          if (!isDetectiveOf(state, p)) acked[p] = state.ackRule[p] === true;
        }
        return { phase: 'briefing', ...base, acked };
      }
      if (state.phase === 'tribunal' && state.tribunal !== null) {
        const hasVoted = emptyPlayerMap<boolean>();
        for (const p of state.players) hasVoted[p] = state.tribunal.votes[p] !== undefined;
        return {
          phase: 'tribunal',
          ...base,
          accused: state.tribunal.accused,
          accuser: state.tribunal.accuser,
          voters: eligibleVoters(state, state.tribunal.accused),
          hasVoted,
          // Owner echo only — the raw per-voter ballot map is never serialized.
          myVote: state.tribunal.votes[viewer] ?? null,
        };
      }
      if (state.phase === 'guess' && state.guess !== null) {
        return {
          phase: 'guess',
          ...base,
          guesser: state.guess.guesser,
          iAmGuessing: viewer === state.guess.guesser,
          // Byte-identical order for every roster viewer; OMITTED (null) for unknown
          // viewers — a spectator must not get a shortlist containing the secret.
          candidates: isRoster ? state.candidateTexts : null,
        };
      }
      if (state.phase === 'reveal') {
        return { phase: 'reveal', ...base, outcome: state.lastOutcome ?? EMPTY_OUTCOME, candidates: state.candidateTexts };
      }
      if (state.phase === 'over') {
        return { phase: 'over', ...base, endReason: state.endReason ?? 'finished' };
      }
      return { phase: 'live', ...base };
    },

    phaseDurationMs(state) {
      if (state.phase === 'briefing') return state.config.briefingMs;
      if (state.phase === 'live') return state.liveRemainingMs;
      if (state.phase === 'tribunal') return state.config.tribunalMs;
      if (state.phase === 'guess') return state.config.guessMs;
      if (state.phase === 'reveal') return state.config.revealMs;
      return null;
    },

    phaseKey(state) {
      if (state.phase === 'over') return 'over';
      if (state.phase === 'live') return `live:r${state.round}:s${state.liveSeg}`;
      if (state.phase === 'tribunal') return `tribunal:r${state.round}:i${state.interruptSeq}`;
      if (state.phase === 'guess') return `guess:r${state.round}:i${state.interruptSeq}`;
      return `${state.phase}:r${state.round}`;
    },
  };
}
