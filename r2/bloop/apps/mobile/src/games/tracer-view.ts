// IMPORT FIREWALL: type-only — erased at compile time; tracer server logic never enters the bundle.
import type { LText, TracerEpilogue, TracerView } from '@bloop/game-tracer';
import { deviceLang, pickL, type Lang } from '../i18n';

/**
 * Wave-2 over-view epilogue, re-exported as a TYPE through the firewall so the
 * mobile `over` render path can shape it onto the juice-kit EpilogueCard without
 * a runtime dependency on the game package. Shape (CC-5, all derived from PUBLIC
 * end-of-match state): `closeFinish` (nailbiter flag), `topGap` (top-2 gap),
 * `mvp` (sole crowned player or null on a tie), `longestHotSeat` ({ value, players }).
 */
export type { TracerEpilogue };

/** Wave-2 bilingual packs (pires-potes) carry {fr,en} cards; legacy packs carry plain strings. */
export type TracerPrompt = string | LText;

/** Render-safe prompt text: plain strings pass through, bilingual cards pick the locale. */
export function promptText(prompt: TracerPrompt, lang: Lang): string {
  return typeof prompt === 'string' ? prompt : pickL(prompt, lang);
}

/**
 * Client-facing tracer view: identical to the module's TracerView except the
 * prompt is already locale-resolved to a plain string by asTracerView, so
 * every render path (incl. the pre-patch TracerPlay) can show it directly.
 */
type LocalizePrompt<V> = V extends { prompt: TracerPrompt } ? Omit<V, 'prompt'> & { prompt: string } : V;
export type TracerClientView = LocalizePrompt<TracerView>;

/**
 * The two-beat reveal slice of the client view (CC-3 + Wave-2). Exposes the
 * server-driven fields TracerPlay reads: `revealStep` ('suspense' = held breath,
 * scores frozen | 'verdict' = the slam), `designated` (WHO the room pointed at),
 * `delta` (the per-player +points that land on the verdict beat), and the Wave-2
 * retention fields — `roundMultiplier` (CC-2: ×N in effect, 1 unless a weighted
 * climax round → drives the "ROUND DOUBLE" badge) and `hotSeat` (CC-5: per-player
 * CURRENT designation streak, populated only at verdict → drives the on-a-roll
 * tease). These ride the module's TracerView through the firewall as TYPE only —
 * never imported as runtime values. Optional/defaulted at render so a legacy /
 * zero-beat reveal view (no revealStep) still narrows and renders without crashing.
 */
export type TracerRevealView = Extract<TracerClientView, { phase: 'reveal' }>;
/** 'suspense' = the held breath (scores frozen) | 'verdict' = the slam. */
export type RevealStep = TracerRevealView['revealStep'];

/**
 * The over slice of the client view (Wave-2 / CC-5). Carries final `scores` plus
 * the `cliffhanger` epilogue ({@link TracerEpilogue}) the `over` screen shapes onto
 * the juice-kit EpilogueCard. Type-only through the firewall — the cliffhanger is
 * derived server-side from PUBLIC end-of-match state, so the client only renders it.
 */
export type TracerOverView = Extract<TracerClientView, { phase: 'over' }>;

const isRec = (v: unknown, t: 'number' | 'boolean'): v is Record<string, never> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === t);

const isLText = (v: unknown): v is LText => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return typeof o.fr === 'string' && typeof o.en === 'string';
};

const isPrompt = (v: unknown): v is TracerPrompt => typeof v === 'string' || isLText(v);

/**
 * Runtime narrow of the opaque `view` payload (server view() is trusted but
 * versions/games may drift — never crash a render). Accepts string | LText
 * prompts; an LText prompt is resolved through promptText so callers always
 * receive `prompt: string`.
 */
export function asTracerView(v: unknown, lang: Lang = deviceLang()): TracerClientView | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (o.phase === 'over') return isRec(o.scores, 'number') ? (v as TracerClientView) : null;
  const roundOk = typeof o.round === 'number' && typeof o.totalRounds === 'number' && isPrompt(o.prompt) && isRec(o.scores, 'number');
  if (!roundOk) return null;
  const localized = typeof o.prompt === 'string' ? v : { ...o, prompt: promptText(o.prompt as TracerPrompt, lang) };
  if (o.phase === 'vote') {
    return isRec(o.hasVoted, 'boolean') && (o.myVote === null || typeof o.myVote === 'string')
      ? (localized as TracerClientView) : null;
  }
  if (o.phase === 'reveal') return isRec(o.tally, 'number') ? (localized as TracerClientView) : null;
  return null;
}

/** Countdown math for the timer chrome (TimerRing later; numerals in 3a). */
export function secondsLeft(deadlineAt: number | null, now: number): number | null {
  if (deadlineAt === null) return null;
  return Math.max(0, Math.ceil((deadlineAt - now) / 1000));
}

export { deviceLang, pickL, type Lang } from '../i18n';
