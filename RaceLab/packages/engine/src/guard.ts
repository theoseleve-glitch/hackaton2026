import type {
  ChassisTemplate,
  ContextBundle,
  KBRule,
  RecommendationOption,
  Taxonomy,
} from "./types.js";

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
