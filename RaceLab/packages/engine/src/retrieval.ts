import type { ChassisTemplate, ContextBundle, KBRule } from "./types";
import { historyForRule, historyTier, type RuleHistory } from "./history";

export interface ScoredRule {
  rule: KBRule;
  score: number;
  /** This-track rated history for the rule (learning-loop read half), when any. */
  history?: RuleHistory;
}

const MAX_RULES = 8;

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

  // E1 (severity signal): how many times each symptom was reported. A symptom
  // tagged across several phases/runs ("understeer, understeer, understeer") is
  // more severe — rules that address it earn a small, bounded, integer boost so
  // the engine prioritizes the persistent problem. Deterministic, no RNG/clock.
  const symptomFreq = new Map<string, number>();
  for (const tag of bundle.feedback.tags) {
    symptomFreq.set(tag.symptom, (symptomFreq.get(tag.symptom) ?? 0) + 1);
  }

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

    // E1: per DISTINCT symptom this rule addresses that was reported >1×, add a
    // bounded integer (max +2 each, i.e. capped at "reported 3+ times").
    const boostedSymptoms = new Set<string>();
    for (const addr of rule.addresses) {
      if (boostedSymptoms.has(addr.symptom)) continue;
      const freq = symptomFreq.get(addr.symptom) ?? 0;
      if (freq > 1) {
        score += Math.min(freq - 1, 2);
        boostedSymptoms.add(addr.symptom);
      }
    }

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
      // R3-1 ROI ranking — "the better-for-performance lever". Among already-valid
      // candidates of EQUAL history-tier, EQUAL symptom-score AND EQUAL confidence,
      // prefer the change that gains the MOST lap time. Placed AFTER confidence on
      // purpose: confidence stays the higher-priority safety signal, impact only
      // breaks a tie among equally-confident, equally-grounded rules — it takes the
      // slot the reversal-cost tiebreaker used to own. Pure, bounded, deterministic
      // comparison of injected data; runs AFTER the grounding/scope/counter-
      // indication/score<=0 drop gates so it can never promote a rule the KB does
      // not already ground. SAFE FALLBACK: it fires ONLY when BOTH candidates carry
      // lap_time_impact_s; if either lacks it the comparator yields 0 and the
      // EXISTING order (reversal-cost → id) decides — so the rules without numbers
      // behave exactly as before.
      impactDelta(a.rule.lap_time_impact_s, b.rule.lap_time_impact_s) ||
      a.rule.reversal_cost_minutes - b.rule.reversal_cost_minutes ||
      (a.rule.id < b.rule.id ? -1 : a.rule.id > b.rule.id ? 1 : 0),
  );
  return scored.slice(0, MAX_RULES);
}

/**
 * R3-1 ROI tiebreaker. Returns a NEGATIVE number when `a` has the higher
 * lap-time gain (so `a` sorts first), POSITIVE when `b` does, and 0 — the safe
 * fallback — whenever either side lacks a finite impact. A NaN/Infinity guard
 * (the schema already forbids them) makes the comparator total and pure so a bad
 * value can never make the sort non-deterministic.
 */
function impactDelta(a: number | undefined, b: number | undefined): number {
  const safe = (v: number | undefined): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;
  const ia = safe(a);
  const ib = safe(b);
  if (ia === undefined || ib === undefined) return 0;
  return ib - ia; // higher impact first (descending)
}
