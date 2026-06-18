import type {
  ChassisTemplate,
  ContextBundle,
  KBRule,
  RecommendationOption,
  Taxonomy,
} from "./types";

/**
 * M5 — boundary sanitizer (fail-closed). Non-finite numerics (NaN, ±Infinity)
 * must never reach a user-facing string. We omit them at the boundary so the
 * downstream "(currently X)", conditions echo and diagnosis simply drop the
 * field rather than rendering "NaN°C". Returns a NEW bundle (never mutates the
 * input — D18 purity preserved).
 */
export function sanitizeBundle(bundle: ContextBundle): ContextBundle {
  const setup: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(bundle.setup)) {
    if (typeof v === "number" && !Number.isFinite(v)) continue; // drop NaN/Infinity
    setup[k] = v;
  }

  let weather = bundle.weather;
  if (weather) {
    const cleaned: NonNullable<ContextBundle["weather"]> = {};
    let kept = false;
    for (const [k, v] of Object.entries(weather) as [
      keyof NonNullable<ContextBundle["weather"]>,
      number | undefined,
    ][]) {
      if (typeof v === "number" && !Number.isFinite(v)) continue; // drop non-finite
      if (v !== undefined) {
        cleaned[k] = v;
        kept = true;
      }
    }
    weather = kept ? cleaned : undefined;
  }

  return { ...bundle, setup, ...(weather ? { weather } : { weather: undefined }) };
}

/** True iff every numeric is finite — used by assertFiniteNumbers in tests/guards. */
export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** D13: engine/needle questions get a hard canned refusal — checked BEFORE anything else. */
export function engineScopeViolation(bundle: ContextBundle, taxonomy: Taxonomy): string | null {
  const text = [bundle.question ?? "", bundle.feedback.text ?? ""].join(" ").toLowerCase();
  if (!text.trim()) return null;
  for (const kw of taxonomy.engine_scope_refusal.keywords) {
    if (text.includes(kw.toLowerCase())) return taxonomy.engine_scope_refusal.refusal;
  }
  return null;
}

/** The LLM cannot cite a rule that wasn't retrieved (docs/04 §4). */
export function invalidCitations(option: RecommendationOption, retrievedIds: Set<string>): string[] {
  return option.citations.filter((c) => !retrievedIds.has(c));
}

/**
 * The chassis template IS the bounds database (D13): the recommended setting
 * must exist on this chassis. Alias/derived fields resolve to their members.
 */
export function settingUnknownToTemplate(setting: string, template: ChassisTemplate): boolean {
  if (template.fields[setting]) return false;
  // settings expressed at class level that map onto template fields
  const classLevel = new Set([
    "ride_height",
    "ride_height_rake",
    "shock_pistons",
    "shock_mounting_inclination",
    "gearing",
  ]);
  return !classLevel.has(setting);
}

/**
 * RUNTIME OUTPUT GUARDS (audit §5) — fail-closed. Each returns true when the
 * option is SAFE to emit; a false answer means "drop this option / degrade to
 * refusal", never throw to the user. They are the standing safety net that
 * keeps grounded-or-silent intact even if a template/KB desync ever recurs.
 */

/** Guard 1 — assertGroundedOrRefuse: ≥1 citation AND every citation resolves to
 *  a rule that was actually retrieved for this request. */
export function optionIsGrounded(
  option: RecommendationOption,
  retrievedIds: Set<string>,
): boolean {
  if (option.citations.length === 0) return false;
  return invalidCitations(option, retrievedIds).length === 0;
}

/** Guard 2 — assertSettingOnTemplate (this is M6b): the option's setting must
 *  exist on the active chassis template (the bounds DB). */
export function optionSettingOnTemplate(
  option: RecommendationOption,
  template: ChassisTemplate,
): boolean {
  return !settingUnknownToTemplate(option.setting, template);
}

/** Guard 3 — assertFiniteNumbers: no non-finite numeric may have leaked into a
 *  user-facing string of the option. The boundary sanitizer (sanitizeBundle)
 *  removes the source; this is the belt-and-braces check at emit time. */
const NON_FINITE_TOKENS = ["NaN", "Infinity", "-Infinity"];
export function optionHasFiniteNumbers(option: RecommendationOption): boolean {
  const fields = [
    option.change,
    option.mechanism,
    option.expected_effect,
    option.revert,
    option.if_it_does_not_help,
    option.history_note ?? "",
  ];
  for (const f of fields) {
    for (const tok of NON_FINITE_TOKENS) if (f.includes(tok)) return false;
  }
  return true;
}

/**
 * Single gate every emitted option passes through. Returns true only when the
 * option is grounded, on-template, and finite. On false the caller DROPS the
 * option (grounded-or-silent), so unsafe/ungrounded advice can never reach a
 * user even if upstream desyncs.
 */
export function optionIsEmittable(
  option: RecommendationOption,
  template: ChassisTemplate,
  retrievedIds: Set<string>,
): boolean {
  return (
    optionIsGrounded(option, retrievedIds) &&
    optionSettingOnTemplate(option, template) &&
    optionHasFiniteNumbers(option)
  );
}

export interface RaceDayVerdict {
  allowed: boolean;
  reason?: string;
}

/** Race-day mode only allows high-confidence, fast-reversible changes (docs/04 §7). */
export function raceDayFilter(rule: Pick<KBRule, "confidence" | "reversal_cost_minutes">): RaceDayVerdict {
  if (rule.confidence !== "high") {
    return { allowed: false, reason: "confidence below race-day bar" };
  }
  if (rule.reversal_cost_minutes > 15) {
    return { allowed: false, reason: `reversal cost ${rule.reversal_cost_minutes}min too slow for race day` };
  }
  return { allowed: true };
}

export const DO_NOTHING_MESSAGE =
  "Stick with what you have. No change clears the race-day bar (high confidence + fast to revert) for this symptom — protect the result and revisit it at the next practice.";

export const OUT_OF_KB_MESSAGE =
  "I don't have a verified rule for that yet, so I won't guess.";
