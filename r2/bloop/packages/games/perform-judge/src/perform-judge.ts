import type { Effect, GameModule, PlayerId, ReduceResult } from '@bloop/engine';
import { createRng, shuffle } from '@bloop/engine';
import {
  allActed,
  emptyPlayerMap,
  gameOver,
  initPresence,
  nextActiveSeat,
  roundMultiplier,
  setConnected,
} from '@bloop/kit';
import {
  commanders,
  crew,
  currentItem,
  eligibleJudges,
  pickPartner,
  reactionCounts,
  reactors,
  tapCount,
  tapGoal,
} from './helpers.js';
import { projectView } from './views.js';
import type {
  PerformJudgeAction,
  PerformJudgeConfig,
  PerformJudgeContent,
  PerformJudgeDrama,
  PerformJudgeOutcome,
  PerformJudgeState,
  PerformJudgeView,
  Reaction,
  TurnResult,
} from './state.js';

type S = PerformJudgeState;
type Result = ReduceResult<S>;

/** CONTRACT (shell no-op detection): rejection = the SAME state reference. */
const keep = (state: S): Result => ({ state, effects: [] });

/**
 * CC-2 — the Money Round multiplier for THIS turn. Pure delegation to the kit
 * `roundMultiplier`: identity (1) off the final lap or when the config knob is 1
 * (default), `finalLapMultiplier` on the final lap. Single-lap configs (puppet/
 * rate) have only lap 0, so this is ×1 there even with a knob set.
 */
function moneyRoundMultiplier(state: S): number {
  return roundMultiplier(state.lap, state.config.laps, {
    finalRoundMultiplier: state.config.finalLapMultiplier,
  });
}

/** Scale a points map by `mult`, rounding to an integer score (placement-based). */
function scalePoints(points: Record<PlayerId, number>, mult: number): Record<PlayerId, number> {
  if (mult === 1) return points; // identity: byte-identical map, no re-keying
  const scaled = emptyPlayerMap<number>();
  for (const [p, n] of Object.entries(points)) scaled[p] = Math.round(n * mult);
  return scaled;
}

/** Atomic end-of-turn: apply points, build the public TurnResult, enter reveal. */
function finishTurn(
  state: S,
  outcome: PerformJudgeOutcome,
  tally: { yes: number; no: number } | null,
  starsAgg: { avg: number; cast: number; ovation: boolean; min: number; max: number } | null,
  fast: boolean,
  rawPoints: Record<PlayerId, number>,
  drama: PerformJudgeDrama = null,
): Result {
  // CC-2 Money Round: scale the awarded points on the final lap (identity off it
  // and at the default ×1, so existing exact-score tests stay byte-identical).
  const mult = moneyRoundMultiplier(state);
  const points = scalePoints(rawPoints, mult);
  const moneyRound = mult !== 1;
  const scores = Object.assign(emptyPlayerMap<number>(), state.scores);
  for (const [p, n] of Object.entries(points)) scores[p] = (scores[p] ?? 0) + n;
  // CC-5 running PUBLIC tallies (already-public per-turn data, accumulated):
  // crowd-favourite reactions per performer + the nailbiter count.
  const counts = reactionCounts(state);
  const turnReactions = counts.fire + counts.laugh + counts.cringe;
  const reactionTotals = Object.assign(emptyPlayerMap<number>(), state.reactionTotals);
  reactionTotals[state.performer] = (reactionTotals[state.performer] ?? 0) + turnReactions;
  const nailbiterCount = state.nailbiterCount + (drama === 'nailbiter' ? 1 : 0);
  const lastResult: TurnResult = {
    performer: state.performer,
    partner: state.config.adjudication === 'claim-validate' ? (state.claim?.guesser ?? null) : state.partner,
    item: currentItem(state),
    outcome,
    tally,
    stars: starsAgg,
    fast,
    moneyRound,
    drama,
    points,
    // CC-4: snapshot the PUBLIC audience reaction counts into the reveal card.
    reactions: counts,
  };
  return {
    state: { ...state, phase: 'reveal', scores, lastResult, reactionTotals, nailbiterCount },
    effects: [{ type: 'analytics', name: 'turn_resolved', props: { turnSeq: state.turnSeq, outcome } }],
  };
}

