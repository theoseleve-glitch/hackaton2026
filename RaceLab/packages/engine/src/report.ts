import { getTemplate, type KBData } from "./data";
import { drivingTips } from "./driving-tips";
import {
  DO_NOTHING_MESSAGE,
  OUT_OF_KB_MESSAGE,
  engineScopeViolation,
  raceDayFilter,
} from "./guard";
import { conditionsEcho, ruleToOption } from "./offline";
import { retrieve } from "./retrieval";
import type { Confidence, ContextBundle, KBRule, RecommendationOption } from "./types";

/**
 * Layer 3 — the structured engineer report (D22). Same deterministic pipeline
 * as `recommend()` (D18: no API, no I/O) but rendered as the full 8-part
 * contract the product promises:
 *   diagnosis → priority change → secondary change → what NOT to touch →
 *   expected behavior → driving adaptation tips → confidence → why.
 */

export interface EngineerReport {
  kind: "report" | "do_nothing" | "refusal";
  conditions_echo: string;
  /** 1. what the engineer believes is going on */
  diagnosis: string;
  /** 2. priority setup change */
  primary?: RecommendationOption;
  /** 3. secondary setup change (different lever) */
  secondary?: RecommendationOption;
  /** 4. levers deliberately left alone — one change at a time */
  do_not_touch: string[];
  /** 5. how the car should feel after the primary change */
  expected_behavior?: string;
  /** 6. driving adaptation tips (Layer 4) */
  driving_tips: string[];
  /** 7. confidence of the primary change */
  confidence: Confidence | "none";
  /** 8. why this recommendation — citations, condition match, your history */
  rationale: string;
  /** refusal / do-nothing text when kind !== "report" */
  message?: string;
}

export function buildReport(bundle: ContextBundle, data: KBData): EngineerReport {
  const template = getTemplate(data, bundle.chassis_template_id);
  const echo = conditionsEcho(bundle);
  const diagnosis = buildDiagnosis(bundle);

  // 1. Engine-scope refusal (D13) — before anything else
  const refusal = engineScopeViolation(bundle, data.taxonomy);
  if (refusal) {
    return {
      kind: "refusal",
      conditions_echo: echo,
      diagnosis,
      do_not_touch: [],
      driving_tips: drivingTips(bundle),
      confidence: "none",
      rationale: "Engine tuning is outside the verified knowledge base (D13).",
      message: refusal,
    };
  }

  // 2. Deterministic retrieval + race-day filter (same pipeline as recommend())
  let scored = retrieve(data.rules, bundle, template);
  if (bundle.mode === "race_day") {
    scored = scored.filter(({ rule }) => raceDayFilter(rule).allowed);
  }

  if (scored.length === 0) {
    const raceDay = bundle.mode === "race_day";
    return {
      kind: raceDay ? "do_nothing" : "refusal",
      conditions_echo: echo,
      diagnosis,
      do_not_touch: raceDay ? ["Everything — protect the result."] : [],
      driving_tips: drivingTips(bundle),
      confidence: "none",
      rationale: raceDay
        ? "No rule clears the race-day bar (high confidence + fast revert) for this symptom."
        : "No verified KB rule addresses this symptom in these conditions.",
      message: raceDay
        ? DO_NOTHING_MESSAGE
        : `${OUT_OF_KB_MESSAGE} Closest area to investigate: tires/inserts for this surface — the most common cause when no chassis rule matches.`,
    };
  }

  // 3. Distinct-setting ranking: primary, secondary, and the levers we
  //    deliberately do NOT touch yet (ranked lower for these conditions).
  const distinct: KBRule[] = [];
  const seen = new Set<string>();
  for (const { rule } of scored) {
    if (seen.has(rule.setting)) continue;
    seen.add(rule.setting);
    distinct.push(rule);
    if (distinct.length === 4) break;
  }
  const [primaryRule, secondaryRule, ...parked] = distinct;
  const primary = ruleToOption(primaryRule, bundle);
  const secondary = secondaryRule ? ruleToOption(secondaryRule, bundle) : undefined;

  const do_not_touch = [
    ...parked.map(
      (r) => `${humanize(r.setting)} — relevant but ranked lower for these conditions; only after testing the primary.`,
    ),
    "Everything else — one change at a time, or you won't know what worked.",
  ];

  return {
    kind: "report",
    conditions_echo: echo,
    diagnosis,
    primary,
    secondary,
    do_not_touch,
    expected_behavior: expectedBehavior(primaryRule),
    driving_tips: drivingTips(bundle, primaryRule),
    confidence: primary.confidence,
    rationale: buildRationale(bundle, primaryRule),
  };
}

/** 1. Diagnosis — restate what the log says, in race-engineer language. */
function buildDiagnosis(bundle: ContextBundle): string {
  const parts: string[] = [];
  if (bundle.feedback.tags.length > 0) {
    const symptoms = bundle.feedback.tags
      .map((t) => `${humanize(t.symptom)}${t.phase ? ` (${humanize(t.phase)})` : ""}${t.evolution ? `, ${humanize(t.evolution)}` : ""}`)
      .join("; ");
    parts.push(`Reported: ${symptoms}.`);
  } else if (bundle.feedback.text) {
    parts.push(`Reported: "${bundle.feedback.text}".`);
  } else {
    parts.push("No symptom reported.");
  }

  const ctx: string[] = [`${bundle.track.grip.replace("_", " ")} grip ${bundle.track.surface}`];
  if (bundle.track.evolution && bundle.track.evolution !== "stable") ctx.push(`track ${bundle.track.evolution}`);
  if (bundle.tyres?.wear && bundle.tyres.wear !== "new") ctx.push(`${bundle.tyres.wear} tyres`);
  if (bundle.weather?.air_temp_c !== undefined) ctx.push(`${bundle.weather.air_temp_c}°C`);
  parts.push(`Context: ${ctx.join(", ")}.`);
  return parts.join(" ");
}

/** 5. Expected behavior — the primary rule's effects, in plain words. */
function expectedBehavior(rule: KBRule): string {
  const effects = rule.effects.map((e) => `${humanize(e.axis)}: ${humanize(e.change)}`).join("; ");
  return `After the change: ${effects}. ${rule.magnitude_guidance}`;
}

/** 8. Why — citations + condition match + the driver's own history. */
function buildRationale(bundle: ContextBundle, rule: KBRule): string {
  const parts: string[] = [`Grounded on ${rule.id} (${rule.sources.join("; ")}).`];

  const trackConditions = new Set(bundle.track.conditions);
  const amplifiers = rule.conditions.amplified_on.filter((c) => trackConditions.has(c));
  if (amplifiers.length > 0) {
    parts.push(`Current conditions (${amplifiers.map(humanize).join(", ")}) amplify this rule.`);
  }

  const history = bundle.history ?? [];
  if (history.length > 0) {
    const better = history.filter((h) => h.outcome === "better").length;
    const worse = history.filter((h) => h.outcome === "worse").length;
    parts.push(
      `Your log in similar conditions: ${better} run${better === 1 ? "" : "s"} rated better, ${worse} worse, of ${history.length} rated.`,
    );
  } else {
    parts.push("No rated runs in similar conditions yet — rate this run afterwards and the next report gets smarter.");
  }
  return parts.join(" ");
}

function humanize(id: string): string {
  return id.replace(/_/g, " ");
}
