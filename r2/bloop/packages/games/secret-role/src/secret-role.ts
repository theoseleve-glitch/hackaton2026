import type { Effect, GameModule, PlayerId, ReduceResult } from '@bloop/engine';
import { createRng, shuffle } from '@bloop/engine';
import {
  allActed,
  connectedPlayers,
  emptyPlayerMap,
  emptySideBets,
  gameOver,
  initPresence,
  mvp,
  placeSideBet,
  redactSideBets,
  resolveSideBets,
  setConnected,
  tally,
  type Presence,
} from '@bloop/kit';
import type {
  LText,
  MatchEndReason,
  MatchResult,
  SecretRoleAction,
  SecretRoleConfig,
  SecretRoleContent,
  SecretRoleState,
  SecretRoleView,
  SessionCliffhanger,
  SessionStreak,
  VoteRecord,
} from './state.js';

const EMPTY_L: LText = { fr: '', en: '' };
const EMPTY_VOTE: VoteRecord = { voteRound: 0, tally: {}, abstained: [], topAccused: null, caught: false };
const EMPTY_RESULT: MatchResult = {
  match: 0, itemId: '', theme: EMPTY_L, majorityItem: EMPTY_L, impostorItem: EMPTY_L,
  impostor: '', winners: 'civilians', caughtOnVote: null, endReason: 'impostorLeft',
  voteRecords: [], points: {},
};

function zeroPoints(players: readonly PlayerId[]): Record<PlayerId, number> {
  const m = emptyPlayerMap<number>();
  for (const p of players) m[p] = 0;
  return m;
}

function clonePoints(m: Record<PlayerId, number>): Record<PlayerId, number> {
  return Object.assign(emptyPlayerMap<number>(), m);
}

/**
 * CC-2 comeback weighting — the per-match score multiplier for `match`, read
 * clamp-safe from `config.matchScoreMultiplier`. DEFAULT-IDENTITY: a missing
 * array, a missing/short entry, or a non-finite / <= 0 value all yield 1, so an
 * unconfigured (or misconfigured) template is byte-for-byte unchanged and can
 * never zero-out or invert a match's score. Pure — no RNG, no wall-clock.
 */
function matchMultiplier(config: SecretRoleConfig, match: number): number {
  const arr = config.matchScoreMultiplier;
  if (arr === undefined) return 1;
  const m = arr[match];
  if (m === undefined || !Number.isFinite(m) || m <= 0) return 1;
  return m;
}

/**
 * Apply the CC-2 match multiplier to a per-player points map, ONCE, in place on
 * a fresh clone. Deterministic rounding (Math.round — pure, no RNG); identity
 * (×1) is a structural no-op so existing match-0 scores stay byte-identical.
 */
function applyMatchMultiplier(
  points: Record<PlayerId, number>,
  players: readonly PlayerId[],
  mult: number,
): Record<PlayerId, number> {
  if (mult === 1) return points;
  const scaled = clonePoints(points);
  for (const p of players) scaled[p] = Math.round((scaled[p] ?? 0) * mult);
  return scaled;
}

/**
 * CC-5 cliffhanger — derived PURELY from the already-public `results` array at
 * finalReveal/over. No new in-match secret: every input (winner, impostor id,
 * caughtOnVote) is public from finalReveal on. Deterministic; input untouched.
 */
function deriveCliffhanger(
  results: readonly MatchResult[],
  scores: Record<PlayerId, number>,
): SessionCliffhanger {
  // Current consecutive-win run (civilians vs impostor), folded from the tail.
  let streak: SessionStreak = { side: null, count: 0 };
  if (results.length > 0) {
    const side = results[results.length - 1]!.winners;
    let count = 0;
    for (let i = results.length - 1; i >= 0; i--) {
      if (results[i]!.winners === side) count += 1;
      else break;
    }
    streak = { side, count };
  }
  // Per-player "caught" participation: civilian side of a vote-catch match.
  const detectiveHits = emptyPlayerMap<number>();
  for (const r of results) {
    if (r.winners !== 'civilians' || r.caughtOnVote === null) continue;
    for (const p of Object.keys(r.points)) {
      if (p === r.impostor) continue;
      detectiveHits[p] = (detectiveHits[p] ?? 0) + 1;
    }
  }
  // Drop zero entries (tally convention) for a clean public payload.
  for (const p of Object.keys(detectiveHits)) {
    if (detectiveHits[p] === 0) delete detectiveHits[p];
  }
  return {
    streak,
    detectiveMvp: mvp(scores),
    detectiveHits,
    matchesPlayed: results.length,
  };
}