/** guided réussi / puppet success: performer + EVERY connected helper score. */
function verdictPoints(state: S, early: boolean): Record<PlayerId, number> {
  const points = emptyPlayerMap<number>();
  points[state.performer] = state.config.successPoints + (early ? state.config.fastBonusPoints : 0);
  if (state.config.helperPoints > 0) {
    for (const helper of commanders(state)) points[helper] = state.config.helperPoints;
  }
  return points;
}

/**
 * P1-2 — aggregate-only nailbiter flag. 'nailbiter' when the verdict/validate
 * was within ONE vote of flipping AND at least one ballot was cast. Computed
 * from the public tally alone — never a per-voter ballot.
 */
function verdictDrama(tally: { yes: number; no: number }): PerformJudgeDrama {
  const cast = tally.yes + tally.no;
  return cast > 0 && Math.abs(tally.yes - tally.no) <= 1 ? 'nailbiter' : null;
}

function resolveVerdict(state: S): Result {
  const eligible = eligibleJudges(state);
  const cast = Object.values(state.votes);
  const yes = cast.filter((v) => v === 'yes').length;
  const tally = { yes, no: cast.length - yes };
  const drama = verdictDrama(tally);
  let success: boolean;
  if (cast.length === 0) {
    // guided: benefit of the doubt. puppet: fail — unless NOBODY could vote (void).
    if (!state.config.zeroVotesSucceed && eligible.length === 0) {
      return finishTurn(state, 'void', tally, null, false, emptyPlayerMap<number>());
    }
    success = state.config.zeroVotesSucceed;
  } else {
    success = yes / cast.length >= state.config.verdictThreshold; // ties generous
  }
  if (!success) return finishTurn(state, 'fail', tally, null, false, emptyPlayerMap<number>(), drama);
  return finishTurn(state, 'success', tally, null, false, verdictPoints(state, false), drama);
}

function resolveValidate(state: S): Result {
  const cast = Object.values(state.votes);
  const yes = cast.filter((v) => v === 'yes').length;
  const tally = { yes, no: cast.length - yes };
  const drama = verdictDrama(tally);
  // zero cast (incl. empty voter set) => valid — benefit of the doubt
  const valid = cast.length === 0 ? true : yes / cast.length >= state.config.verdictThreshold;
  if (!valid) return finishTurn(state, 'contested', tally, null, false, emptyPlayerMap<number>(), drama);
  const fast = state.claim !== null && state.performStartedAt !== null
    && state.claim.at - state.performStartedAt <= state.config.performMs / 2;
  const award = state.config.successPoints + (fast ? state.config.fastBonusPoints : 0);
  const points = emptyPlayerMap<number>();
  points[state.performer] = award;
  if (state.claim !== null) points[state.claim.guesser] = award;
  return finishTurn(state, 'success', tally, null, fast, points, drama);
}

function resolveStars(state: S): Result {
  const cast = Object.values(state.stars);
  const rawAvg = cast.length > 0
    ? cast.reduce((a, b) => a + b, 0) / cast.length
    : state.config.noVoteDefaultStars;
  const ovation = cast.length >= 2 && cast.every((v) => v === 5);
  const pts = Math.round(rawAvg * state.config.starMultiplier) + (ovation ? state.config.ovationBonus : 0);
  const points = emptyPlayerMap<number>();
  points[state.performer] = pts;
  if (state.partner !== null) points[state.partner] = pts;
  // Aggregate min/max of the ANONYMOUS multiset (no per-rater value); default to
  // the no-vote average so a zero-ballot card carries a coherent min==max==avg.
  const min = cast.length > 0 ? Math.min(...cast) : state.config.noVoteDefaultStars;
  const max = cast.length > 0 ? Math.max(...cast) : state.config.noVoteDefaultStars;
  // P1-2 'split': a polarised table (>= 2 ballots spanning >= 3 stars).
  const drama: PerformJudgeDrama = cast.length >= 2 && max - min >= 3 ? 'split' : null;
  const starsAgg = { avg: Math.round(rawAvg * 10) / 10, cast: cast.length, ovation, min, max };
  return finishTurn(state, 'success', null, starsAgg, false, points, drama);
}

