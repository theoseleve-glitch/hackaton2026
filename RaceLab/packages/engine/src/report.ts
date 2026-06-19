import type { KBData } from "./data";
import { drivingTips } from "./driving-tips";
import {
  DO_NOTHING_MESSAGE,
  OUT_OF_KB_MESSAGE,
  engineScopeViolation,
  isFiniteNumber,
  optionIsEmittable,
  raceDayFilter,
  sanitizeBundle,
} from "./guard";
import { conditionsEcho, filterToTemplate, ruleToOption } from "./offline";
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

export function buildReport(rawBundle: ContextBundle, data: KBData): EngineerReport {
  // M5: strip non-finite numerics at the boundary before anything is rendered.
  const bundle = sanitizeBundle(rawBundle);
  const echo = conditionsEcho(bundle);
  const diagnosis = buildDiagnosis(bundle);

  // M4: unknown chassis template is an in-band refusal — NEVER a throw across
  // the package boundary (mirrors proposePlan()).
  const template = data.templates[bundle.chassis_template_id];
  if (!template) {
    return {
      kind: "refusal",
      conditions_echo: echo,
      diagnosis,
      do_not_touch: [],
      driving_tips: drivingTips(bundle),
      confidence: "none",
      rationale: "The chassis template is not in the verified knowledge base.",
      message: `Chassis template '${bundle.chassis_template_id}' is not in the KB — no grounded report.`,
    };
  }

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
  const retrievedIds = new Set(scored.map(({ rule }) => rule.id));
  // 2b. M6b: drop rules whose setting isn't on this template (grounded-or-silent).
  scored = filterToTemplate(scored, template);
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
  //    Each rule becomes an option only if it passes the fail-closed emittable
  //    gate (grounded + on-template + finite); otherwise it is dropped so no
  //    unmappable/ungrounded advice is ever rendered.
  const distinct: { rule: KBRule; option: RecommendationOption }[] = [];
  const seen = new Set<string>();
  for (const { rule } of scored) {
    if (seen.has(rule.setting)) continue;
    const option = ruleToOption(rule, bundle);
    if (!optionIsEmittable(option, template, retrievedIds)) continue;
    seen.add(rule.setting);
    distinct.push({ rule, option });
    if (distinct.length === 4) break;
  }

  // Nothing survived the gate → honest refusal/do-nothing, never a guess.
  if (distinct.length === 0) {
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

  const [primaryEntry, secondaryEntry, ...parked] = distinct;
  const primaryRule = primaryEntry.rule;
  const primary = primaryEntry.option;
  const secondary = secondaryEntry?.option;

  const do_not_touch = [
    ...parked.map(
      ({ rule }) => `${humanize(rule.setting)} — relevant but ranked lower for these conditions; only after testing the primary.`,
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
  // M5: only echo a finite temperature (sanitizeBundle already dropped non-finite
  // values; this is the belt-and-braces guard at the format site).
  if (isFiniteNumber(bundle.weather?.air_temp_c)) ctx.push(`${bundle.weather!.air_temp_c}°C`);
  parts.push(`Context: ${ctx.join(", ")}.`);
  return parts.join(" ");
}

/** 5. Expected behavior — the primary rule's effects, in plain words. */
function expectedBehavior(rule: KBRule): string {
  const effects = rule.effects.map((e) => `${humanize(e.axis)}: ${humanize(e.change)}`).join("; ");
  // M1-M3: surface the hard safety caveat in the expected-behavior section too.
  const danger = rule.danger ? ` ⚠️ SAFETY: ${rule.danger}` : "";
  return `After the change: ${effects}. ${rule.magnitude_guidance}${danger}`;
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
    // D2: evidence-strength tag — distinguish a 10–0 record from a 2–1 one, and
    // be honest when the sample is thin (<3 rated). Pure, narrative-only.
    let strength = "";
    if (better >= 3 && worse === 0) strength = " Strong track record.";
    else if (better === worse) strength = " Mixed track record.";
    const sampleTag = history.length < 3 ? " (small sample)" : "";
    parts.push(
      `Your log in similar conditions: ${better} run${better === 1 ? "" : "s"} rated better, ${worse} worse, of ${history.length} rated${sampleTag}.${strength}`,
    );
  } else {
    parts.push("No rated runs in similar conditions yet — rate this run afterwards and the next report gets smarter.");
  }
  return parts.join(" ");
}

function humanize(id: string): string {
  return id.replace(/_/g, " ");
}
