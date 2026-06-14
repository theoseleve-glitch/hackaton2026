import type { Effect, GameModule, PlayerId, ReduceResult } from '@bloop/engine';
import { createRng, shuffle } from '@bloop/engine';
import {
  allActed,
  connectedPlayers,
  emptyPlayerMap,
  gameOver,
  initPresence,
  setConnected,
  statLeaders,
} from '@bloop/kit';
import type {
  ClosestNumberConfig,
  ClosestRoundResult,
  CrowdRoundResult,
  CrowdTargetConfig,
  CrowdTargetItem,
  InputGuessAction,
  InputGuessConfig,
  InputGuessContent,
  InputGuessItem,
  InputGuessState,
  InputGuessView,
  LText,
  NumberQuestionItem,
} from './state.js';
import { isCrowdItem, isNumberItem } from './state.js';

const EMPTY_TEXT: LText = { fr: '', en: '' };

const EMPTY_CLOSEST: ClosestRoundResult = {
  kind: 'closest-number', itemId: '', answer: 0, guesses: {}, ranking: [],
  pointsEarned: {}, exact: [], multiplier: 1, busted: [],
  callOuts: { pile: [], closest: [], wildest: [] },
};

const EMPTY_CROWD: CrowdRoundResult = {
  kind: 'crowd-target', itemId: '', targetYesPct: 50, picks: {},
  winningCards: [], secondCards: [], bullseye: false, pointsEarned: {},
  callOuts: { loneGenius: [], mostFooled: [] },
};

function numberItem(state: InputGuessState): NumberQuestionItem | null {
  const item = state.items[state.round];
  return item !== undefined && isNumberItem(item) ? item : null;
}

function crowdItem(state: InputGuessState): CrowdTargetItem | null {
  const item = state.items[state.round];
  return item !== undefined && isCrowdItem(item) ? item : null;
}

/**
 * Promote the hidden buffer atomically (closest-number): rank answerers by
 * |guess − answer| ascending with competition ranking — ties share the rank's
 * full points and skip the next rank; exact hit adds the "Pile !" bonus; the
 * final round multiplies all points. Zero answerers award nothing.
 */
function resolveClosest(state: InputGuessState, config: ClosestNumberConfig): ReduceResult<InputGuessState> {
  const item = numberItem(state);
  const answer = item?.answer ?? 0;
  const guesses = emptyPlayerMap<number>();
  const answerers: PlayerId[] = [];
  for (const p of state.players) {
    const g = state.submissions[p];
    if (g === undefined) continue;
    guesses[p] = g;
    answerers.push(p);
  }
  const busted = item !== null && config.bustIfOver ? answerers.filter((p) => guesses[p]! > answer) : [];
  const ranked = answerers
    .filter((p) => !busted.includes(p))
    .map((p) => ({ p, d: Math.abs(guesses[p]! - answer) }))
    .sort((a, b) => a.d - b.d); // stable sort: roster order inside ties

  const multiplier = state.round === state.config.totalRounds - 1 ? config.finalRoundMultiplier : 1;
  const pointsEarned = emptyPlayerMap<number>();
  const exact: PlayerId[] = [];
  const scores = Object.assign(emptyPlayerMap<number>(), state.scores);
  let i = 0;
  while (i < ranked.length) {
    let j = i;
    while (j < ranked.length && ranked[j]!.d === ranked[i]!.d) j += 1;
    const rankPts = item === null ? 0 : config.pointsByRank[i] ?? 0;
    for (let k = i; k < j; k += 1) {
      const { p, d } = ranked[k]!;
      const isExact = item !== null && d === 0;
      if (isExact) exact.push(p);
      const pts = (rankPts + (isExact ? config.exactBonus : 0)) * multiplier;
      pointsEarned[p] = pts;
      scores[p] = (scores[p] ?? 0) + pts;
    }
    i = j;
  }
  for (const p of busted) pointsEarned[p] = 0;

  // Call-outs — derived PURELY from the now-public guesses/answer (no secret).
  // closest = the smallest-distance group; wildest = the largest. Both via the
  // kit `statLeaders` fold over non-busted answerers' distances. statLeaders
  // ignores values <= 0, so for "closest" we rank by (maxD + 1 − d): the
  // smallest distance scores highest and an exact (d=0) hit stays eligible.
  // Results inherit statLeaders' stable ascending-id order.
  const maxD = ranked.length === 0 ? 0 : Math.max(...ranked.map((r) => r.d));
  const dist = emptyPlayerMap<number>();
  const closeness = emptyPlayerMap<number>();
  for (const { p, d } of ranked) {
    dist[p] = d;
    closeness[p] = maxD + 1 - d;
  }
  const closest = ranked.length === 0 ? [] : statLeaders(closeness).players;
  const wildest = ranked.length === 0 ? [] : statLeaders(dist).players;

  const lastResult: ClosestRoundResult = {
    kind: 'closest-number', itemId: item?.id ?? '', answer, guesses,
    ranking: ranked.map((r) => r.p), pointsEarned, exact, multiplier, busted,
    callOuts: { pile: [...exact], closest, wildest },
  };
  return {
    state: { ...state, phase: 'reveal', scores, lastResult },
    effects: [{ type: 'analytics', name: 'round_revealed', props: { round: state.round } }],
  };
}