function resolveJudge(state: S): Result {
  if (state.config.adjudication === 'stars') return resolveStars(state);
  if (state.config.adjudication === 'claim-validate') return resolveValidate(state);
  return resolveVerdict(state);
}

/** Enter judge; puppet taps carry over as pre-cast 'yes'. Resolves at once when nothing is awaited. */
function enterJudge(state: S): Result {
  let votes = state.votes;
  if (state.config.mode === 'puppet') {
    votes = emptyPlayerMap<'yes' | 'no'>();
    for (const p of state.players) if (state.taps[p] === true) votes[p] = 'yes';
  }
  const next: S = { ...state, phase: 'judge', votes };
  const buffer: Record<PlayerId, unknown> = next.config.adjudication === 'stars' ? next.stars : next.votes;
  if (allActed(eligibleJudges(next), buffer)) return resolveJudge(next);
  return { state: next, effects: [] };
}

function enterPerform(state: S, at: number): S {
  return { ...state, phase: 'perform', performStartedAt: at };
}

/** Dry-run of advanceTurn's end conditions — drives the final-scoreboard insertion. */
function wouldEnd(state: S): boolean {
  const seat = nextActiveSeat(state.rotation, state.seatIndex, state.connected);
  return state.lap + (seat.wrapped ? 1 : 0) >= state.config.laps
    || state.cursor + state.config.promptChoices > state.deck.length;
}

/** Rotation step: next spotlight turn, or 'over' (laps done / pool exhausted). */
function advanceTurn(state: S, sinceScoreboard: number, at: number): Result {
  const config = state.config;
  const seat = nextActiveSeat(state.rotation, state.seatIndex, state.connected);
  const lap = state.lap + (seat.wrapped ? 1 : 0);
  if (lap >= config.laps) {
    const over: S = { ...state, phase: 'over', lap };
    return { state: over, effects: [gameOver(over.scores)] };
  }
  if (state.cursor + config.promptChoices > state.deck.length) {
    const over: S = { ...state, phase: 'over' };
    return { state: over, effects: [{ type: 'analytics', name: 'pool_exhausted' }, gameOver(over.scores)] };
  }
  const effects: Effect[] = seat.wrapped
    ? [{ type: 'analytics', name: 'round_completed', props: { round: lap } }] // the shell's interstitial boundary
    : [];
  const performer = state.rotation[seat.index]!;
  const phase = config.readyMs > 0 ? 'ready' as const : 'perform' as const;
  const next: S = {
    ...state,
    phase,
    turnSeq: state.turnSeq + 1,
    seatIndex: seat.index,
    lap,
    performer,
    partner: config.crewSize === 2 ? pickPartner(state.rotation, seat.index, state.connected) : null,
    offer: state.deck.slice(state.cursor, state.cursor + config.promptChoices),
    cursor: state.cursor + config.promptChoices,
    chosenIndex: config.promptChoices === 1 ? 0 : null,
    performStartedAt: phase === 'perform' ? at : null,
    claim: null,
    taps: emptyPlayerMap<true>(),
    reactions: emptyPlayerMap<Reaction>(),
    votes: emptyPlayerMap<'yes' | 'no'>(),
    stars: emptyPlayerMap<number>(),
    sinceScoreboard,
    lastResult: null,
  };
  return { state: next, effects };
}

/** End of a turn's reveal: insert the scoreboard beat when due, else rotate. */
function afterReveal(state: S, at: number): Result {
  const n = state.sinceScoreboard + 1;
  const due = state.config.scoreboardEvery > 0
    && (n >= state.config.scoreboardEvery || wouldEnd(state));
  if (due) return { state: { ...state, phase: 'scoreboard', sinceScoreboard: 0 }, effects: [] };
  return advanceTurn(state, n, at);
}

