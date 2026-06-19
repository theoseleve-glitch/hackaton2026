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
import { conditionsEcho, effectsText, filterToTemplate, ruleToOption } from "./offline";
import { retrieve, type ScoredRule } from "./retrieval";
import { historyTier } from "./history";
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

  // R3-1: did lap-time impact DECIDE the primary? True only when the primary
  // carries a finite impact AND at least one OTHER retrieved candidate tied it on
  // history-tier + symptom-score yet carries a finite, strictly-lower impact — so
  // the ROI tiebreaker (not score or reversal cost) is what put this rule on top.
  // Drives the "highest estimated lap-time gain" rationale clause; pure read of
  // the already-computed `scored` list, no new ordering.
  const impactDecidedPrimary = impactWasDecisive(primaryRule, scored);

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
    rationale: buildRationale(bundle, primaryRule, impactDecidedPrimary),
  };
}

/** R3-1 — was the ROI tiebreaker the reason this rule is primary? Pure, total.
 *  The primary's impact must be finite, and some OTHER candidate that TIED it on
 *  every gate ABOVE impact in the sort (history-tier → symptom-score → confidence)
 *  must carry a finite, strictly-LOWER impact. Only then did the lap-time gain —
 *  not score, tier or confidence — put this rule on top; otherwise the clause
 *  would over-claim, so we stay silent. Mirrors the retrieval sort order exactly. */
function impactWasDecisive(primaryRule: KBRule, scored: ScoredRule[]): boolean {
  const primaryImpact = primaryRule.lap_time_impact_s;
  if (!isFiniteNumber(primaryImpact)) return false;
  const primaryScored = scored.find((s) => s.rule.id === primaryRule.id);
  if (!primaryScored) return false;
  const primaryTier = historyTier(primaryScored.history);
  return scored.some((s) => {
    if (s.rule.id === primaryRule.id) return false;
    if (historyTier(s.history) !== primaryTier) return false;
    if (s.score !== primaryScored.score) return false;
    if (s.rule.confidence !== primaryRule.confidence) return false;
    const other = s.rule.lap_time_impact_s;
    return isFiniteNumber(other) && other < primaryImpact;
  });
}

/** 1. Diagnosis — restate what the log says, in race-engineer language, then
 *  explain the likely ROOT CAUSE (R3-2) for the lead symptom: not "you have
 *  understeer" but "the front isn't biting because weight isn't reaching the
 *  front fast enough". Grounded in universal chassis dynamics (NOT a KB citation),
 *  pure and deterministic. */
