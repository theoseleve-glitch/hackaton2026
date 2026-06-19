import type { ChassisTemplate, ContextBundle, KBRule } from "./types";

export interface ScoredRule {
  rule: KBRule;
  score: number;
}

const MAX_RULES = 8;

/**
 * Deterministic retrieval — a pure function over the KB (D13: no vector store).
 * Scoring: exact (symptom, phase) match > symptom-only match; track conditions
 * amplify/reduce; counter-indicated rules are excluded outright.
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

    scored.push({ rule, score });
  }

  const confidenceRank = { high: 2, medium: 1, low: 0 } as const;
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      confidenceRank[b.rule.confidence] - confidenceRank[a.rule.confidence] ||
      a.rule.reversal_cost_minutes - b.rule.reversal_cost_minutes,
  );
  return scored.slice(0, MAX_RULES);
}
