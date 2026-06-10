import type { ContextBundle, KBRule, RecommendationOption } from "./types.js";
import type { ScoredRule } from "./retrieval.js";

/**
 * Offline deterministic path (D13): each KB rule already carries everything the
 * output contract needs — render a templated card on-device, $0, no signal.
 */
export function ruleToOption(rule: KBRule, bundle: ContextBundle): RecommendationOption {
  const current = bundle.setup[rule.setting];
  const currentTxt = current !== undefined ? ` (currently ${current})` : "";
  const effects = rule.effects.map((e) => `${humanize(e.axis)}: ${humanize(e.change)}`).join("; ");
  return {
    setting: rule.setting,
    change: `${humanize(rule.direction)} ${humanize(rule.setting)}${currentTxt} — ${rule.magnitude_guidance}`,
    mechanism: `Per ${rule.sources[0]}: ${effects}.`,
    expected_effect: effects,
    confidence: rule.confidence,
    citations: [rule.id],
    revert: `Reverse the change; ~${rule.reversal_cost_minutes} min.`,
    if_it_does_not_help: "Revert, then re-test — the cause is likely the next-ranked option below, or tires for this surface.",
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
  for (const { rule } of scored) {
    if (seenSettings.has(rule.setting)) continue;
    seenSettings.add(rule.setting);
    options.push(ruleToOption(rule, bundle));
    if (options.length === 3) break;
  }
  const [primary, ...alternatives] = options;
  return { primary, alternatives };
}

export function conditionsEcho(bundle: ContextBundle): string {
  const w = bundle.weather;
  const weatherTxt =
    w?.air_temp_c !== undefined ? `, ${w.air_temp_c}°C${w.rain_risk_pct ? `, ${w.rain_risk_pct}% rain risk` : ""}` : "";
  return `${bundle.track.grip.replace("_", " ")} grip ${bundle.track.surface} at ${bundle.track.name}${weatherTxt} (${bundle.track.conditions.join(", ") || "no condition tags"}) — ${bundle.mode === "race_day" ? "RACE DAY" : "practice"}`;
}

function humanize(id: string): string {
  return id.replace(/_/g, " ");
}
