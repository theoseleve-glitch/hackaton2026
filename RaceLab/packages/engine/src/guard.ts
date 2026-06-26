import type { ContextBundle, KBRule, Taxonomy } from "./types";

/** D13: engine/needle questions get a hard canned refusal — checked BEFORE anything else.
 *  Match keywords on WORD BOUNDARIES, not raw substrings: a substring `text.includes("lean")`
 *  false-refused everyday chassis words ("clean", "leans", "cleaned"), going silent on a
 *  grounded symptom — the opposite of what D13 intends. A missed engine word (e.g. "carbs")
 *  degrades safely to the generic no-rule refusal, since the KB has no engine rules anyway. */
export function engineScopeViolation(bundle: ContextBundle, taxonomy: Taxonomy): string | null {
  const text = [bundle.question ?? "", bundle.feedback.text ?? ""].join(" ").toLowerCase();
  if (!text.trim()) return null;
  for (const kw of taxonomy.engine_scope_refusal.keywords) {
    const escaped = kw.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`).test(text)) return taxonomy.engine_scope_refusal.refusal;
  }
  return null;
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
