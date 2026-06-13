// IMPORT FIREWALL: type-only — erased at compile time; spotlight-guess server logic never enters the bundle.
import type { GuessEntry, LText, SpotlightGuessView } from '@bloop/game-spotlight-guess';

export const SPOTLIGHT_GUESS_GAME_IDS = ['jeu-de-la-note', 'devine-la-question'] as const;

export function isSpotlightGuessGame(gameId: string | null): boolean {
  return gameId !== null && (SPOTLIGHT_GUESS_GAME_IDS as readonly string[]).includes(gameId);
}

const isRec = (v: unknown, t: 'number' | 'boolean'): v is Record<string, never> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === t);

const isLText = (v: unknown): v is LText => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return typeof o.fr === 'string' && typeof o.en === 'string';
};

const isLTextArray = (v: unknown): v is LText[] => Array.isArray(v) && v.every(isLText);

const isNumOrNull = (v: unknown): v is number | null => v === null || typeof v === 'number';

/** Scale item card: null past the pool, else { id, prompt, low, high }. */
const isItem = (v: unknown): boolean => {
  if (v === null) return true;
  if (typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === 'string' && isLText(o.prompt) && isLText(o.low) && isLText(o.high);
};

const isGuessEntry = (v: unknown): v is GuessEntry | null => {
  if (v === null) return true;
  if (typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.value === 'number' && typeof o.tier === 'number';
};

const isPicks = (v: unknown): boolean =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
  && Object.values(v).every((e) => isGuessEntry(e) && e !== null);

const isDomain = (v: unknown): v is 'scale10' | 'wheel100' => v === 'scale10' || v === 'wheel100';

/** Runtime narrow of the opaque `view` payload — never crash a render on drift. */
export function asSpotlightGuessView(v: unknown): SpotlightGuessView | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const modeOk = o.mode === 'scale' || o.mode === 'reverse-question';
  if (!modeOk || !isRec(o.scores, 'number')) return null;
  if (o.phase === 'over') return v as SpotlightGuessView;

  const baseOk = typeof o.round === 'number' && typeof o.totalRounds === 'number'
    && typeof o.spotlightId === 'string' && isRec(o.connected, 'boolean');
  if (!baseOk) return null;

  if (o.mode === 'scale') {
    if (!isDomain(o.domain) || !isItem(o.item ?? null)) return null;
    if (o.phase === 'target' || o.phase === 'talk') {
      return typeof o.canEndTalk === 'boolean' && isNumOrNull(o.myTarget ?? null)
        ? (v as SpotlightGuessView) : null;
    }
    if (o.phase === 'guess') {
      return isRec(o.hasGuessed, 'boolean') && isNumOrNull(o.myGuess ?? null) && isNumOrNull(o.myTarget ?? null)
        ? (v as SpotlightGuessView) : null;
    }
    if (o.phase === 'reveal') {
      return isNumOrNull(o.target ?? null) && isRec(o.guesses, 'number')
        && isRec(o.gained, 'number') && typeof o.voided === 'boolean'
        ? (v as SpotlightGuessView) : null;
    }
    return null;
  }

  // reverse-question
  if (o.phase === 'answer') {
    const qOk = o.question === null || o.question === undefined || isLText(o.question);
    const aOk = o.answers === null || o.answers === undefined || isLTextArray(o.answers);
    return qOk && aOk ? (v as SpotlightGuessView) : null;
  }
  if (o.phase === 'guess') {
    return typeof o.hintTier === 'number' && typeof o.hintTiers === 'number'
      && Array.isArray(o.tierPoints) && o.tierPoints.every((p) => typeof p === 'number')
      && (o.chosenAnswer === null || isLText(o.chosenAnswer))
      && isLTextArray(o.candidates) && isLTextArray(o.hintsRevealed)
      && isRec(o.locked, 'boolean') && isGuessEntry(o.myGuess ?? null)
      && isNumOrNull(o.myRealIndex ?? null)
      ? (v as SpotlightGuessView) : null;
  }
  if (o.phase === 'reveal') {
    return (o.chosenAnswer === null || isLText(o.chosenAnswer))
      && isLTextArray(o.candidates) && isNumOrNull(o.realIndex ?? null)
      && isPicks(o.picks) && isRec(o.gained, 'number') && typeof o.voided === 'boolean'
      ? (v as SpotlightGuessView) : null;
  }
  if (o.phase === 'scoreboard') {
    return isRec(o.gained, 'number') ? (v as SpotlightGuessView) : null;
  }
  return null;
}

export { deviceLang, pickL, type Lang } from '../i18n';