/**
 * Promote the hidden buffer atomically (crowd-target): all cards rank by
 * d = |crowdYesPct − target| (only pickers score). Min-d card pickers get
 * closestPoints (+bullseyeBonus when min-d ≤ window); second-smallest
 * DISTINCT d pickers get secondPoints. Distance ties all pay full points.
 */
function resolveCrowd(state: InputGuessState, config: CrowdTargetConfig): ReduceResult<InputGuessState> {
  const item = crowdItem(state);
  const ds = item === null ? [] : item.completions.map((c) => Math.abs(c.crowdYesPct - item.targetYesPct));
  const minD = ds.length > 0 ? Math.min(...ds) : Number.POSITIVE_INFINITY;
  const winningCards: number[] = [];
  let secondD = Number.POSITIVE_INFINITY;
  for (let idx = 0; idx < ds.length; idx += 1) {
    if (ds[idx] === minD) winningCards.push(idx);
    else if (ds[idx]! < secondD) secondD = ds[idx]!;
  }
  const secondCards = ds.flatMap((d, idx) => (d === secondD ? [idx] : []));
  const bullseye = item !== null && minD <= config.bullseyeWindowPct;

  const picks = emptyPlayerMap<number>();
  const pointsEarned = emptyPlayerMap<number>();
  const scores = Object.assign(emptyPlayerMap<number>(), state.scores);
  for (const p of state.players) {
    const idx = state.submissions[p];
    if (idx === undefined) continue;
    picks[p] = idx;
    const pts = winningCards.includes(idx)
      ? config.closestPoints + (bullseye ? config.bullseyeBonus : 0)
      : secondCards.includes(idx) ? config.secondPoints : 0;
    pointsEarned[p] = pts;
    scores[p] = (scores[p] ?? 0) + pts;
  }

  // Call-outs — derived PURELY from the now-public picks + per-card distances.
  // loneGenius: the SOLE picker of any winning (closest) card. mostFooled:
  // picker(s) of the farthest-from-target card that anyone actually picked.
  // Iterate state.players (stable roster order) and dedup; no RNG, no secret.
  const pickers = state.players.filter((p) => picks[p] !== undefined);
  const winnerPickers = pickers.filter((p) => winningCards.includes(picks[p]!));
  const loneGenius = winnerPickers.length === 1 ? [winnerPickers[0]!] : [];
  let worstPicked = -1;
  for (const p of pickers) {
    const d = ds[picks[p]!];
    if (d !== undefined && d > worstPicked) worstPicked = d;
  }
  const mostFooled = worstPicked < 0
    ? []
    : pickers.filter((p) => ds[picks[p]!] === worstPicked);

  const lastResult: CrowdRoundResult = {
    kind: 'crowd-target', itemId: item?.id ?? '', targetYesPct: item?.targetYesPct ?? 50,
    picks, winningCards, secondCards, bullseye, pointsEarned,
    callOuts: { loneGenius: [...loneGenius], mostFooled: [...mostFooled] },
  };
  return {
    state: { ...state, phase: 'reveal', scores, lastResult },
    effects: [{ type: 'analytics', name: 'round_revealed', props: { round: state.round } }],
  };
}

function resolve(state: InputGuessState): ReduceResult<InputGuessState> {
  return state.config.mode === 'closest-number'
    ? resolveClosest(state, state.config)
    : resolveCrowd(state, state.config);
}