function onAction(state: S, playerId: PlayerId, action: PerformJudgeAction, at: number): Result {
  const config = state.config;

  if (state.phase === 'ready') {
    if (action.kind === 'ready' && config.mode === 'guided' && playerId === state.performer) {
      return { state: enterPerform(state, at), effects: [] };
    }
    if (action.kind === 'pick' && config.mode === 'rate' && playerId === state.performer
      && Number.isInteger(action.index) && action.index >= 0 && action.index < state.offer.length) {
      return { state: enterPerform({ ...state, chosenIndex: action.index }, at), effects: [] };
    }
    return keep(state);
  }

  if (state.phase === 'perform') {
    const isPerformer = playerId === state.performer;
    // CC-4 — audience live-reaction (NON-SCORING). Accept a fixed-enum react
    // from any connected non-actor; accumulate into the SEPARATE `reactions`
    // buffer (first react per player locks). It NEVER resolves the turn and is
    // checked before the mode-specific scoring actions so it can never flow
    // into a resolve path. Reject-invalid => SAME state reference.
    if (action.kind === 'react') {
      if (action.reaction !== 'fire' && action.reaction !== 'laugh' && action.reaction !== 'cringe') {
        return keep(state);
      }
      if (!reactors(state).includes(playerId)) return keep(state);
      if (state.reactions[playerId] !== undefined) return keep(state); // first react locks
      const reactions = Object.assign(emptyPlayerMap<Reaction>(), state.reactions, {
        [playerId]: action.reaction,
      });
      return { state: { ...state, reactions }, effects: [] };
    }
    if (config.mode === 'guided' && isPerformer) {
      if (action.kind === 'claimDone') return enterJudge(state);
      if (action.kind === 'giveUp') {
        return finishTurn(state, 'fail', null, null, false, emptyPlayerMap<number>());
      }
    }
    if (config.mode === 'credit' && isPerformer && action.kind === 'claimFound') {
      const { guesser } = action;
      if (typeof guesser !== 'string' || !state.players.includes(guesser)) return keep(state);
      if (guesser === state.performer || state.connected[guesser] !== true) return keep(state);
      return enterJudge({ ...state, claim: { guesser, at } });
    }
    if ((config.mode === 'guided' || config.mode === 'credit') && isPerformer && action.kind === 'pass') {
      if ((state.passesLeft[playerId] ?? 0) <= 0) return keep(state);
      const passesLeft = Object.assign(emptyPlayerMap<number>(), state.passesLeft, {
        [playerId]: (state.passesLeft[playerId] ?? 0) - 1,
      });
      const points = emptyPlayerMap<number>();
      if (config.passPoints > 0) points[playerId] = config.passPoints;
      return finishTurn({ ...state, passesLeft }, 'passed', null, null, false, points);
    }
    if (config.mode === 'puppet' && action.kind === 'tap') {
      if (isPerformer || state.connected[playerId] !== true) return keep(state);
      if (state.taps[playerId] === true) return keep(state);
      const taps = Object.assign(emptyPlayerMap<true>(), state.taps, { [playerId]: true as const });
      const next: S = { ...state, taps };
      if (config.earlyMajorityResolve && tapCount(next) >= tapGoal(next)) {
        return finishTurn(next, 'success-early', { yes: tapCount(next), no: 0 }, null, false, verdictPoints(next, true));
      }
      return { state: next, effects: [] };
    }
    if (config.mode === 'rate' && action.kind === 'done') {
      if (!crew(state).includes(playerId) || state.taps[playerId] === true) return keep(state);
      const taps = Object.assign(emptyPlayerMap<true>(), state.taps, { [playerId]: true as const });
      const next: S = { ...state, taps };
      const connectedCrew = crew(next).filter((p) => next.connected[p] === true);
      if (allActed(connectedCrew, next.taps)) return enterJudge(next);
      return { state: next, effects: [] };
    }
    return keep(state);
  }

  if (state.phase === 'judge') {
    if (action.kind === 'vote' && config.adjudication !== 'stars') {
      if (action.vote !== 'yes' && action.vote !== 'no') return keep(state);
      if (!eligibleJudges(state).includes(playerId)) return keep(state);
      if (state.votes[playerId] !== undefined) return keep(state); // first vote locks
      const votes = Object.assign(emptyPlayerMap<'yes' | 'no'>(), state.votes, { [playerId]: action.vote });
      const next: S = { ...state, votes };
      if (allActed(eligibleJudges(next), votes)) return resolveJudge(next);
      return { state: next, effects: [] };
    }
    if (action.kind === 'rate' && config.adjudication === 'stars') {
      if (!Number.isInteger(action.stars) || action.stars < 1 || action.stars > 5) return keep(state);
      if (!eligibleJudges(state).includes(playerId)) return keep(state);
      if (state.stars[playerId] !== undefined) return keep(state); // first tap locks
      const stars = Object.assign(emptyPlayerMap<number>(), state.stars, { [playerId]: action.stars });
      const next: S = { ...state, stars };
      if (allActed(eligibleJudges(next), stars)) return resolveJudge(next);
      return { state: next, effects: [] };
    }
    return keep(state);
  }

  return keep(state); // reveal / scoreboard: no actions
}

