import type { Effect, GameModule, PlayerId, ReduceResult } from '@bloop/engine';
import { createRng, shuffle } from '@bloop/engine';
import {
  allActed,
  connectedPlayers,
  emptyPlayerMap,
  initPresence,
  isCloseFinish,
  mvp,
  setConnected,
  topGap,
} from '@bloop/kit';
import {
  DEFAULT_CONFIG,
  type RoundResult,
  type WhoSaidThatAction,
  type WhoSaidThatConfig,
  type WhoSaidThatEpilogue,
  type WhoSaidThatStatement,
  type WhoSaidThatState,
  type WhoSaidThatView,
} from './state.js';

export interface WhoSaidThatContent {
  /** Plain strings (legacy single-locale) and/or bilingual {fr,en} confession cards. */
  statements: WhoSaidThatStatement[];
}

/** Close-finish threshold (top-2 gap): a 1-point race is a cliffhanger. */
const CLIFFHANGER_GAP = 1;

const EMPTY_RESULT: RoundResult = {
  confessors: [],
  accusations: {},
  hits: [],
  ghosts: [],
  delta: {},
};

/** Derive the CC-5 cliffhanger from the ALREADY-PUBLIC final scores. Pure. */
function deriveEpilogue(scores: Record<PlayerId, number>): WhoSaidThatEpilogue {
  return {
    closeFinish: isCloseFinish(scores, CLIFFHANGER_GAP),
    topGap: topGap(scores),
    mvp: mvp(scores),
  };
}

/** The MOI players for the current round, in roster order. Derived from the hidden buffer. */
function confessorsOf(state: WhoSaidThatState): PlayerId[] {
  return state.players.filter((p) => state.confessions[p] === true);
}

/** How many players confessed MOI — the public CLUE shown from the attribute phase on. */
function confessorCountOf(state: WhoSaidThatState): number {
  let n = 0;
  for (const p of state.players) if (state.confessions[p] === true) n += 1;
  return n;
}

/**
 * CONFESS -> ATTRIBUTE. The confession buffer FREEZES (it is never re-touched
 * after this) and only its COUNT becomes public (the attribute-phase clue). No
 * scoring happens here; the identities stay hidden until reveal.
 */
function resolveConfess(state: WhoSaidThatState): ReduceResult<WhoSaidThatState> {
  return {
    state: { ...state, phase: 'attribute', accusations: emptyPlayerMap<PlayerId>() },
    effects: [],
  };
}

/**
 * ATTRIBUTE -> REVEAL. The atomic promotion: tally the hidden accusations
 * against the (now-frozen) confessor set, score deterministically (no RNG), and
 * expose `confessors` + `accusations` + `delta` BY NAME for the first time.
 *
 * Scoring:
 *  - an accuser scores +hitPoints if their accusation landed on a real confessor;
 *  - each confessor that NOBODY accused gets +ghostBonus (got away with it).
 */
function resolveAttribute(state: WhoSaidThatState): ReduceResult<WhoSaidThatState> {
  const confessorSet = new Set(confessorsOf(state));
  const accused = new Set<PlayerId>();
  for (const p of state.players) {
    const target = state.accusations[p];
    if (target !== undefined) accused.add(target);
  }

  const scores = Object.assign(emptyPlayerMap<number>(), state.scores);
  const delta = emptyPlayerMap<number>();
  for (const p of state.players) delta[p] = 0;

  // HIT: an accuser who pointed at a real confessor scores +hitPoints.
  const hits: PlayerId[] = [];
  for (const p of state.players) {
    const target = state.accusations[p];
    if (target !== undefined && confessorSet.has(target)) {
      scores[p] = (scores[p] ?? 0) + state.config.hitPoints;
      delta[p] = (delta[p] ?? 0) + state.config.hitPoints;
      hits.push(p);
    }
  }

  // GHOST: a confessor NOBODY accused gets away with it -> +ghostBonus.
  const ghosts: PlayerId[] = [];
  for (const p of confessorsOf(state)) {
    if (!accused.has(p)) {
      scores[p] = (scores[p] ?? 0) + state.config.ghostBonus;
      delta[p] = (delta[p] ?? 0) + state.config.ghostBonus;
      ghosts.push(p);
    }
  }

  const lastResult: RoundResult = {
    confessors: confessorsOf(state),
    accusations: Object.assign(emptyPlayerMap<PlayerId>(), state.accusations),
    hits,
    ghosts,
    delta,
  };

  return {
    state: { ...state, phase: 'reveal', scores, lastResult },
    effects: [{ type: 'analytics', name: 'round_revealed', props: { round: state.round } }],
  };
}