/** reveal deadline → next round, or over (with the CLONED gameOver scores). */
function endRound(state: InputGuessState): ReduceResult<InputGuessState> {
  const effects: Effect[] = [
    { type: 'analytics', name: 'round_completed', props: { round: state.round } },
  ];
  const round = state.round + 1;
  if (round >= state.config.totalRounds) {
    const over: InputGuessState = { ...state, phase: 'over' };
    return { state: over, effects: [...effects, gameOver(over.scores)] };
  }
  return {
    state: {
      ...state, round, phase: 'guess',
      submissions: emptyPlayerMap<number>(), submitOrder: [], lastResult: null,
    },
    effects,
  };
}

/** Both numeric modes early-resolve on allActed; closest-number can opt out via config. */
function earlyAdvance(config: InputGuessConfig): boolean {
  return config.mode === 'crowd-target' || config.earlyAdvanceOnAllSubmitted;
}

/** Reducer-side validation (defense in depth behind the zod schema). Returns the canonical value or null. */
function validSubmission(state: InputGuessState, action: InputGuessAction): number | null {
  if (state.config.mode === 'closest-number') {
    if (action.kind !== 'guess') return null;
    const { value } = action;
    if (!Number.isSafeInteger(value) || value < 0) return null;
    if (value > 10 ** state.config.maxInputDigits - 1) return null;
    return value;
  }
  if (action.kind !== 'pick') return null;
  const item = crowdItem(state);
  if (item === null) return null;
  const cap = Math.min(state.config.cardsPerRound, item.completions.length);
  if (!Number.isInteger(action.cardIndex) || action.cardIndex < 0 || action.cardIndex >= cap) return null;
  return action.cardIndex;
}

/**
 * INPUT_GUESS template — two zero-text numeric modes (wave2 design §2.4/§2.5):
 * closest-number (quizz-culture-ge "Au Pif !") and crowd-target
 * (cinquante-cinquante "Fifty-Fifty"). One module, per-game configs. Platform
 * contract: rejecting an event returns the SAME state reference; submissions
 * live in a hidden buffer until the atomic reveal; a passive or disconnected
 * room rolls forward to 'over' on deadlines alone.
 */
