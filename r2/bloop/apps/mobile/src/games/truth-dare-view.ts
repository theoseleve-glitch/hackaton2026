// IMPORT FIREWALL: type-only — erased at compile time; truth-dare server logic never enters the bundle.
import type { LText, TdLabels, TdResult, TruthDareView } from '@bloop/game-truth-dare';

export const TRUTH_DARE_GAME_IDS = ['truth-or-dare-2', 'truth-or-drink'] as const;

export function isTruthDareGame(gameId: string | null): boolean {
  return gameId !== null && (TRUTH_DARE_GAME_IDS as readonly string[]).includes(gameId);
}

const isRec = (v: unknown, t: 'number' | 'boolean'): v is Record<string, never> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === t);

const isLText = (v: unknown): v is LText => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return typeof o.fr === 'string' && typeof o.en === 'string';
};

const isLabels = (v: unknown): v is TdLabels => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return isLText(o.escape) && isLText(o.claimDone) && isLText(o.verdictDone)
    && isLText(o.verdictChickened) && isLText(o.forfeitStamp);
};

const isIdList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isChoice = (v: unknown): v is 'truth' | 'dare' => v === 'truth' || v === 'dare';
const isTier = (v: unknown): boolean => v === 'soft' || v === 'party' || v === 'spicy';
const isVerdict = (v: unknown): v is 'done' | 'chickened' => v === 'done' || v === 'chickened';
const isTurnVerdict = (v: unknown): boolean => isVerdict(v) || v === 'passed';

/** Scaffolding present in every non-over view (rotation rail + HUD). */
const isCommon = (o: Record<string, unknown>): boolean =>
  typeof o.round === 'number' && typeof o.totalRounds === 'number' && typeof o.turnSeq === 'number'
  && isIdList(o.rotation) && typeof o.activePlayer === 'string'
  && isRec(o.connected, 'boolean') && isRec(o.scores, 'number') && isRec(o.passesLeft, 'number')
  && (o.escapeMode === 'pass' || o.escapeMode === 'forfeit-draw') && isLabels(o.labels);

const isPromptCard = (o: Record<string, unknown>): boolean =>
  typeof o.youAreActive === 'boolean' && isChoice(o.choice) && isTier(o.intensity) && isLText(o.promptText);

const isResult = (v: unknown): v is TdResult => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  const tally = o.tally as Record<string, unknown> | null;
  return typeof o.activePlayer === 'string' && isChoice(o.choice) && isTier(o.intensity)
    && isLText(o.promptText) && isTurnVerdict(o.verdict)
    && typeof tally === 'object' && tally !== null
    && typeof tally.done === 'number' && typeof tally.chickened === 'number'
    && typeof o.pointsAwarded === 'number'
    && (o.forfeitText === null || isLText(o.forfeitText));
};

/** Runtime narrow of the opaque `view` payload — never crash a render on drift. */
export function asTruthDareView(v: unknown): TruthDareView | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (o.phase === 'over') {
    return isRec(o.scores, 'number') && isIdList(o.rotation) && isLabels(o.labels)
      ? (v as TruthDareView) : null;
  }
  if (!isCommon(o)) return null;
  if (o.phase === 'choose') {
    return typeof o.youAreActive === 'boolean'
      && Array.isArray(o.choices) && o.choices.length > 0 && o.choices.every(isChoice)
      ? (v as TruthDareView) : null;
  }
  if (o.phase === 'prompt') {
    return isPromptCard(o) && typeof o.canPass === 'boolean' ? (v as TruthDareView) : null;
  }
  if (o.phase === 'verdict') {
    return isPromptCard(o) && isTurnVerdict(o.outcome)
      && typeof o.youCanVote === 'boolean' && (o.youVoted === null || isVerdict(o.youVoted))
      && typeof o.votesIn === 'number' && typeof o.votersExpected === 'number'
      ? (v as TruthDareView) : null;
  }
  if (o.phase === 'score') {
    return isResult(o.lastResult) && (o.nextActive === null || typeof o.nextActive === 'string')
      ? (v as TruthDareView) : null;
  }
  return null;
}

export { deviceLang, pickL, type Lang } from '../i18n';