/** Unique plurality target, or null on tie / all-abstain (impostor doc §4.5, verbatim). */
function uniquePlurality(counts: Record<PlayerId, number>): PlayerId | null {
  let best: PlayerId | null = null;
  let bestCount = 0;
  let tied = false;
  for (const [id, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = id;
      bestCount = count;
      tied = false;
    } else if (count === bestCount && count > 0) {
      tied = true;
    }
  }
  return tied || bestCount === 0 ? null : best;
}

/** First CONNECTED player in the seeded order — a ghost can never be seeded as the hunt target. */
function pickImpostor(order: readonly PlayerId[], connected: Presence): PlayerId {
  return order.find((p) => connected[p] === true) ?? order[0] ?? '';
}

function enterDiscuss(state: SecretRoleState, period: number): ReduceResult<SecretRoleState> {
  // Re-open the lean side-bet for this discuss period (one stake per period —
  // clearing here is the "updatable across periods" mechanism, mirroring `ready`).
  return {
    state: {
      ...state,
      phase: 'discuss',
      period,
      ready: emptyPlayerMap<true>(),
      leans: emptySideBets<PlayerId>(),
    },
    effects: [],
  };
}

function enterVote(state: SecretRoleState): ReduceResult<SecretRoleState> {
  return {
    state: { ...state, phase: 'vote', votes: emptyPlayerMap<PlayerId>() },
    effects: [],
  };
}

/** Fold this match's pendingPoints into scores and reveal everything atomically. */
function endMatch(
  state: SecretRoleState,
  endReason: MatchEndReason,
  winners: 'civilians' | 'impostor',
  caughtOnVote: number | null,
  effects: Effect[],
): ReduceResult<SecretRoleState> {
  const item = state.items[state.match] ?? { id: '', theme: EMPTY_L, majority: EMPTY_L, impostor: EMPTY_L };
  const raw = clonePoints(state.pendingPoints);
  // CC-1 lean side-bet resolves now, against the (about-to-be-public) impostor:
  // any player whose hidden discuss lean named the impostor earns a small bonus.
  // resolveSideBets is upside-only (clamps non-positive), so a 0 bonus or a
  // wrong/absent lean adds nothing — the side-bet never docks the primary score.
  const leanBonus = resolveSideBets(
    state.leans,
    state.impostor,
    (suspect, impostor) => (suspect === impostor ? state.config.scoring.leanBonusCorrect : 0),
  );
  for (const p of state.players) raw[p] = (raw[p] ?? 0) + (leanBonus[p] ?? 0);
  // CC-2 comeback weighting: scale this WHOLE match's points once (default ×1 =
  // identity, so match-0 / unconfigured awards are byte-for-byte unchanged). The
  // multiplier reshapes WHO wins the night, not the per-award rules above.
  const points = applyMatchMultiplier(raw, state.players, matchMultiplier(state.config, state.match));
  const scores = clonePoints(state.scores);
  for (const p of state.players) scores[p] = (scores[p] ?? 0) + (points[p] ?? 0);
  const result: MatchResult = {
    match: state.match,
    itemId: item.id,
    theme: item.theme,
    majorityItem: item.majority,
    impostorItem: item.impostor,
    impostor: state.impostor,
    winners,
    caughtOnVote,
    endReason,
    voteRecords: state.voteRecords,
    points,
  };
  return {
    state: { ...state, phase: 'finalReveal', scores, results: [...state.results, result] },
    effects: [
      ...effects,
      { type: 'analytics', name: 'match_completed', props: { match: state.match, winners, endReason } },
    ],
  };
}

/**
 * Promote the hidden votes buffer atomically: tally, award hidden points,
 * then branch — caught ends the match; a vote-1 miss enters the verdict beat;
 * a vote-2 miss hands the impostor the win (never a third period).
 */