function onDeadline(state: S, at: number): Result {
  const config = state.config;
  if (state.phase === 'ready') {
    // rate: deterministic auto-pick offer[0] for a passive mover
    const base = config.mode === 'rate' && state.chosenIndex === null
      ? { ...state, chosenIndex: 0 }
      : state;
    return { state: enterPerform(base, at), effects: [] };
  }
  if (state.phase === 'perform') {
    if (config.mode === 'puppet' || config.mode === 'rate') return enterJudge(state);
    // guided timeout = auto-fail (no pass burnt); credit timeout = MISSED
    return finishTurn(state, 'fail', null, null, false, emptyPlayerMap<number>());
  }
  if (state.phase === 'judge') return resolveJudge(state);
  if (state.phase === 'reveal') return afterReveal(state, at);
  if (state.phase === 'scoreboard') return advanceTurn(state, state.sinceScoreboard, at);
  return keep(state);
}

function onLeft(state: S, leaver: PlayerId, at: number): Result {
  const config = state.config;
  if (leaver === state.performer) {
    if (config.mode === 'rate' && (state.phase === 'ready' || state.phase === 'perform')) {
      // mover loss voids the turn — rotation advances, nobody scores
      const advanced = advanceTurn(state, state.sinceScoreboard + 1, at);
      return { state: advanced.state, effects: [{ type: 'analytics', name: 'crew_left' }, ...advanced.effects] };
    }
    if (config.mode === 'puppet' && (state.phase === 'perform' || state.phase === 'judge')) {
      return finishTurn(state, 'void', null, null, false, emptyPlayerMap<number>());
    }
    if ((config.mode === 'guided' || config.mode === 'credit') && state.phase === 'ready') {
      return finishTurn(state, 'void', null, null, false, emptyPlayerMap<number>());
    }
    if ((config.mode === 'guided' || config.mode === 'credit') && state.phase === 'perform') {
      return finishTurn(state, 'fail', null, null, false, emptyPlayerMap<number>());
    }
    // judge (guided/credit) and reveal/scoreboard: the votes decide / timers roll on
  }
  if (config.mode === 'rate' && state.phase === 'ready' && leaver === state.partner) {
    return { state: { ...state, partner: pickPartner(state.rotation, state.seatIndex, state.connected) }, effects: [] };
  }
  if (state.phase === 'perform') {
    if (config.mode === 'puppet' && config.earlyMajorityResolve && tapCount(state) >= tapGoal(state) && tapCount(state) > 0) {
      return finishTurn(state, 'success-early', { yes: tapCount(state), no: 0 }, null, false, verdictPoints(state, true));
    }
    if (config.mode === 'rate') {
      const connectedCrew = crew(state).filter((p) => state.connected[p] === true);
      if (connectedCrew.length > 0 && allActed(connectedCrew, state.taps)) return enterJudge(state);
    }
  }
  if (state.phase === 'judge') {
    // a leave can complete (or empty) the expected set — never block on the absent
    const buffer: Record<PlayerId, unknown> = config.adjudication === 'stars' ? state.stars : state.votes;
    if (allActed(eligibleJudges(state), buffer)) return resolveJudge(state);
  }
  return { state, effects: [] };
}

