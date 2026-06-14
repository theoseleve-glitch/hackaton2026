import type { PlayerId } from '@bloop/engine';
import { connectedPlayers, emptyPlayerMap } from '@bloop/kit';
import { crew, currentItem, eligibleJudges, reactionCounts, reactors, tapCount, tapGoal } from './helpers.js';
import type {
  ConstraintCard,
  PerformJudgeState,
  PerformJudgeView,
  SecretCard,
  TurnResult,
} from './state.js';

type S = PerformJudgeState;

export const EMPTY_RESULT: TurnResult = {
  performer: '', partner: null, item: null, outcome: 'void',
  tally: null, stars: null, fast: false, points: {},
  reactions: { fire: 0, laugh: 0, cringe: 0 },
};

/**
 * Per-viewer projection — the redaction matrix (synthesis §3.2):
 * - promptVisibility 'others' (guided/puppet): the secret reaches roster
 *   non-performers only; the performer AND unknown viewers (treated as the
 *   performer's possible second device) never see it pre-reveal.
 * - promptVisibility 'performer' (credit/rate): the secret is the performer's
 *   own echo; everyone else (incl. unknown ids) is blind until reveal —
 *   except credit's validate beat, where the object is public BY DESIGN.
 * - judgment buffers surface as COUNTS plus an owner-only echo; individual
 *   ballots are never published, even at reveal (aggregate tally only).
 */
export function projectView(state: S, viewer: PlayerId): PerformJudgeView {
  if (state.phase === 'over') {
    return { phase: 'over', mode: state.config.mode, scores: state.scores };
  }
  const config = state.config;
  const isRoster = state.players.includes(viewer);
  const isPerformer = isRoster && viewer === state.performer;
  const entitled = config.promptVisibility === 'others' ? isRoster && !isPerformer : isPerformer;
  const item = currentItem(state);
  const secretCard: SecretCard | null = item === null ? null : {
    prompt: item.prompt,
    hint: item.hint ?? null,
    category: item.category ?? null,
    forbidden: item.forbidden ?? null,
  };
  const constraint: ConstraintCard | null =
    item !== null && item.constraintLabel !== undefined && item.constraintRule !== undefined
      ? { label: item.constraintLabel, rule: item.constraintRule }
      : null;
  const categoryHint =
    config.mode === 'credit' || (config.mode === 'puppet' && config.showCategoryToPerformer)
      ? item?.category ?? null
      : null;
  const base = {
    mode: config.mode,
    turnSeq: state.turnSeq,
    lap: state.lap,
    laps: config.laps,
    performer: state.performer,
    partner: state.partner,
    rotation: state.rotation,
    connected: state.connected,
    scores: state.scores,
    passesLeft: state.passesLeft,
  };

  if (state.phase === 'ready') {
    return {
      ...base,
      phase: 'ready',
      constraint,
      secret: config.mode === 'guided' && entitled ? secretCard : null,
      offers: config.mode === 'rate' && isPerformer
        ? state.offer.map((it, index) => ({ index, prompt: it.prompt, hint: it.hint ?? null }))
        : null,
      canReady: config.mode === 'guided' && isPerformer,
    };
  }

  if (state.phase === 'perform') {
    return {
      ...base,
      phase: 'perform',
      constraint,
      secret: entitled ? secretCard : null,
      categoryHint,
      tapCount: config.mode === 'puppet' ? tapCount(state) : 0,
      tapGoal: config.mode === 'puppet' ? tapGoal(state) : 0,
      myTapped: config.mode === 'puppet' && state.taps[viewer] === true,
      crewDone: config.mode === 'rate'
        ? (() => {
          const m = emptyPlayerMap<boolean>();
          for (const p of crew(state)) m[p] = state.taps[p] === true;
          return m;
        })()
        : null,
      myDone: config.mode === 'rate' && state.taps[viewer] === true,
      // CC-4 — PUBLIC aggregate counts to everyone; the viewer's own reaction is
      // an owner-only echo (own-property check, never a prototype-walk that could
      // surface a foreign player's reaction for an id like "__proto__").
      reactionCounts: reactionCounts(state),
      myReaction: Object.prototype.hasOwnProperty.call(state.reactions, viewer)
        ? state.reactions[viewer]!
        : null,
      canReact: reactors(state).includes(viewer)
        && !Object.prototype.hasOwnProperty.call(state.reactions, viewer),
      canClaimDone: config.mode === 'guided' && isPerformer,
      canGiveUp: config.mode === 'guided' && isPerformer,
      canPass: (config.mode === 'guided' || config.mode === 'credit')
        && isPerformer && (state.passesLeft[viewer] ?? 0) > 0,
      claimTargets: config.mode === 'credit' && isPerformer
        ? connectedPlayers(state.players, state.connected).filter((p) => p !== state.performer)
        : null,
    };
  }

  if (state.phase === 'judge') {
    const isStars = config.adjudication === 'stars';
    const buffer = isStars ? state.stars : state.votes;
    const eligible = eligibleJudges(state);
    return {
      ...base,
      phase: 'judge',
      judgeKind: config.adjudication,
      constraint,
      secret: config.promptVisibility === 'others' && entitled ? secretCard : null,
      publicItem: config.adjudication === 'claim-validate' && item !== null
        ? { prompt: item.prompt, category: item.category ?? null }
        : null,
      claimedGuesser: state.claim?.guesser ?? null,
      categoryHint,
      votesIn: Object.keys(buffer).length,
      votersExpected: eligible.length,
      youCanVote: eligible.includes(viewer) && buffer[viewer] === undefined,
      myVote: isStars ? null : state.votes[viewer] ?? null,
      myStars: isStars ? state.stars[viewer] ?? null : null,
    };
  }

  if (state.phase === 'reveal') {
    return { ...base, phase: 'reveal', result: state.lastResult ?? EMPTY_RESULT };
  }
  return { ...base, phase: 'scoreboard' };
}
