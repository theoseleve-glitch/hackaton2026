// IMPORT FIREWALL: type-only — erased at compile time; input-guess server logic never enters the bundle.
import type {
  ClosestRoundResult,
  CrowdRoundResult,
  InputGuessView,
  LText,
} from '@bloop/game-input-guess';

export const INPUT_GUESS_GAME_IDS = ['quizz-culture-ge', 'cinquante-cinquante'] as const;

export function isInputGuessGame(gameId: string | null): boolean {
  return gameId !== null && (INPUT_GUESS_GAME_IDS as readonly string[]).includes(gameId);
}

const isRec = (v: unknown, t: 'number' | 'boolean'): v is Record<string, never> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === t);

const isLText = (v: unknown): v is LText => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.fr === 'string' && typeof o.en === 'string';
};

const isCards = (v: unknown, revealed: boolean): boolean =>
  Array.isArray(v) && v.every((c) => {
    if (typeof c !== 'object' || c === null) return false;
    const o = c as Record<string, unknown>;
    if (typeof o.id !== 'string' || !isLText(o.text)) return false;
    return !revealed || (typeof o.crowdYesPct === 'number' && typeof o.distance === 'number');
  });

const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

// Reveal call-outs (closest-number): pile/closest/wildest are all id lists.
const isClosestCallOuts = (v: unknown): boolean => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return isStrArr(o.pile) && isStrArr(o.closest) && isStrArr(o.wildest);
};

// Reveal call-outs (crowd-target): loneGenius/mostFooled are id lists.
const isCrowdCallOuts = (v: unknown): boolean => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return isStrArr(o.loneGenius) && isStrArr(o.mostFooled);
};

const isClosestResult = (v: unknown): v is ClosestRoundResult => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return o.kind === 'closest-number' && typeof o.answer === 'number'
    && isRec(o.guesses, 'number') && Array.isArray(o.ranking)
    && isRec(o.pointsEarned, 'number') && Array.isArray(o.exact)
    && typeof o.multiplier === 'number' && Array.isArray(o.busted)
    && isClosestCallOuts(o.callOuts);
};

const isCrowdResult = (v: unknown): v is CrowdRoundResult => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return o.kind === 'crowd-target' && typeof o.targetYesPct === 'number'
    && isRec(o.picks, 'number') && Array.isArray(o.winningCards)
    && Array.isArray(o.secondCards) && typeof o.bullseye === 'boolean'
    && isRec(o.pointsEarned, 'number') && isCrowdCallOuts(o.callOuts);
};

/** Runtime narrow of the opaque `view` payload — never crash a render on drift. */
export function asInputGuessView(v: unknown): InputGuessView | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const modeOk = o.mode === 'closest-number' || o.mode === 'crowd-target';
  if (!modeOk || !isRec(o.scores, 'number')) return null;
  if (o.phase === 'over') return v as InputGuessView;
  const roundOk = typeof o.round === 'number' && typeof o.totalRounds === 'number';
  if (!roundOk) return null;
  if (o.phase === 'guess') {
    if (!isRec(o.hasSubmitted, 'boolean')) return null;
    if (!(o.mySubmission === null || typeof o.mySubmission === 'number')) return null;
    // Live submission ticker (identity + count only, NO values).
    if (typeof o.submittedCount !== 'number' || !isStrArr(o.lockOrder)) return null;
    if (o.mode === 'closest-number') {
      return isLText(o.question) && typeof o.maxInputDigits === 'number' && typeof o.finalRound === 'boolean'
        ? (v as InputGuessView) : null;
    }
    return isLText(o.stem) && typeof o.targetYesPct === 'number' && isCards(o.cards, false)
      ? (v as InputGuessView) : null;
  }
  if (o.phase === 'reveal') {
    if (o.mode === 'closest-number') {
      return isLText(o.question) && isLText(o.funFact) && isClosestResult(o.result)
        ? (v as InputGuessView) : null;
    }
    return isLText(o.stem) && typeof o.targetYesPct === 'number'
      && isCards(o.cards, true) && isCrowdResult(o.result)
      ? (v as InputGuessView) : null;
  }
  return null;
}

export { deviceLang, pickL, type Lang } from '../i18n';