function resolveVote(state: SecretRoleState): ReduceResult<SecretRoleState> {
  const cfg = state.config.scoring;
  const counts = tally(state.votes);
  const abstained = state.players.filter((p) => state.votes[p] === undefined);
  const top = uniquePlurality(counts);
  const caught = top !== null && top === state.impostor;
  const record: VoteRecord = { voteRound: state.period, tally: counts, abstained, topAccused: top, caught };

  // Civilian ballot points stay HIDDEN until finalReveal — a visible +1 would out the impostor.
  const pendingPoints = clonePoints(state.pendingPoints);
  for (const p of state.players) {
    if (p !== state.impostor && state.votes[p] === state.impostor) {
      pendingPoints[p] = (pendingPoints[p] ?? 0) + cfg.civilianCorrectBallotPerVote;
    }
  }

  const effects: Effect[] = [
    { type: 'analytics', name: 'vote_resolved', props: { match: state.match, period: state.period, caught } },
  ];
  const resolved: SecretRoleState = {
    ...state,
    votes: emptyPlayerMap<PlayerId>(),
    voteRecords: [...state.voteRecords, record],
    pendingPoints,
  };

  if (caught) {
    const bonus = state.period === 0 ? cfg.teamBonusCaughtVote1 : cfg.teamBonusCaughtVote2;
    for (const p of state.players) {
      if (p !== state.impostor) pendingPoints[p] = (pendingPoints[p] ?? 0) + bonus;
    }
    return endMatch(
      resolved,
      state.period === 0 ? 'caughtVote1' : 'caughtVote2',
      'civilians',
      state.period,
      effects,
    );
  }

  if (state.period === 0) {
    // Survived vote 1: banked, kept even if caught on vote 2.
    pendingPoints[state.impostor] = (pendingPoints[state.impostor] ?? 0) + cfg.impostorSurvivesVote1;
    return { state: { ...resolved, phase: 'verdict' }, effects };
  }

  // Final vote missed — the impostor wins outright.
  pendingPoints[state.impostor] = (pendingPoints[state.impostor] ?? 0) + cfg.impostorWinsBonus;
  return endMatch(resolved, 'impostorWins', 'impostor', null, effects);
}

/** THE impostor left mid-hunt: the match ends now — civilians get the consolation, the impostor 0. */
function impostorLeftEnd(state: SecretRoleState): ReduceResult<SecretRoleState> {
  const cfg = state.config.scoring;
  const pendingPoints = clonePoints(state.pendingPoints);
  pendingPoints[state.impostor] = 0;
  for (const p of state.players) {
    if (p !== state.impostor) {
      pendingPoints[p] = (pendingPoints[p] ?? 0) + cfg.impostorDisconnectCivilianConsolation;
    }
  }
  return endMatch(
    { ...state, votes: emptyPlayerMap<PlayerId>(), pendingPoints },
    'impostorLeft',
    'civilians',
    null,
    [],
  );
}

function startMatch(state: SecretRoleState, match: number): SecretRoleState {
  return {
    ...state,
    match,
    phase: 'secretReveal',
    period: 0,
    impostor: pickImpostor(state.impostorPool[match] ?? state.players, state.connected),
    acked: emptyPlayerMap<true>(),
    ready: emptyPlayerMap<true>(),
    votes: emptyPlayerMap<PlayerId>(),
    leans: emptySideBets<PlayerId>(),
    voteRecords: [],
    pendingPoints: zeroPoints(state.players),
  };
}

function afterFinalReveal(state: SecretRoleState): ReduceResult<SecretRoleState> {
  const next = state.match + 1;
  if (next >= state.totalMatches) {
    const over: SecretRoleState = { ...state, phase: 'over' };
    return { state: over, effects: [gameOver(over.scores)] };
  }
  return { state: startMatch(state, next), effects: [] };
}

/**
 * SECRET_ROLE@2, accusation branch (double-jeu): everyone secretly gets the
 * same item except one — two discussion periods, two hidden accusation votes,
 * no elimination, no clue turns, nobody told their role. Per the platform
 * contract: rejecting an event returns the SAME state reference; votes stay in
 * a hidden buffer until the atomic resolution; a disconnected player never
 * blocks a phase.
 */
