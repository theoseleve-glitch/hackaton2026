// IMPORT FIREWALL: type-only — erased at compile time; tracer server logic never enters the bundle.
import type { TracerView } from '@bloop/game-tracer';

const isRec = (v: unknown, t: 'number' | 'boolean'): v is Record<string, never> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === t);

/** Runtime narrow of the opaque `view` payload (server view() is trusted but versions/games may drift — never crash a render). */
export function asTracerView(v: unknown): TracerView | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (o.phase === 'over') return isRec(o.scores, 'number') ? (v as TracerView) : null;
  const roundOk = typeof o.round === 'number' && typeof o.totalRounds === 'number' && typeof o.prompt === 'string' && isRec(o.scores, 'number');
  if (o.phase === 'vote') {
    return roundOk && isRec(o.hasVoted, 'boolean') && (o.myVote === null || typeof o.myVote === 'string')
      ? (v as TracerView) : null;
  }
  if (o.phase === 'reveal') return roundOk && isRec(o.tally, 'number') ? (v as TracerView) : null;
  return null;
}

/** Countdown math for the timer chrome (TimerRing later; numerals in 3a). */
export function secondsLeft(deadlineAt: number | null, now: number): number | null {
  if (deadlineAt === null) return null;
  return Math.max(0, Math.ceil((deadlineAt - now) / 1000));
}
