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
import type { Confidence, ContextBundle, FeedbackTag, KBRule, RecommendationOption } from "./types";

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
  /** R4-3 — a single plain-English sentence a club racer reads FIRST, summarizing
   *  the whole call: the primary change + its confidence + (when present) the
   *  estimated lap-time gain, or for refusal/do-nothing what to do instead.
   *  Additive + optional (backward compatible); always a non-empty, NaN-free
   *  string when set. Built purely from the report's own fields. */
  headline?: string;
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
      headline: verdictHeadline("refusal"),
      diagnosis,
      do_not_touch: [],
      driving_tips: drivingTips(bundle),
      confidence: "none",
      rationale: "The chassis template is not in the verified knowledge base.",
      message: `Chassis template '${bundle.chassis_template_id}' is not in the KB, so I have no verified bounds for this car and won't guess. What to do: pick one of the supported chassis (the closest match works to start), then describe the symptom and I'll have grounded rules to work from.`,
    };
  }

  // 1. Engine-scope refusal (D13) — before anything else
  const refusal = engineScopeViolation(bundle, data.taxonomy);
  if (refusal) {
    return {
      kind: "refusal",
      conditions_echo: echo,
      headline: verdictHeadline("refusal"),
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
      headline: verdictHeadline(raceDay ? "do_nothing" : "refusal"),
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
      headline: verdictHeadline(raceDay ? "do_nothing" : "refusal"),
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
  // R6-2: the secondary is the FALLBACK. Re-frame its "if it doesn't help" so it
  // reads as "only try this if the primary doesn't fully fix it — it's a
  // different lever, so it stacks rather than fights the first change". Built
  // purely from the two options' own settings; the original option is untouched
  // (a fresh object), so primary/alternatives paths elsewhere stay as they were.
  const secondary = secondaryEntry
    ? { ...secondaryEntry.option, if_it_does_not_help: secondaryFallbackFraming(primary, secondaryEntry.option) }
    : undefined;

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
    headline: reportHeadline(primaryRule, primary.confidence),
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

/**
 * R4-3 — the plain-English headline a club racer reads FIRST. ONE sentence built
 * purely from the primary change + its confidence + (when finite) the rule's
 * estimated lap-time gain. No KB prose, no numerics beyond the validated gain,
 * so it is always a non-empty, NaN-free string. Pure + deterministic.
 *
 * Reads like: "Thin the rear diff oil — your biggest, lowest-risk gain right now
 * (high confidence, ~0.2s/lap on the table)."
 */
function reportHeadline(rule: KBRule, confidence: Confidence): string {
  const action = `${humanize(rule.direction)} ${humanize(rule.setting)}`;
  // The risk framing tracks confidence: high → "lowest-risk", medium → "solid",
  // low → an honest "worth a try". A danger caveat downgrades the risk framing
  // so the headline never undersells a physical-risk change.
  const risky = typeof rule.danger === "string" && rule.danger.trim() !== "";
  let value: string;
  if (risky) {
    value = "the clearest single change to try — go gently, it has a safety limit";
  } else if (confidence === "high") {
    value = "your biggest, lowest-risk gain right now";
  } else if (confidence === "medium") {
    value = "the most promising single change to test next";
  } else {
    value = "worth a controlled test — low confidence, so verify it on track";
  }
  const gain = isFiniteNumber(rule.lap_time_impact_s)
    ? `, ~${rule.lap_time_impact_s.toFixed(1)}s/lap on the table`
    : "";
  // Capitalize the action so the sentence reads as a sentence.
  const verb = action.charAt(0).toUpperCase() + action.slice(1);
  return `${verb} — ${value} (${confidence} confidence${gain}).`;
}

/** R4-3 — headline for the non-actionable verdicts (refusal / do-nothing), so the
 *  racer still gets a one-line "what to do" at the top. Pure, non-empty, NaN-free. */
function verdictHeadline(kind: "do_nothing" | "refusal"): string {
  return kind === "do_nothing"
    ? "No grounded change clears the bar for this — keep your current setup and log another run to learn more."
    : "No grounded setup change for this one — keep your current setup; this is outside what the verified knowledge base can call.";
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
    // R4-2: when MULTIPLE distinct symptoms are reported, synthesize the combined
    // picture (esp. conflicting pairs across a corner) BEFORE the single-symptom
    // root cause — the engineer reads the whole car, not a list. Falls through to
    // the lead-tag root cause when there's only one symptom (or no synthesis).
    const synthesis = multiSymptomSynthesis(bundle.feedback.tags);
    if (synthesis) {
      parts.push(synthesis);
    } else {
      // R3-2: root-cause chain for the LEAD (first) tag — the symptom→cause clause.
      const lead = bundle.feedback.tags[0];
      const cause = rootCause(lead.symptom, lead.phase);
      if (cause) parts.push(cause);
    }
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

/**
 * R4-2 — synthesize a MULTI-symptom report into the combined chassis picture,
 * not a list. Handles the common CONFLICTING pairs explicitly (a balance problem
 * across the corner) and names which end the engineer attacks first and WHY; for
 * non-conflicting multi-symptom it summarizes the dominant theme and the
 * one-change-at-a-time discipline. Returns "" for single-symptom (the lead-tag
 * root cause covers it) or symptom sets we won't editorialise on — so the
 * diagnosis never fabricates a synthesis it can't stand behind.
 *
 * Pure + deterministic: a fixed read of the tag list, grounded in universal
 * chassis dynamics (NOT a KB citation). NaN-free (no numerics).
 */
function multiSymptomSynthesis(tags: FeedbackTag[]): string {
  // Distinct symptoms, first-seen order preserved (deterministic).
  const order: string[] = [];
  const bySymptom = new Map<string, FeedbackTag>();
  for (const t of tags) {
    if (!bySymptom.has(t.symptom)) {
      bySymptom.set(t.symptom, t);
      order.push(t.symptom);
    }
  }
  if (order.length < 2) return ""; // single distinct symptom → lead root cause

  const has = (s: string): boolean => bySymptom.has(s);

  // — CONFLICTING pairs: opposite ends of the balance, often across a corner.
  // understeer + oversteer = the classic balance problem. Prioritize the EARLIER
  // phase: you brake INTO a corner before you power OUT, so fixing entry first
  // settles the platform the exit depends on.
  if (has("understeer") && has("oversteer")) {
    const us = bySymptom.get("understeer")!;
    const os = bySymptom.get("oversteer")!;
    const entryFirst = phaseRank(us.phase) <= phaseRank(os.phase);
    const first = entryFirst ? "the understeer" : "the oversteer";
    return (
      "Understeer and oversteer together is a balance problem across the corner, not two separate faults — " +
      "the car is short on grip at one end and short on it at the other as the load moves, so chasing either alone just shifts the imbalance. " +
      `The engineer fixes ${first} first — you meet the earlier phase of the corner before the later one (you brake in before you power out), and settling that end gives the rest of the corner a stable platform to build on.`
    );
  }

  // twitchy (front over-loaded, over-rotates) + sluggish_steering (front slow to
  // load) = a steering-response balance problem: too sharp in one place, too dull
  // in another. Same entry-first logic applies.
  if (has("twitchy") && has("sluggish_steering")) {
    return (
      "Twitchy in one place and sluggish in another is a steering-response balance problem, not two faults — " +
      "the front is over-eager where it's loaded and slow where it isn't, so the fix is to even out how quickly the front builds grip, not to chase each symptom on its own. " +
      "The engineer settles corner entry first, where the steering does its first work, then re-checks the rest."
    );
  }

  // traction_roll (too much sudden lateral grip, tips the car) + no_forward_bite
  // (not enough drive grip on power) = a grip-MANAGEMENT problem: the car makes
  // more grip than it can stand up to in one place and can't use it in another.
  if (has("traction_roll") && has("no_forward_bite")) {
    return (
      "Traction-rolling AND no forward bite together is a grip-management problem: the car generates more sudden lateral grip than it can stand up to, yet can't convert grip into drive on exit. " +
      "The engineer prioritizes the traction roll first — it's the safety item (a roll ends the run), and calming how violently the car loads up usually frees the drive at the same time."
    );
  }

  // — NON-conflicting multi-symptom: summarize the dominant theme (lead symptom),
  // and hold the line on one-change-at-a-time so the racer doesn't shotgun it.
  const lead = order[0];
  return (
    `Several symptoms at once (${order.map(humanize).join(" + ")}) — the engineer treats ${humanize(lead)} as the dominant thread and fixes one lever at a time, ` +
    "so each change's effect on the whole car is legible before the next."
  );
}

/** R4-2 — phase ordering within a corner for "fix the earlier phase first".
 *  Lower = earlier in the corner. Unknown/absent phases sort last (neutral) so a
 *  tagged phase always wins the tie-break. Pure + total. */
function phaseRank(phase?: string): number {
  switch (phase) {
    case "braking":
      return 0;
    case "corner_entry":
      return 1;
    case "off_power":
      return 2;
    case "mid_corner":
      return 3;
    case "on_power":
      return 4;
    case "corner_exit":
      return 5;
    default:
      return 6;
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

/**
 * R6-2 — the secondary change's "if it doesn't help" framing. The secondary is
 * a FALLBACK, and it deliberately works a DIFFERENT lever from the primary so
 * the two STACK (address the balance from two ends) rather than FIGHT (two
 * cracks at the same lever, where the second just undoes the first). This makes
 * both facts explicit: try it only if the primary doesn't fully fix it, and why
 * it's a different lever. Pure + deterministic, grounded only in the two
 * options' own settings (universal mechanical grouping, NOT a KB citation).
 * Always a non-empty, NaN-free string.
 */
function secondaryFallbackFraming(primary: RecommendationOption, secondary: RecommendationOption): string {
  const primaryFamily = leverFamily(primary.setting);
  const secondaryFamily = leverFamily(secondary.setting);
  const differentLever = primaryFamily !== secondaryFamily;
  const leverClause = differentLever
    ? `it works a different lever (${secondaryFamily} vs ${primaryFamily}), so it stacks with the first change rather than fighting it`
    : `it comes at the same area from a different angle, so make the primary change first and judge it on its own before stacking this on top`;
  return (
    `Try this only if the primary (${humanize(primary.setting)}) doesn't fully fix it — ` +
    `${leverClause}. ` +
    `Make one change at a time so you can read each one's effect; if neither lands, revert both and the cause is likely the next-ranked option or tires for this surface.`
  );
}

/**
 * R6-2 — group a setting into its mechanical "lever family" so the secondary
 * framing can say WHY it's a different lever in plain words. A fixed, total
 * lookup over the KB's setting vocabulary; the default ("the chassis") keeps the
 * sentence grammatical for any unrecognised setting (fail-safe, never throws).
 * Pure universal mechanics — not a KB citation.
 */
function leverFamily(setting: string): string {
  if (setting.includes("diff") || setting === "clutch_spring") return "the differentials / drivetrain";
  if (setting.includes("sway_bar")) return "anti-roll stiffness";
  if (setting.includes("spring") || setting.includes("shock") || setting === "ride_height" || setting === "ride_height_rake")
    return "suspension / damping";
  if (setting.includes("camber") || setting.includes("toe") || setting === "caster" || setting === "ackermann" ||
      setting.includes("roll_center") || setting.includes("track_width") || setting === "wheelbase")
    return "geometry";
  if (setting.includes("wing")) return "aero";
  if (setting === "gearing") return "gearing";
  if (setting.includes("downstop") || setting.includes("anti_squat") || setting.includes("kickup") ||
      setting === "shock_mounting_inclination")
    return "weight-transfer geometry";
  return "the chassis";
}

function humanize(id: string): string {
  return id.replace(/_/g, " ");
}
