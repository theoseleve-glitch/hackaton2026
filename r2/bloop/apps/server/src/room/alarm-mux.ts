export type TimerKind = 'phase' | 'grace' | 'ttl';
export interface Timer { kind: TimerKind; key: string; fireAt: number }

/**
 * Persisted truth the queue derives from — deliberately NO timers table
 * (deviation from design §6.1): phase <- meta.phaseKey+deadlineAt, grace <-
 * roster.grace_until, ttl <- meta.lastActivityAt+horizon. Single source of
 * truth; an alarm retry re-derives a self-consistent queue (review C2).
 */
export interface RoomTimerSource {
  phase: { key: string; fireAt: number } | null;
  graces: ReadonlyArray<{ playerId: string; fireAt: number }>;
  /** Always present: a live room always has a TTL horizon. */
  ttlFireAt: number;
}

const KIND_RANK: Record<TimerKind, number> = { phase: 0, grace: 1, ttl: 2 };
const byDeadline = (a: Timer, b: Timer): number => a.fireAt - b.fireAt || KIND_RANK[a.kind] - KIND_RANK[b.kind];

/** Pure EDF multiplexer over the DO's single alarm (§6). No Cloudflare, no clock. */
export class AlarmQueue {
  private constructor(private readonly timers: ReadonlyArray<Timer>) {}

  static fromRoom(src: RoomTimerSource): AlarmQueue {
    const timers: Timer[] = [];
    if (src.phase !== null) timers.push({ kind: 'phase', key: src.phase.key, fireAt: src.phase.fireAt });
    for (const g of src.graces) timers.push({ kind: 'grace', key: g.playerId, fireAt: g.fireAt });
    timers.push({ kind: 'ttl', key: 'ttl', fireAt: src.ttlFireAt });
    return new AlarmQueue(timers);
  }

  /** The single alarm target — non-null by construction (ttl always exists). */
  earliest(): Timer {
    return [...this.timers].sort(byDeadline)[0]!;
  }

  /** All timers due at `now`, earliest first; ties fire phase < grace < ttl. */
  due(now: number): Timer[] {
    return this.timers.filter((t) => t.fireAt <= now).sort(byDeadline);
  }
}

/** §0.1/§4.2: a NEW absolute deadline starts iff phaseKey changed; in-phase progress keeps the running one. */
export function nextPhaseDeadline(
  keyBefore: string, keyAfter: string, durationMs: number | null, at: number, current: number | null,
): number | null {
  if (keyAfter === keyBefore) return current;
  return durationMs === null ? null : at + durationMs;
}
