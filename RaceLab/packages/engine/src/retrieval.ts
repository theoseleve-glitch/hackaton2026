import type { ChassisTemplate, ContextBundle, KBRule } from "./types";
import { historyForRule, historyTier, type RuleHistory } from "./history";
import { raceDayFilter } from "./guard";

export interface ScoredRule {
  rule: KBRule;
  score: number;
  /** This-track rated history for the rule (learning-loop read half), when any. */
  history?: RuleHistory;
}

const MAX_RULES = 8;

/** Does this model physically expose the part a rule changes? A setting is
 *  exposed iff it's a concrete field on the template, OR an alias/derived whose
 *  `of` targets are all present concrete fields. Pure membership test (no merge
 *  order, deterministic). This is the model-capability gate: a rule whose part
 *  the car doesn't have is never offered — "reset his mind per model" (D48). */
export function templateExposes(template: ChassisTemplate, setting: string): boolean {
  const fields = template.fields;
  const field = fields[setting];
  if (!field) return false;
  if (field.type === "alias" || field.type === "derived") {
    const of = Array.isArray(field.of) ? field.of : [];
    return of.length > 0 && of.every((t) => fields[t] !== undefined);
  }
  return true;
}

/**
 * Deterministic retrieval — a pure function over the KB (D13: no vector store).
 * Scoring: exact (symptom, phase) match > symptom-only match; track conditions
 * amplify/reduce; counter-indicated rules are excluded outright.
 *
 * History re-ranking (docs/04 §6 read half): a rule whose past outcome AT THIS
 * TRACK rated 'worse' (net) sorts below clean rules; 'better' (net) sorts
 * above. GROUNDED-FIRST: history runs strictly AFTER the symptom/condition/
 * scope filters, so it can only re-order rules the KB already grounds — it can
 * never promote a rule whose conditions don't match, and its influence is
 * capped at one tier either way.
 */
export function retrieve(
  rules: KBRule[],
  bundle: ContextBundle,
  template: ChassisTemplate,
): ScoredRule[] {
  const presentSymptoms = new Set(bundle.feedback.tags.map((t) => t.symptom));
  const trackConditions = new Set(bundle.track.conditions);

  const scored: ScoredRule[] = [];
  for (const rule of rules) {
    // chassis scope filter: rule scope must intersect template scope
    if (!rule.scope.some((s) => template.scope.includes(s))) continue;

    // model-capability gate: never recommend a part the car doesn't expose
    if (!templateExposes(template, rule.setting)) continue;

    // hard surface/condition exclusion: a rule that is WRONG here is dropped,
    // not merely de-weighted (forbidden_on, not reduced_on)
    if (rule.forbidden_on?.some((c) => trackConditions.has(c))) continue;

    // power-legality gate: a rule restricted to certain power sub-classes fires
    // only when one of them is the active run power tag (e.g. boost/turbo timing
    // only in modified_power — never recommend an illegal mod to a spec entrant)
    if (rule.legal_in_power && !rule.legal_in_power.some((p) => trackConditions.has(p))) continue;

    // a rule that worsens a symptom the driver already reports is never offered
    if (rule.counter_indications.some((ci) => presentSymptoms.has(ci))) continue;

    let score = 0;
    for (const tag of bundle.feedback.tags) {
      for (const addr of rule.addresses) {
        if (addr.symptom !== tag.symptom) continue;
        if (addr.phase && tag.phase && addr.phase === tag.phase) score += 3;
        else if (!addr.phase || !tag.phase) score += 2;
        // symptom matches but phases differ: weak signal
        else score += 1;
      }
    }
    if (score === 0) continue; // rule does not address any reported symptom

    for (const c of rule.conditions.amplified_on) if (trackConditions.has(c)) score += 1;
    for (const c of rule.conditions.reduced_on) if (trackConditions.has(c)) score -= 2;
    if (score <= 0) continue;

    const history = historyForRule(rule.id, bundle);
    scored.push(history ? { rule, score, history } : { rule, score });
  }

  const confidenceRank = { high: 2, medium: 1, low: 0 } as const;
  scored.sort(
    (a, b) =>
      historyTier(b.history) - historyTier(a.history) ||
      b.score - a.score ||
      confidenceRank[b.rule.confidence] - confidenceRank[a.rule.confidence] ||
      a.rule.reversal_cost_minutes - b.rule.reversal_cost_minutes ||
      (a.rule.id < b.rule.id ? -1 : a.rule.id > b.rule.id ? 1 : 0),
  );
  // Race-day bar applied to the FULL ranked pool BEFORE the top-N truncation. Applying
  // it post-slice (as the callers used to) could starve a valid high-confidence
  // fast-revert rule out: history re-ranking can float ineligible (medium / slow-revert)
  // rules into all N slots, the post-slice filter then drops them all, and the engine
  // wrongly returns "do nothing" while eligible rules sat at rank N+1. Mirrors planRaceDay,
  // which already filters inside its candidate loop. (No-op off race day.)
  const pool =
    bundle.mode === "race_day" ? scored.filter(({ rule }) => raceDayFilter(rule).allowed) : scored;
  return pool.slice(0, MAX_RULES);
}