/** REVEAL -> next CONFESS round, or -> over with a gameOver effect carrying cloned scores. */
function nextRound(state: WhoSaidThatState): ReduceResult<WhoSaidThatState> {
  const round = state.round + 1;
  if (round >= state.config.totalRounds) {
    const over: WhoSaidThatState = { ...state, phase: 'over', lastResult: null };
    // gameOver clones scores — the effect payload must never alias live state.
    return {
      state: over,
      effects: [{ type: 'gameOver', scores: Object.assign(emptyPlayerMap<number>(), over.scores) }],
    };
  }
  return {
    state: {
      ...state,
      round,
      phase: 'confess',
      confessions: emptyPlayerMap<boolean>(),
      accusations: emptyPlayerMap<PlayerId>(),
      lastResult: null,
    },
    effects: [],
  };
}

/**
 * CONFESS@1 / ATTRIBUTE@1 — "Qui a dit ça ?" / "Who Said That?". A confession +
 * attribution party game on a hidden-buffer -> atomic-reveal machinery (the
 * option-vote pattern) crossed with single-accusation designation (the tracer
 * pattern). Per the platform contract: rejecting an event returns the SAME state
 * reference; confessions AND accusations are value-secrets until the reveal; the
 * confessor COUNT becomes public only at the attribute phase (it is the clue); a
 * deadline always advances a timed phase, so a passive or disconnected room rolls
 * forward to 'over' on deadlines alone. Seeded RNG only (statement draw) — no
 * Date.now / Math.random.
 */
