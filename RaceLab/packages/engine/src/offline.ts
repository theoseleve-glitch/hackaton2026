import type { ChassisTemplate, ContextBundle, KBRule, RecommendationOption } from "./types";
import type { ScoredRule } from "./retrieval";
import { historyNote, type RuleHistory } from "./history";
import { isFiniteNumber, optionIsEmittable, settingUnknownToTemplate } from "./guard";

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
  // M5: never render a non-finite "(currently NaN)"; omit the value instead.
  const showCurrent = current !== undefined && (typeof current !== "number" || isFiniteNumber(current));
  const currentTxt = showCurrent ? ` (currently ${current})` : "";
  // R2-3: effects render their OPTIONAL quantified magnitude when present
  // ("steering response: faster [±5-8%]"); absent → terse current form.
  const effects = effectsText(rule);
  // M1-M3: a physical-risk rule's hard caveat rides verbatim into the change
  // text so the limit reaches the racer at the point of action — never buried.
  const dangerTxt = rule.danger ? ` ⚠️ SAFETY: ${rule.danger}` : "";
  // D1: magnitude_guidance ("1mm at a time") is hoisted to its own field so the
  // step size is never buried in prose. The ⚠️ SAFETY caveat stays on `change`.
  return {
    setting: rule.setting,
    change: `${humanize(rule.direction)} ${humanize(rule.setting)}${currentTxt}${dangerTxt}`,
    magnitude: rule.magnitude_guidance ?? "",
    // R2-3: when a rule carries a physics one-liner, lead with it ("<brief>. This
    // produces: <effects>.") instead of the terse "Per <source>: <effects>.".
    mechanism: rule.mechanism_brief
      ? `${rule.mechanism_brief} This produces: ${effects}.`
      : `Per ${rule.sources[0]}: ${effects}.`,
    expected_effect: effects,
    confidence: rule.confidence,
    citations: [rule.id],
    revert: `Reverse the change; ~${rule.reversal_cost_minutes} min.`,
    if_it_does_not_help: "Revert, then re-test — the cause is likely the next-ranked option below, or tires for this surface.",
    ...(history ? { history_note: historyNote(history) } : {}),
  };
}

/** R2-3 — effects line, appending each effect's OPTIONAL quantified magnitude
 *  estimate when the KB rule carries one. Shared by ruleToOption and the
 *  report's expected-behavior so quantification surfaces consistently. */
export function effectsText(rule: KBRule): string {
  return rule.effects
    .map((e) => {
      const mag = e.magnitude_estimate ? ` [${e.magnitude_estimate}]` : "";
      return `${humanize(e.axis)}: ${humanize(e.change)}${mag}`;
    })
    .join("; ");
}

/**
 * M6b — drop scored rules whose setting is not on the active template BEFORE
 * any option is built. Retrieval gates on scope-tags only, so a rule can match
 * the chassis yet name a field the template lacks (template/KB vocabulary
 * desync). Such advice can't be looked up or applied — grounded-or-silent says
 * drop it, never emit unmappable advice.
 */
export function filterToTemplate(scored: ScoredRule[], template: ChassisTemplate): ScoredRule[] {
  return scored.filter(({ rule }) => !settingUnknownToTemplate(rule.setting, template));
}

/** Pick primary + up to 2 alternatives with DISTINCT settings (one lever per option). */
export function buildOfflineCard(
  scored: ScoredRule[],
  bundle: ContextBundle,
  template: ChassisTemplate,
  retrievedIds: Set<string>,
): { primary: RecommendationOption; alternatives: RecommendationOption[] } | null {
  if (scored.length === 0) return null;
  const seenSettings = new Set<string>();
  const options: RecommendationOption[] = [];
  for (const { rule, history } of scored) {
    if (seenSettings.has(rule.setting)) continue;
    const option = ruleToOption(rule, bundle, history);
    // Final fail-closed gate: grounded + on-template + finite, or drop it.
    if (!optionIsEmittable(option, template, retrievedIds)) continue;
    seenSettings.add(rule.setting);
    options.push(option);
    if (options.length === 3) break;
  }
  if (options.length === 0) return null;
  const [primary, ...alternatives] = options;
  return { primary, alternatives };
}

export function conditionsEcho(bundle: ContextBundle): string {
  const w = bundle.weather;
  // M5: only echo finite numerics (sanitizeBundle drops non-finite at the
  // boundary; this is the belt-and-braces guard at the format site).
  const tempTxt = isFiniteNumber(w?.air_temp_c) ? `, ${w!.air_temp_c}°C` : "";
  const rainTxt = isFiniteNumber(w?.rain_risk_pct) && w!.rain_risk_pct ? `, ${w!.rain_risk_pct}% rain risk` : "";
  const weatherTxt = tempTxt ? `${tempTxt}${rainTxt}` : "";
  return `${bundle.track.grip.replace("_", " ")} grip ${bundle.track.surface} at ${bundle.track.name}${weatherTxt} (${bundle.track.conditions.join(", ") || "no condition tags"}) — ${bundle.mode === "race_day" ? "RACE DAY" : "practice"}`;
}

export function humanize(id: string): string {
  return id.replace(/_/g, " ");
}