/**
 * PERFORM_JUDGE — rotating spotlight performs IRL, the room judges on-phone.
 * Four catalog games on one reducer: devine-l-action (`guided`), devine-l-objet
 * (`credit`), mime-inverse (`puppet`), double-le-mouvement (`rate`).
 * Platform contract: rejection returns the SAME state reference; judgment
 * buffers stay hidden until the atomic reveal; every timed phase rolls forward
 * on deadlines alone.
 */
export function createPerformJudge(
  id: string,
  config: PerformJudgeConfig,
): GameModule<S, PerformJudgeAction, PerformJudgeView, PerformJudgeContent> {
  return {
    id,
    version: 1,
    minPlayers: config.minPlayers,
    maxPlayers: 16,

    init(seed, players, content) {
      const rotation = shuffle(createRng(`${seed}|rot`), players);
      const deck = shuffle(createRng(`${seed}|deck`), content.data.items);
      const scores = emptyPlayerMap<number>();
      const passesLeft = emptyPlayerMap<number>();
      for (const p of players) {
        scores[p] = 0;
        passesLeft[p] = config.passesPerPlayer;
      }
      const exhausted = deck.length < config.promptChoices; // degenerate pack: born over
      const connected = initPresence(players);
      return {
        config: { ...config },
        players: [...players],
        rotation,
        connected,
        phase: exhausted ? 'over' : config.readyMs > 0 ? 'ready' : 'perform',
        turnSeq: 0,
        seatIndex: 0,
        lap: 0,
        performer: rotation[0] ?? '',
        partner: config.crewSize === 2 && !exhausted ? pickPartner(rotation, 0, connected) : null,
        deck,
        cursor: exhausted ? 0 : config.promptChoices,
        offer: exhausted ? [] : deck.slice(0, config.promptChoices),
        chosenIndex: config.promptChoices === 1 ? 0 : null,
        performStartedAt: null,
        claim: null,
        taps: emptyPlayerMap<true>(),
        reactions: emptyPlayerMap<Reaction>(),
        votes: emptyPlayerMap<'yes' | 'no'>(),
        stars: emptyPlayerMap<number>(),
        passesLeft,
        scores,
        sinceScoreboard: 0,
        lastResult: null,
        reactionTotals: emptyPlayerMap<number>(),
        nailbiterCount: 0,
      };
    },

    reduce(state, event) {
      if (state.phase === 'over') return keep(state);

      if (event.type === 'action') {
        if (!state.players.includes(event.playerId)) return keep(state);
        return onAction(state, event.playerId, event.action, event.at);
      }

      if (event.type === 'deadline') return onDeadline(state, event.at);

      if (event.type === 'playerLeft' || event.type === 'playerRejoined') {
        const want = event.type === 'playerRejoined';
        if (!state.players.includes(event.playerId)) return keep(state);
        if (state.connected[event.playerId] === want) return keep(state);
        const next: S = { ...state, connected: setConnected(state.connected, event.playerId, want) };
        if (!want) return onLeft(next, event.playerId, event.at);
        return { state: next, effects: [] };
      }

      return keep(state);
    },

    view: projectView,

    phaseDurationMs(state) {
      if (state.phase === 'ready') return state.config.readyMs;
      if (state.phase === 'perform') return state.config.performMs;
      if (state.phase === 'judge') return state.config.judgeMs;
      if (state.phase === 'reveal') return state.config.revealMs;
      if (state.phase === 'scoreboard') return state.config.scoreboardMs;
      return null;
    },

    phaseKey(state) {
      return state.phase === 'over' ? 'over' : `${state.phase}:${state.turnSeq}`;
    },
  };
}
