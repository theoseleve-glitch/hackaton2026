import type { ContextBundle, Confidence, KBRule, RecommendationOption } from "./types";
import type { ScoredRule } from "./retrieval";
import { historyNote, matchedSignalUsed, type RuleHistory } from "./history";

/**
 * Per-card confidence qualifier (M3) — a PURE, deterministic, honest read of how
 * sure THIS recommendation is, composed from inputs already on the table. It is
 * an ADDITIVE annotation only: the base `level` is `rule.confidence` UNCHANGED,
 * and nothing here touches which rules fire, their ranking, the ±1 history cap,
 * or the race-day bar (those all still key off `rule.confidence`).
 *
 * The qualifier NEVER overclaims — it composes four signals, each grounded:
 *   1. match strength: EXACT (symptom AND phase both present & equal) vs
 *      symptom-only. Mirrors retrieval's +3 (exact) / +2 (symptom-only) scoring
 *      so the card text agrees with why the rule was retrieved.
 *   2. source breadth: rule.sources.length (1 → single-source, ≥2 → multi-source).
 *   3. this-condition history depth: matched (condition-segmented) net when the
 *      learner used the matched signal — exactly when historyTier did, so the
 *      "in similar conditions" claim can't contradict the tier; else the untagged
 *      fallback; else "untested here".
 *   4. reversal-cost awareness: "~N min to revert" (rule.reversal_cost_minutes).
 *
 * No Math.random, no Date — same inputs always yield the same string.
 */
export interface ConfidenceDetail {
  /** The rule's static confidence, passed through UNCHANGED (the race-day bar,
   *  ranking and ±1 cap all still key off this). */
  level: Confidence;
  /** One honest sentence: lead word reflects level, body composes the signals. */
  qualifier: string;
}

const LEAD: Record<Confidence, string> = {
  high: "High confidence",
  medium: "Worth a try",
  low: "Tentative",
};

/** Does an EXACT (symptom AND phase) address match a driver tag, or only a
 *  symptom-level one? Exact requires both sides to carry the phase and agree;
 *  weaker matches (phase-differ +1 / symptom-only +2) collapse to 'symptom-only'
 *  and a no-symptom rule to 'none' — the wording can only soften, never inflate. */
function matchStrength(rule: KBRule, bundle: ContextBundle): "exact" | "symptom-only" | "none" {
  let symptom = false;
  for (const tag of bundle.feedback.tags) {
    for (const addr of rule.addresses) {
      if (addr.symptom !== tag.symptom) continue;
      symptom = true;
      if (addr.phase && tag.phase && addr.phase === tag.phase) return "exact";
    }
  }
  return symptom ? "symptom-only" : "none";
}

/** History clause for the qualifier — agrees with historyTier/historyNote on
 *  whether the matched (condition) signal or the untagged fallback is in play,
 *  so "in similar conditions" is never claimed when the tier came from untagged
 *  rows. */
function historyClause(history: RuleHistory | undefined): string {
  if (!history) return "untested here";
  const scoped = matchedSignalUsed(history);
  const net = scoped ? history.matched_net : history.net;
  const where = scoped ? "here in similar conditions" : "here";
  if (net > 0) return `rated better ${where}`;
  if (net < 0) return `rated worse ${where}`;
  const better = scoped ? history.matched_better : history.better;
  const worse = scoped ? history.matched_worse : history.worse;
  return better > 0 && worse > 0 ? `mixed results ${where}` : `no change ${where}`;
}

/**
 * Pure, deterministic per-card confidence qualifier. Base level is the rule's
 * own confidence (untouched); the qualifier string composes match strength,
 * source breadth, this-condition history depth and revert cost. Honest by
 * construction — symptom-only/single-source/untested wording can only soften
 * the read, never inflate it.
 */
export function confidenceDetail(
  rule: KBRule,
  bundle: ContextBundle,
  history?: RuleHistory,
): ConfidenceDetail {
  const parts: string[] = [];

  const match = matchStrength(rule, bundle);
  parts.push(match === "exact" ? "exact match" : match === "symptom-only" ? "symptom-only match" : "context-only match");

  parts.push(historyClause(history));

  parts.push(rule.sources.length >= 2 ? "multi-source" : "single-source");

  parts.push(`~${rule.reversal_cost_minutes} min to revert`);

  return { level: rule.confidence, qualifier: `${LEAD[rule.confidence]} — ${parts.join(", ")}` };
}

/**
 * Offline deterministic path (D13): each KB rule already carries everything the
 * output contract needs — render a templated card on-device, $0, no signal.
 */
export function ruleToOption(
  rule: KBRule,
  bundle: ContextBundle,
  history?: RuleHistory,
): RecommendationOption {
  const current = bundle.setup[rule.setting];
  const currentTxt = current !== undefined ? ` (currently ${current})` : "";
  const effects = rule.effects.map((e) => `${humanize(e.axis)}: ${humanize(e.change)}`).join("; ");
  return {
    setting: rule.setting,
    change: `${humanize(rule.direction)} ${humanize(rule.setting)}${currentTxt} — ${rule.magnitude_guidance}`,
    mechanism: `Per ${rule.sources[0]}: ${effects}.`,
    expected_effect: effects,
    confidence: rule.confidence,
    confidence_qualifier: confidenceDetail(rule, bundle, history).qualifier,
    citations: [rule.id],
    revert: `Reverse the change; ~${rule.reversal_cost_minutes} min.`,
    if_it_does_not_help: "Revert, then re-test. If the symptom persists, the next-ranked option below is the next candidate to try; tyres/inserts for this surface are also a common cause.",
    ...(history ? { history_note: historyNote(history) } : {}),
  };
}

/** Pick primary + up to 2 alternatives with DISTINCT settings (one lever per option). */
export function buildOfflineCard(
  scored: ScoredRule[],
  bundle: ContextBundle,
): { primary: RecommendationOption; alternatives: RecommendationOption[] } | null {
  if (scored.length === 0) return null;
  const seenSettings = new Set<string>();
  const options: RecommendationOption[] = [];
  for (const { rule, history } of scored) {
    if (seenSettings.has(rule.setting)) continue;
    seenSettings.add(rule.setting);
    options.push(ruleToOption(rule, bundle, history));
    if (options.length === 3) break;
  }
  const [primary, ...alternatives] = options;
  return { primary, alternatives };
}

export function conditionsEcho(bundle: ContextBundle): string {
  const w = bundle.weather;
  // Independent optional parts — rain risk must show even with no air temp (the
  // live logbook bundle can carry rain_risk_pct without air_temp_c).
  const weatherParts = [
    w?.air_temp_c !== undefined ? `${w.air_temp_c}°C` : null,
    w?.rain_risk_pct ? `${w.rain_risk_pct}% rain risk` : null,
  ].filter(Boolean);
  const weatherTxt = weatherParts.length ? `, ${weatherParts.join(", ")}` : "";
  return `${bundle.track.grip.replace("_", " ")} grip ${bundle.track.surface} at ${bundle.track.name}${weatherTxt} (${bundle.track.conditions.join(", ") || "no condition tags"}) — ${bundle.mode === "race_day" ? "RACE DAY" : "practice"}`;
}

export function humanize(id: string): string {
  return id.replace(/_/g, " ");
}