export function createSecretRole(
  id: string,
  config: SecretRoleConfig,
): GameModule<SecretRoleState, SecretRoleAction, SecretRoleView, SecretRoleContent> {
  return {
    id,
    version: 1,
    minPlayers: 4,
    maxPlayers: 16,

    init(seed, players, content) {
      const rng = createRng(seed);
      const items = shuffle(rng, content.data.items);
      const totalMatches = Math.min(config.matchesPerSession, items.length);
      const impostorPool: PlayerId[][] = [];
      for (let m = 0; m < Math.max(1, totalMatches); m++) impostorPool.push(shuffle(rng, players));
      const connected = initPresence(players);
      return {
        config: { ...config },
        players: [...players],
        connected,
        items,
        impostorPool,
        impostor: pickImpostor(impostorPool[0] ?? [...players], connected),
        totalMatches,
        match: 0,
        phase: totalMatches === 0 ? 'over' : 'secretReveal',
        period: 0,
        acked: emptyPlayerMap<true>(),
        ready: emptyPlayerMap<true>(),
        votes: emptyPlayerMap<PlayerId>(),
        leans: emptySideBets<PlayerId>(),
        voteRecords: [],
        pendingPoints: zeroPoints(players),
        results: [],
        scores: zeroPoints(players),
      };
    },

    reduce(state, event) {
      if (state.phase === 'over') return { state, effects: [] };

      if (event.type === 'action') {
        const { playerId, action } = event;
        if (!state.players.includes(playerId)) return { state, effects: [] };

        if (action.kind === 'ack' && state.phase === 'secretReveal') {
          if (state.acked[playerId] === true) return { state, effects: [] };
          const acked = Object.assign(emptyPlayerMap<true>(), state.acked, { [playerId]: true as const });
          const next = { ...state, acked };
          if (allActed(connectedPlayers(next.players, next.connected), acked)) {
            return enterDiscuss(next, 0);
          }
          return { state: next, effects: [] };
        }

        if (action.kind === 'ready' && state.phase === 'discuss') {
          if (state.ready[playerId] === true) return { state, effects: [] };
          const ready = Object.assign(emptyPlayerMap<true>(), state.ready, { [playerId]: true as const });
          const next = { ...state, ready };
          if (allActed(connectedPlayers(next.players, next.connected), ready)) {
            return enterVote(next);
          }
          return { state: next, effects: [] };
        }

        // CC-1 "lean": a hidden discuss-time side-bet on the suspected impostor.
        // It is a SEPARATE buffer from `ready`/`votes` and is NEVER counted
        // toward `allActed` — it can never gate the early-resolve (the room still
        // advances only on all-`ready`). placeSideBet returns null on any reject
        // (self-target, non-roster target, or a re-lean over this period's stake),
        // which we map to the SAME state reference (no transition, no mutation).
        if (action.kind === 'lean' && state.phase === 'discuss') {
          const target = action.target;
          const eligible = target !== playerId && state.players.includes(target);
          const leans = placeSideBet(state.leans, playerId, target, eligible);
          if (leans === null) return { state, effects: [] };
          return { state: { ...state, leans }, effects: [] };
        }

        if (action.kind === 'vote' && state.phase === 'vote') {
          const target = action.target;
          if (target === playerId) return { state, effects: [] }; // self-vote inert
          if (!state.players.includes(target)) return { state, effects: [] };
          if (state.votes[playerId] !== undefined) return { state, effects: [] }; // first vote locks
          const votes = Object.assign(emptyPlayerMap<PlayerId>(), state.votes, { [playerId]: target });
          const next = { ...state, votes };
          if (allActed(connectedPlayers(next.players, next.connected), votes)) {
            return resolveVote(next);
          }
          return { state: next, effects: [] };
        }

        return { state, effects: [] };
      }

      if (event.type === 'deadline') {
        if (state.phase === 'secretReveal') return enterDiscuss(state, 0);
        if (state.phase === 'discuss') return enterVote(state);
        if (state.phase === 'vote') return resolveVote(state);
        if (state.phase === 'verdict') return enterDiscuss(state, 1);
        if (state.phase === 'finalReveal') return afterFinalReveal(state);
        return { state, effects: [] };
      }

      if (event.type === 'playerLeft' || event.type === 'playerRejoined') {
        const wantConnected = event.type === 'playerRejoined';
        if (!state.players.includes(event.playerId)) return { state, effects: [] };
        if (state.connected[event.playerId] === wantConnected) return { state, effects: [] };
        const next = { ...state, connected: setConnected(state.connected, event.playerId, wantConnected) };
        if (!wantConnected) {
          // The impostor leaving mid-hunt invalidates the match (design risk: never hunt a ghost).
          if (event.playerId === next.impostor && next.phase !== 'finalReveal') {
            return impostorLeftEnd(next);
          }
          // A leave can complete the expected set — never let an absent player block.
          const expected = connectedPlayers(next.players, next.connected);
          if (next.phase === 'secretReveal' && allActed(expected, next.acked)) return enterDiscuss(next, 0);
          if (next.phase === 'discuss' && allActed(expected, next.ready)) return enterVote(next);
          if (next.phase === 'vote' && allActed(expected, next.votes)) return resolveVote(next);
        }
        return { state: next, effects: [] };
      }

      return { state, effects: [] };
    },

    view(state, viewer) {
      const isPlayer = state.players.includes(viewer);
      const item = state.items[state.match];
      const base = {
        match: state.match,
        totalMatches: state.totalMatches,
        theme: item !== undefined ? item.theme : EMPTY_L,
        scores: state.scores,
      };
      // Public record of the previous vote round of THIS match (period 1 only).
      const lastVote = state.period === 1 ? state.voteRecords[0] ?? null : null;

      if (state.phase === 'secretReveal') {
        const acked = emptyPlayerMap<boolean>();
        for (const p of state.players) acked[p] = state.acked[p] === true;
        const myItem = isPlayer && item !== undefined
          ? (viewer === state.impostor ? item.impostor : item.majority)
          : null;
        return { phase: 'secretReveal', ...base, myItem, acked, iAcked: state.acked[viewer] === true };
      }
      if (state.phase === 'discuss') {
        const ready = emptyPlayerMap<boolean>();
        for (const p of state.players) ready[p] = state.ready[p] === true;
        // OWNER-ONLY lean echo + public count. No revealAll here (or anywhere
        // pre-`over`): a non-owner never receives `bets`, only the aggregate
        // count, so a lean can never be inverted to out the impostor mid-match.
        const leanView = redactSideBets(state.leans, viewer);
        return {
          phase: 'discuss', ...base, period: state.period,
          ready, iAmReady: state.ready[viewer] === true, lastVote,
          myLean: isPlayer ? leanView.own : null,
          leanCount: leanView.count,
        };
      }
      if (state.phase === 'vote') {
        const hasVoted = emptyPlayerMap<boolean>();
        for (const p of state.players) hasVoted[p] = state.votes[p] !== undefined;
        return {
          phase: 'vote', ...base, voteRound: state.period, hasVoted,
          myVote: isPlayer ? state.votes[viewer] ?? null : null,
          votableTargets: isPlayer ? state.players.filter((p) => p !== viewer) : [],
          lastVote,
        };
      }
      if (state.phase === 'verdict') {
        return { phase: 'verdict', ...base, vote: state.voteRecords[0] ?? EMPTY_VOTE };
      }
      if (state.phase === 'finalReveal') {
        return {
          phase: 'finalReveal', ...base,
          result: state.results[state.results.length - 1] ?? EMPTY_RESULT,
          // CC-5: derived purely from the now-public results (no new secret).
          cliffhanger: deriveCliffhanger(state.results, state.scores),
        };
      }
      return {
        phase: 'over',
        totalMatches: state.totalMatches,
        scores: state.scores,
        results: state.results,
        cliffhanger: deriveCliffhanger(state.results, state.scores),
      };
    },

    phaseDurationMs(state) {
      if (state.phase === 'secretReveal') return state.config.secretRevealMs;
      if (state.phase === 'discuss') return state.period === 0 ? state.config.discussMs : state.config.discuss2Ms;
      if (state.phase === 'vote') return state.config.voteMs;
      if (state.phase === 'verdict') return state.config.verdictMs;
      if (state.phase === 'finalReveal') return state.config.finalRevealMs;
      return null;
    },

    phaseKey(state) {
      if (state.phase === 'over') return 'over';
      if (state.phase === 'discuss' || state.phase === 'vote' || state.phase === 'verdict') {
        return `${state.phase}:m${state.match}:p${state.period}`;
      }
      return `${state.phase}:m${state.match}`;
    },
  };
}