export function createInputGuess(
  id: string,
  config: InputGuessConfig,
): GameModule<InputGuessState, InputGuessAction, InputGuessView, InputGuessContent> {
  return {
    id,
    version: 1,
    minPlayers: 2,
    maxPlayers: 16,

    init(seed, players, content) {
      const rng = createRng(seed);
      let items: InputGuessItem[];
      if (config.mode === 'closest-number') {
        items = shuffle(rng, content.data.items.filter(isNumberItem));
      } else {
        // Per-round card display order is seed-shuffled ONCE at init —
        // deterministic and identical for all viewers (design §2.5). Sliced
        // to cardsPerRound so the view and the pick-range validator agree.
        items = shuffle(rng, content.data.items.filter(isCrowdItem))
          .map((it) => ({ ...it, completions: shuffle(rng, it.completions).slice(0, config.cardsPerRound) }));
      }
      const totalRounds = Math.min(config.totalRounds, items.length);
      const scores = emptyPlayerMap<number>();
      for (const p of players) scores[p] = 0;
      return {
        config: { ...config, totalRounds },
        players: [...players],
        connected: initPresence(players),
        items,
        round: 0,
        phase: totalRounds === 0 ? 'over' : 'guess',
        submissions: emptyPlayerMap<number>(),
        submitOrder: [],
        scores,
        lastResult: null,
      };
    },

    reduce(state, event) {
      if (state.phase === 'over') return { state, effects: [] };

      if (event.type === 'action') {
        const { playerId, action } = event;
        if (state.phase !== 'guess') return { state, effects: [] };
        if (!state.players.includes(playerId)) return { state, effects: [] };
        const value = validSubmission(state, action);
        if (value === null) return { state, effects: [] };
        const submissions = Object.assign(emptyPlayerMap<number>(), state.submissions, { [playerId]: value });
        // Append-only lock order for the live ticker: record a player the FIRST
        // time they lock in (a changed guess does not re-append). Identity only.
        const submitOrder = state.submissions[playerId] === undefined
          ? [...state.submitOrder, playerId]
          : state.submitOrder;
        const next = { ...state, submissions, submitOrder };
        if (earlyAdvance(next.config) && allActed(connectedPlayers(next.players, next.connected), submissions)) {
          return resolve(next);
        }
        return { state: next, effects: [] };
      }

      if (event.type === 'deadline') {
        if (state.phase === 'guess') return resolve(state);
        if (state.phase === 'reveal') return endRound(state);
        return { state, effects: [] };
      }

      if (event.type === 'playerLeft' || event.type === 'playerRejoined') {
        const wantConnected = event.type === 'playerRejoined';
        if (!state.players.includes(event.playerId)) return { state, effects: [] };
        if (state.connected[event.playerId] === wantConnected) return { state, effects: [] };
        const next = { ...state, connected: setConnected(state.connected, event.playerId, wantConnected) };
        // A leave can complete the expected set — never let an absent player block.
        if (!wantConnected && next.phase === 'guess' && earlyAdvance(next.config)
          && allActed(connectedPlayers(next.players, next.connected), next.submissions)) {
          return resolve(next);
        }
        return { state: next, effects: [] };
      }

      return { state, effects: [] };
    },

    view(state, viewer) {
      if (state.phase === 'over') {
        return { phase: 'over', mode: state.config.mode, scores: state.scores };
      }
      const base = { round: state.round, totalRounds: state.config.totalRounds, scores: state.scores };

      if (state.phase === 'guess') {
        const hasSubmitted = emptyPlayerMap<boolean>();
        for (const p of state.players) hasSubmitted[p] = state.submissions[p] !== undefined;
        const mySubmission = state.submissions[viewer] ?? null;
        // Live ticker — identity + count only, NO value. The lock order is
        // already implied by the public `hasSubmitted` map; cloned so the view
        // never aliases hidden state.
        const submittedCount = state.submitOrder.length;
        const lockOrder = [...state.submitOrder];
        if (state.config.mode === 'closest-number') {
          const q = numberItem(state);
          // answer + funFact stay OUT of the guess view — value secrets until reveal.
          return {
            phase: 'guess', mode: 'closest-number', ...base,
            question: q?.question ?? EMPTY_TEXT,
            unit: q?.unit ?? null,
            format: q?.format ?? 'plain',
            scale: q?.scale ?? 'linear',
            maxInputDigits: state.config.maxInputDigits,
            finalRound: state.round === state.config.totalRounds - 1,
            hasSubmitted, mySubmission, submittedCount, lockOrder,
          };
        }
        const c = crowdItem(state);
        // cards carry id+text only — crowdYesPct stays hidden until reveal.
        return {
          phase: 'guess', mode: 'crowd-target', ...base,
          stem: c?.stem ?? EMPTY_TEXT,
          askKind: c?.askKind ?? 'didYou',
          targetYesPct: c?.targetYesPct ?? 50,
          cards: (c?.completions ?? []).map(({ id: cid, text }) => ({ id: cid, text })),
          hasSubmitted, mySubmission, submittedCount, lockOrder,
        };
      }

      // reveal — the hidden buffer was promoted atomically into lastResult.
      if (state.config.mode === 'closest-number') {
        const q = numberItem(state);
        const result = state.lastResult?.kind === 'closest-number' ? state.lastResult : EMPTY_CLOSEST;
        return {
          phase: 'reveal', mode: 'closest-number', ...base,
          question: q?.question ?? EMPTY_TEXT,
          unit: q?.unit ?? null,
          format: q?.format ?? 'plain',
          scale: q?.scale ?? 'linear',
          funFact: q?.funFact ?? EMPTY_TEXT,
          result,
        };
      }
      const c = crowdItem(state);
      const target = c?.targetYesPct ?? 50;
      const result = state.lastResult?.kind === 'crowd-target' ? state.lastResult : EMPTY_CROWD;
      return {
        phase: 'reveal', mode: 'crowd-target', ...base,
        stem: c?.stem ?? EMPTY_TEXT,
        askKind: c?.askKind ?? 'didYou',
        targetYesPct: target,
        cards: (c?.completions ?? []).map(({ id: cid, text, crowdYesPct }) => ({
          id: cid, text, crowdYesPct, distance: Math.abs(crowdYesPct - target),
        })),
        result,
      };
    },

    phaseDurationMs(state) {
      if (state.phase === 'guess') {
        return state.config.mode === 'closest-number' ? state.config.guessMs : state.config.pickMs;
      }
      if (state.phase === 'reveal') return state.config.revealMs;
      return null;
    },

    phaseKey(state) {
      if (state.phase === 'over') return 'over';
      if (state.phase === 'reveal') return `reveal:r${state.round}`;
      return state.config.mode === 'crowd-target' ? `pick:r${state.round}` : `guess:r${state.round}`;
    },
  };
}
