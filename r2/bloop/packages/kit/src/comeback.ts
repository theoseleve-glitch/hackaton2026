/**
 * CC-2 — Comeback Scoring Kit (cross-game synthesis §1, CC-2).
 *
 * Two pure, deterministic, DEFAULT-IDENTITY scoring modifiers a reducer applies
 * at its award site so a trailing/eliminated player is never mathematically
 * frozen out and the climax decides the crown. NO RNG, NO wall-clock — inputs
 * only. With no opts a template is byte-for-byte unchanged: `roundMultiplier`
 * returns 1 and `streakBonus` returns 0, so every existing scoring test stays
 * green at ×1 / +0 (risk register #5: default = byte-identical current
 * behaviour, re-baseline only the explicitly-changed cases).
 *
 * Placement-XP is placement-based (GDD §2.2), so internal-scale escalation here
 * is comparable across games — the multiplier reshapes WHO wins the match, not
 * the cross-game XP scale.
 */

/** Options for `roundMultiplier`. All optional; omitting all => identity (1). */
export interface RoundMultiplierOpts {
  /**
   * Multiplier applied on the final round (and the last `multiplierRounds`
   * rounds). Default 1 (no late-round weighting).
   */
  finalRoundMultiplier?: number;
  /**
   * How many trailing rounds (counting back from the final) get the
   * `finalRoundMultiplier`. Default 1 (final round only). Clamped to >= 1.
   */
  multiplierRounds?: number;
  /**
   * Alternative trigger: a fixed round index from which the multiplier applies
   * (inclusive). Takes precedence over `multiplierRounds` when set. Lets a game
   * say "double from round 3 on" regardless of total. Uses the same
   * `finalRoundMultiplier` magnitude.
   */
  doubleFromRound?: number;
}

/**
 * Late-round score multiplier. Pure & deterministic.
 *
 * `round` is the 0-based current round; `totalRounds` is the match length.
 * Returns 1 (identity) unless an opt triggers a late-round multiplier, in which
 * case it returns `finalRoundMultiplier`. Sane clamps:
 *   - a non-finite / missing / <= 0 `finalRoundMultiplier` is ignored (=> 1),
 *     so a misconfigured pack can never zero-out or invert scoring.
 *   - `multiplierRounds` is clamped to >= 1 and to `totalRounds`.
 *   - out-of-band `round` (negative, or >= totalRounds) is clamped into range
 *     so the final round always triggers and pre-game rounds never do.
 *
 * Trigger precedence: `doubleFromRound` (absolute) over `multiplierRounds`
 * (relative-to-end). With neither a usable magnitude nor a trigger => 1.
 */
export function roundMultiplier(
  round: number,
  totalRounds: number,
  opts?: RoundMultiplierOpts,
): number {
  const mult = opts?.finalRoundMultiplier;
  // No usable multiplier configured => identity. Reject non-finite / <= 0
  // (a 0 or negative would zero-out/invert the award path).
  if (mult === undefined || !Number.isFinite(mult) || mult <= 0) return 1;

  const total = Number.isFinite(totalRounds) && totalRounds > 0 ? Math.floor(totalRounds) : 1;
  // Clamp the current round into [0, total-1]: the climax always counts, a
  // negative/pre-game round never triggers.
  const r = Math.min(Math.max(Math.floor(round) || 0, 0), total - 1);

  // Absolute trigger wins when present.
  if (opts?.doubleFromRound !== undefined && Number.isFinite(opts.doubleFromRound)) {
    return r >= Math.floor(opts.doubleFromRound) ? mult : 1;
  }

  // Relative-to-end: the last `multiplierRounds` rounds (default 1 = final only).
  const span = Math.min(Math.max(Math.floor(opts?.multiplierRounds ?? 1), 1), total);
  const firstBoostedRound = total - span;
  return r >= firstBoostedRound ? mult : 1;
}

/**
 * Per-player consecutive-success counter. Pure: `success` increments the prior
 * streak, a failure resets to 0. Negative/garbage `prev` floors to 0 so the
 * counter can never go backwards below zero.
 *
 * The retention work is done by the CLIENT-surfaced streak TAG ("on fire"),
 * not by the bonus — keep the bonus flavour-small (see `streakBonus`).
 */
export function nextStreak(prev: number, success: boolean): number {
  if (!success) return 0;
  const base = Number.isFinite(prev) && prev > 0 ? Math.floor(prev) : 0;
  return base + 1;
}

/** Options for `streakBonus`. Omitting all => 0 (identity / no bonus). */
export interface StreakBonusOpts {
  /** Flavour points awarded per consecutive success. Default 0. */
  perStreak?: number;
  /**
   * Cap on the streak length that earns the bonus (so a runaway streak does
   * not snowball the lead the comeback kit is meant to compress). Default:
   * uncapped. Clamped to >= 0.
   */
  cap?: number;
}

/**
 * Small, capped streak bonus. Default 0 (no opts => identity, existing scoring
 * unchanged). `streak` is the value from `nextStreak`. Returns
 * `perStreak * min(streak, cap)`, clamped so a negative/garbage input yields 0.
 * Bonus stays flavour-small by design — the tag, not the points, retains.
 */
export function streakBonus(streak: number, opts?: StreakBonusOpts): number {
  const per = opts?.perStreak;
  if (per === undefined || !Number.isFinite(per) || per === 0) return 0;
  const s = Number.isFinite(streak) && streak > 0 ? Math.floor(streak) : 0;
  if (s === 0) return 0;
  const capped =
    opts?.cap !== undefined && Number.isFinite(opts.cap)
      ? Math.min(s, Math.max(Math.floor(opts.cap), 0))
      : s;
  return per * capped;
}