export function createWhoSaidThat(
  id: string,
  config: Partial<WhoSaidThatConfig> = {},
): GameModule<WhoSaidThatState, WhoSaidThatAction, WhoSaidThatView, WhoSaidThatContent> {
  const baseConfig: WhoSaidThatConfig = { ...DEFAULT_CONFIG, ...config };
  return {
    id,
    version: 1,
    // Attribution needs a crowd — accusing one of several other players is only
    // a real read with 4+ in the room.
    minPlayers: 4,
    maxPlayers: 10,

    init(seed, players, content) {
      const shuffled = shuffle(createRng(seed), content.data.statements);
      const totalRounds = Math.min(baseConfig.totalRounds, shuffled.length);
      const scores = emptyPlayerMap<number>();
      for (const p of players) scores[p] = 0;
      return {
        config: { ...baseConfig, totalRounds },
        players: [...players],
        connected: initPresence(players),
        statements: shuffled,
        round: 0,
        phase: 'confess',
        confessions: emptyPlayerMap<boolean>(),
        accusations: emptyPlayerMap<PlayerId>(),
        scores,
        lastResult: null,
      };
    },

    reduce(state, event) {
      if (state.phase === 'over') return { state, effects: [] };

      if (event.type === 'action') {
        const { playerId, action } = event;
        if (!state.players.includes(playerId)) return { state, effects: [] };

        // CONFESS — secret MOI(true)/PAS MOI(false). A re-tap overwrites the
        // prior value (still acted). Wrong phase / non-roster -> same ref.
        if (action.kind === 'confess' && state.phase === 'confess') {
          if (typeof action.value !== 'boolean') return { state, effects: [] };
          const confessions = Object.assign(emptyPlayerMap<boolean>(), state.confessions, {
            [playerId]: action.value,
          });
          const next = { ...state, confessions };
          if (allActed(connectedPlayers(next.players, next.connected), confessions)) {
            return resolveConfess(next);
          }
          return { state: next, effects: [] };
        }

        // ATTRIBUTE — a single accusation at ANOTHER player (cannot accuse self
        // or a non-roster id). A re-tap overwrites. Wrong phase -> same ref.
        if (action.kind === 'accuse' && state.phase === 'attribute') {
          if (!state.players.includes(action.target) || action.target === playerId) {
            return { state, effects: [] };
          }
          const accusations = Object.assign(emptyPlayerMap<PlayerId>(), state.accusations, {
            [playerId]: action.target,
          });
          const next = { ...state, accusations };
          if (allActed(connectedPlayers(next.players, next.connected), accusations)) {
            return resolveAttribute(next);
          }
          return { state: next, effects: [] };
        }

        return { state, effects: [] };
      }

      if (event.type === 'deadline') {
        if (state.phase === 'confess') return resolveConfess(state);
        if (state.phase === 'attribute') return resolveAttribute(state);
        if (state.phase === 'reveal') return nextRound(state);
        return { state, effects: [] };
      }

      if (event.type === 'playerLeft' || event.type === 'playerRejoined') {
        const wantConnected = event.type === 'playerRejoined';
        if (!state.players.includes(event.playerId)) return { state, effects: [] };
        if (state.connected[event.playerId] === wantConnected) return { state, effects: [] };
        const next = {
          ...state,
          connected: setConnected(state.connected, event.playerId, wantConnected),
        };
        // A leave can complete the expected set — an absent player must never
        // block an early-resolve.
        if (!wantConnected && next.phase === 'confess'
          && allActed(connectedPlayers(next.players, next.connected), next.confessions)) {
          return resolveConfess(next);
        }
        if (!wantConnected && next.phase === 'attribute'
          && allActed(connectedPlayers(next.players, next.connected), next.accusations)) {
          return resolveAttribute(next);
        }
        return { state: next, effects: [] };
      }

      return { state, effects: [] };
    },

    view(state, viewer) {
      // Pass-through AS-IS (string | LText): the client picks the locale.
      const statement = state.statements[state.round] ?? '';

      if (state.phase === 'confess') {
        // The confession buffer is a value-secret here — expose ONLY acted-or-not
        // (never the value, never even the count) plus the owner's own echo.
        const hasConfessed = emptyPlayerMap<boolean>();
        for (const p of state.players) hasConfessed[p] = state.confessions[p] !== undefined;
        const own = state.confessions[viewer];
        return {
          phase: 'confess',
          round: state.round,
          totalRounds: state.config.totalRounds,
          statement,
          hasConfessed,
          myConfession: own === undefined ? null : own,
          scores: state.scores,
        };
      }

      if (state.phase === 'attribute') {
        // THE CLUE: the confessor COUNT is public now (never WHO). Accusations
        // are still value-secrets — only acted-or-not + the owner's own echo.
        const hasAccused = emptyPlayerMap<boolean>();
        for (const p of state.players) hasAccused[p] = state.accusations[p] !== undefined;
        return {
          phase: 'attribute',
          round: state.round,
          totalRounds: state.config.totalRounds,
          statement,
          confessorCount: confessorCountOf(state),
          hasAccused,
          myAccusation: state.accusations[viewer] ?? null,
          scores: state.scores,
        };
      }

      if (state.phase === 'reveal') {
        return {
          phase: 'reveal',
          round: state.round,
          totalRounds: state.config.totalRounds,
          statement,
          result: state.lastResult ?? EMPTY_RESULT,
          scores: state.scores,
        };
      }

      return { phase: 'over', scores: state.scores, cliffhanger: deriveEpilogue(state.scores) };
    },

    phaseDurationMs(state) {
      if (state.phase === 'confess') return state.config.confessMs;
      if (state.phase === 'attribute') return state.config.attributeMs;
      if (state.phase === 'reveal') return state.config.revealMs;
      return null;
    },

    phaseKey(state) {
      return state.phase === 'over' ? 'over' : `${state.phase}:${state.round}`;
    },
  };
}

/** The default registered module instance (id 'qui-a-dit-ca', DEFAULT_CONFIG). */
export const whoSaidThat: GameModule<
  WhoSaidThatState,
  WhoSaidThatAction,
  WhoSaidThatView,
  WhoSaidThatContent
> = createWhoSaidThat('qui-a-dit-ca');
