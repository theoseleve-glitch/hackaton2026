// IMPORT FIREWALL: type-only — erased at compile time; rule-hunt server logic never enters the bundle.
import type {
  FlagBet,
  LText,
  NoteBet,
  RoundOutcome,
  RuleHuntView,
  SeatView,
  TribunalResult,
} from '@bloop/game-rule-hunt';

// Re-export the heat-check bet TYPES (type-only) so the Play component can read the
// spotlight view's myFlag/myNote echoes — and shape its flagBreak/noteSuspicious
// actions — without reaching past the firewall into the game's runtime module.
export type { FlagBet, NoteBet };

export const RULE_HUNT_GAME_IDS = ['trouvez-la-regle'] as const;

export function isRuleHuntGame(gameId: string | null): boolean {
  return gameId !== null && (RULE_HUNT_GAME_IDS as readonly string[]).includes(gameId);
}

const isRec = (v: unknown, t: 'number' | 'boolean'): v is Record<string, never> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === t);

const isLText = (v: unknown): v is LText => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.fr === 'string' && typeof o.en === 'string';
};

const isSeat = (v: unknown): v is SeatView => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.connected === 'boolean'
    && typeof o.eliminated === 'boolean' && typeof o.isDetective === 'boolean';
};

const isTribunalResult = (v: unknown): v is TribunalResult | null => {
  if (v === null || v === undefined) return v === null; // must be an explicit null
  if (typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  const tally = o.tally as Record<string, unknown> | null;
  return typeof o.accused === 'string' && typeof o.accuser === 'string' && typeof o.guilty === 'boolean'
    && typeof tally === 'object' && tally !== null
    && typeof tally.guilty === 'number' && typeof tally.notGuilty === 'number'
    && Array.isArray(o.abstained);
};

const isOutcome = (v: unknown): v is RoundOutcome => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (o.kind === 'guessed' || o.kind === 'timeUp')
    && typeof o.perfect === 'boolean' && typeof o.trueIndex === 'number' && isLText(o.ruleText);
};

const isCandidates = (v: unknown): v is LText[] => Array.isArray(v) && v.every(isLText);

function baseOk(o: Record<string, unknown>): boolean {
  return typeof o.round === 'number' && typeof o.totalRounds === 'number'
    && Array.isArray(o.seats) && o.seats.every(isSeat)
    && isRec(o.scores, 'number')
    && (o.myRole === 'detective' || o.myRole === 'follower' || o.myRole === null)
    && typeof o.iAmEliminated === 'boolean'
    && (o.myRule === null || isLText(o.myRule))
    && typeof o.myAccusationsLeft === 'number' && typeof o.teamGuessesLeft === 'number'
    && Array.isArray(o.usedCandidates) && o.usedCandidates.every((x) => typeof x === 'number')
    && isTribunalResult(o.lastTribunal ?? null);
}

/** Runtime narrow of the opaque `view` payload — never crash a render on drift. */
export function asRuleHuntView(v: unknown): RuleHuntView | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (!baseOk(o)) return null;
  if (o.phase === 'briefing') return isRec(o.acked, 'boolean') ? (v as RuleHuntView) : null;
  if (o.phase === 'live') return v as RuleHuntView;
  if (o.phase === 'spotlight') {
    // Heat-check micro-beat: a public target + aggregate counts, owner-only reads.
    return typeof o.target === 'string' && typeof o.iAmSpotlit === 'boolean'
      && typeof o.flagCount === 'number' && typeof o.noteCount === 'number'
      && (o.myFlag === null || o.myFlag === 'flag' || o.myFlag === 'clean')
      && (o.myNote === null || o.myNote === 'suspicious' || o.myNote === 'clear')
      ? (v as RuleHuntView) : null;
  }
  if (o.phase === 'tribunal') {
    return typeof o.accused === 'string' && typeof o.accuser === 'string'
      && Array.isArray(o.voters) && o.voters.every((x) => typeof x === 'string')
      && isRec(o.hasVoted, 'boolean')
      && (o.myVote === null || typeof o.myVote === 'boolean')
      ? (v as RuleHuntView) : null;
  }
  if (o.phase === 'guess') {
    return typeof o.guesser === 'string' && typeof o.iAmGuessing === 'boolean'
      && (o.candidates === null || isCandidates(o.candidates))
      ? (v as RuleHuntView) : null;
  }
  if (o.phase === 'reveal') {
    return isOutcome(o.outcome) && isCandidates(o.candidates) ? (v as RuleHuntView) : null;
  }
  if (o.phase === 'over') {
    return o.endReason === 'finished' || o.endReason === 'roomCollapsed' ? (v as RuleHuntView) : null;
  }
  return null;
}

export { deviceLang, pickL, type Lang } from '../i18n';