function buildDiagnosis(bundle: ContextBundle): string {
  const parts: string[] = [];
  if (bundle.feedback.tags.length > 0) {
    const symptoms = bundle.feedback.tags
      .map((t) => `${humanize(t.symptom)}${t.phase ? ` (${humanize(t.phase)})` : ""}${t.evolution ? `, ${humanize(t.evolution)}` : ""}`)
      .join("; ");
    parts.push(`Reported: ${symptoms}.`);
    // R3-2: root-cause chain for the LEAD (first) tag — the symptom→cause clause.
    const lead = bundle.feedback.tags[0];
    const cause = rootCause(lead.symptom, lead.phase);
    if (cause) parts.push(cause);
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

/**
 * R3-2 — symptom → likely ROOT CAUSE, in universal chassis-dynamics terms (never
 * a fake KB citation). Pure + deterministic: a fixed lookup keyed on symptom,
 * refined by phase where the cause genuinely differs (entry vs mid vs exit).
 * Returns "" for symptoms we won't editorialise on, so the diagnosis never
 * fabricates a cause it can't stand behind.
 */
function rootCause(symptom: string, phase?: string): string {
  switch (symptom) {
    case "understeer":
      if (phase === "corner_exit" || phase === "on_power")
        return "The front washes out as you get back on the power — drive is overpowering front grip, or weight has shifted too far rearward to keep the nose planted.";
      if (phase === "mid_corner")
        return "The front won't hold the apex — through the middle of the corner the front tyres are out of grip for this surface, or the car is leaning too much to load them evenly.";
      // entry / off_power / default
      return "The front isn't biting as you turn in; usually weight isn't reaching the front tyres fast enough, or the front has too little mechanical grip for this surface.";
    case "oversteer":
      if (phase === "corner_entry" || phase === "braking")
        return "The rear goes light and steps out as you turn in or brake — weight is pitching forward off the rear tyres faster than they can take it.";
      if (phase === "corner_exit" || phase === "on_power")
        return "The rear lets go as you feed in the power — the rear tyres are asked for more grip than they have, either too much drive too early or too little rear mechanical grip.";
      // mid_corner / default
      return "The rear is short on grip through the corner — it's overloaded relative to the front, so the back end rotates more than you want.";
    case "no_forward_bite":
      return "The rear can't put the power down out of the corner — the tyres are spinning instead of driving, so torque is arriving faster or harder than the surface can take.";
    case "traction_roll":
      return "The car is generating more grip than it can stand up to and tips onto its side — too much sudden lateral load high up, not enough roll resistance for this much bite.";
    case "bouncy":
      return "The suspension isn't absorbing the inputs — damping is letting the car oscillate (pogo) instead of settling the energy in one motion.";
    case "bottoming":
      return "The chassis is running out of suspension travel and slapping the ground — too little ride height or too little support for the load on compression.";
    case "unstable_braking":
      return "The rear wanders under braking — weight pitches hard onto the front and the rear goes light, so the back end loses the grip it needs to track straight.";
    case "sluggish_steering":
      return "The steering feels slow to answer — the front is taking too long to load and build grip when you turn in.";
    case "twitchy":
      return "The car reacts faster than you can manage — the front is over-loaded relative to the rear, so small inputs over-rotate it.";
    case "nosedive_jumps":
      return "The nose drops in the air off jumps — weight is too far forward or the front gives up support on take-off, pitching the car down.";
    case "poor_bump_handling":
      return "The car skips and deflects over the rough — the suspension is too harsh or under-damped to keep the tyres tracking the ground.";
    default:
      return "";
  }
}

/** 5. Expected behavior — the primary rule's effects, in plain words.
 *  R2-3: effectsText appends each effect's quantified magnitude_estimate when
 *  the KB rule carries one (e.g. "steering response: faster [±5-8%]"). */
function expectedBehavior(rule: KBRule): string {
  const effects = effectsText(rule);
  // M1-M3: surface the hard safety caveat in the expected-behavior section too.
  const danger = rule.danger ? ` ⚠️ SAFETY: ${rule.danger}` : "";
  return `After the change: ${effects}. ${rule.magnitude_guidance}${danger}`;
}

/** 8. Why — citations + condition match + the driver's own history.
 *  `impactDecidedPrimary` (R3-1) is true when the ROI tiebreaker is what put this
 *  rule on top over an equally-grounded, lower-gain rival — only then do we say so. */
function buildRationale(bundle: ContextBundle, rule: KBRule, impactDecidedPrimary = false): string {
  const parts: string[] = [`Grounded on ${rule.id} (${rule.sources.join("; ")}).`];

  // R2-3 → R3-1: estimated lap-time gain when the rule carries one. The value is
  // validated positive+finite by the KB schema; the isFiniteNumber guard is
  // belt-and-braces so a bad value never renders "NaN"/"Infinity". When this
  // gain is also what RANKED the rule to primary (over an equally-grounded but
  // lower-gain rival), say so explicitly — that is the "better for performance"
  // lever made legible.
  if (isFiniteNumber(rule.lap_time_impact_s)) {
    const gain = rule.lap_time_impact_s.toFixed(1);
    parts.push(
      impactDecidedPrimary
        ? `Chosen as the primary because it has the highest estimated lap-time gain (~${gain}s/lap) among the changes that fit here.`
        : `Estimated upside ~${gain}s/lap potential (rough; depends on track and driver).`,
    );
  }

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
    // R2-4: confidence CALIBRATION — the `confidence` enum still mirrors the
    // rule's static confidence (adversarial checks the enum), but the WORDING
    // here tempers it to evidence strength. A high-confidence KB rule with thin
    // or mixed history on YOUR car is honestly "high in theory, unproven on your
    // car" rather than flatly "high". Pure language, no enum change.
    const thin = history.length < 3;
    const mixed = worse >= better && worse > 0;
    if (rule.confidence === "high" && (thin || mixed)) {
      parts.push(
        mixed
          ? "Confidence is high on the bench science, but your own runs are mixed — treat it as a test, not a certainty."
          : "Confidence is high on the bench science, but there's limited data on YOUR car yet — verify it on track.",
      );
    }
  } else {
    parts.push("No rated runs in similar conditions yet — rate this run afterwards and the next report gets smarter.");
    // R2-4: high-confidence rule, zero history → say the confidence is from the
    // verified KB science, not yet from the driver's own car. Language only.
    if (rule.confidence === "high") {
      parts.push("That confidence is from the verified set-up science — you've no rated runs on your car to confirm it here yet.");
    }
  }
  return parts.join(" ");
}

function humanize(id: string): string {
  return id.replace(/_/g, " ");
}
