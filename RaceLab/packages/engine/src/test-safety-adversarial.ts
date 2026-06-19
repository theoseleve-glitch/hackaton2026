/**
 * ADVERSARIAL SAFETY TEST — RaceLab advisor engine.
 *
 * Real execution (not analysis): hammers recommend() + buildReport() (and
 * RaceEngineerChat.handle on text inputs) with a large, diverse matrix of
 * ContextBundles — every surface × grip × symptom combo × condition profile ×
 * tyre state × practice/race_day × chassis — PLUS degenerate inputs (empty
 * feedback, unknown symptom, missing weather, empty setup, conflicting
 * symptoms, out-of-taxonomy condition strings, unknown chassis template).
 *
 * For each it asserts the engine's SAFETY INVARIANTS, collecting violations
 * (never throwing on the first). Run with the repo tsx:
 *   npx tsx packages/engine/src/test-safety-adversarial.ts
 */

import { loadKBData } from "./node-kb";
import { recommend } from "./engineer";
import { buildReport, type EngineerReport } from "./report";
import { RaceEngineerChat } from "./chat";
import { settingUnknownToTemplate } from "./guard";
import { getTemplate } from "./data";
import type { ContextBundle, FeedbackTag, KBRule, Recommendation, RecommendationOption } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Setup: real KBData, exactly as eval.ts builds it.
// ─────────────────────────────────────────────────────────────────────────────
const kbData = loadKBData();
const kbIds = new Set(kbData.rules.map((r) => r.id));
const ruleById = new Map<string, KBRule>(kbData.rules.map((r) => [r.id, r]));
const TEMPLATE_IDS = Object.keys(kbData.templates); // generic-offroad, kyosho-inferno-mp11

// Opposite-direction classification per setting (no self-contradiction check).
// Directions are free-form strings in the KB; map each to a signed bucket so we
// can detect "same setting recommended in opposite directions".
const DIRECTION_SIGN: Record<string, 1 | -1> = {
  // numeric levers
  increase: 1,
  decrease: -1,
  // shock pistons
  smaller_or_fewer_holes: 1,
  larger_or_more_holes: -1,
  // shock mounting inclination
  more_inclined: 1,
  less_inclined: -1,
  // wing position
  rearward: 1,
  forward: -1,
  // gearing
  decrease_fdr_speed: 1,
  increase_fdr_speed: -1,
  // ride-height rake
  front_higher_than_rear: 1,
  front_lower_than_rear: -1,
  // ackermann
  forward_holes: 1,
  rearward_holes: -1,
  // roll center
  higher: 1,
  lower: -1,
};
function directionSign(dir: string): 1 | -1 | 0 {
  return DIRECTION_SIGN[dir] ?? 0;
}

function humanize(id: string): string {
  return id.replace(/_/g, " ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Violation collection
// ─────────────────────────────────────────────────────────────────────────────
type ViolationType =
  | "throw"
  | "missing_citation"
  | "unknown_citation"
  | "bad_string"
  | "invalid_kind"
  | "refusal_without_message"
  | "self_contradiction"
  | "setting_out_of_scope"
  | "recommended_and_do_not_touch"
  | "nondeterministic"
  | "magnitude_invariant";

interface Violation {
  type: ViolationType;
  bundleId: string;
  detail: string;
}
const violations: Violation[] = [];
function violate(type: ViolationType, bundleId: string, detail: string): void {
  violations.push({ type, bundleId, detail });
}

// ─────────────────────────────────────────────────────────────────────────────
// String scanner: catch NaN / undefined / [object Object] / empty in any
// user-facing field. Walks strings + arrays of strings on the response.
// ─────────────────────────────────────────────────────────────────────────────
const BAD_TOKENS = ["NaN", "undefined", "[object Object]", "null"];
function scanString(label: string, value: unknown, bundleId: string, allowEmpty = false): void {
  if (typeof value !== "string") {
    // only flag if it's a defined-but-wrong-typed user field
    if (value !== undefined && value !== null && !Array.isArray(value)) {
      // numbers (confidence "none", etc. are strings) — nothing to scan
    }
    return;
  }
  if (!allowEmpty && value.trim() === "") {
    violate("bad_string", bundleId, `${label}: empty/whitespace string`);
    return;
  }
  for (const tok of BAD_TOKENS) {
    // "null" appears legitimately nowhere in user text; treat as bad token too,
    // but allow the literal word inside longer prose only when it's a real word
    // boundary artifact — here the engine never emits prose containing it, so a
    // hit is a real defect.
    if (value.includes(tok)) {
      violate("bad_string", bundleId, `${label}: contains "${tok}" → ${JSON.stringify(value.slice(0, 120))}`);
    }
  }
}

function scanOption(label: string, o: RecommendationOption, bundleId: string): void {
  scanString(`${label}.setting`, o.setting, bundleId);
  scanString(`${label}.change`, o.change, bundleId);
  scanString(`${label}.mechanism`, o.mechanism, bundleId);
  scanString(`${label}.expected_effect`, o.expected_effect, bundleId);
  scanString(`${label}.confidence`, o.confidence, bundleId);
  scanString(`${label}.revert`, o.revert, bundleId);
  scanString(`${label}.if_it_does_not_help`, o.if_it_does_not_help, bundleId);
  if (o.history_note !== undefined) scanString(`${label}.history_note`, o.history_note, bundleId);
  for (const c of o.citations) scanString(`${label}.citation`, c, bundleId);
  // D1 magnitude invariant (test #2): magnitude is ALWAYS a string (possibly
  // empty), never contains NaN, and is HOISTED out of `change` — the change
  // text must no longer embed the cited rule's magnitude_guidance.
  if (typeof o.magnitude !== "string") {
    violate("magnitude_invariant", bundleId, `${label}.magnitude is not a string (${typeof o.magnitude})`);
  } else {
    // empty magnitude is legitimate (rule without magnitude_guidance); only flag bad tokens
    scanString(`${label}.magnitude`, o.magnitude, bundleId, true);
    for (const c of o.citations) {
      const rule = ruleById.get(c);
      const mg = rule?.magnitude_guidance;
      if (mg && mg.trim() !== "" && o.change.includes(mg)) {
        violate(
          "magnitude_invariant",
          bundleId,
          `${label}.change still embeds magnitude_guidance of ${c} ("${mg.slice(0, 40)}") — should be hoisted to .magnitude`,
        );
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Invariant checks on a recommend() result
// ─────────────────────────────────────────────────────────────────────────────
function checkRecommendation(bundleId: string, bundle: ContextBundle, rec: Recommendation): void {
  // valid kind
  if (!["recommendation", "do_nothing", "refusal"].includes(rec.kind)) {
    violate("invalid_kind", bundleId, `recommend kind=${String(rec.kind)}`);
  }
  // conditions_echo always present + clean
  scanString("rec.conditions_echo", rec.conditions_echo, bundleId);

  if (rec.kind === "refusal" || rec.kind === "do_nothing") {
    if (!rec.message || rec.message.trim() === "") {
      violate("refusal_without_message", bundleId, `recommend ${rec.kind} carries no message`);
    } else {
      scanString("rec.message", rec.message, bundleId);
    }
    return;
  }

  // kind === recommendation
  if (!rec.primary) {
    violate("invalid_kind", bundleId, "recommendation without a primary option");
    return;
  }
  const options: RecommendationOption[] = [rec.primary, ...(rec.alternatives ?? [])];

  // citations grounded-or-silent + scope + string hygiene
  const dirBySetting = new Map<string, Set<1 | -1>>();
  for (let i = 0; i < options.length; i++) {
    const o = options[i];
    const label = i === 0 ? "primary" : `alt[${i - 1}]`;
    scanOption(label, o, bundleId);

    if (o.citations.length === 0) {
      violate("missing_citation", bundleId, `${label} (${o.setting}) has no citation`);
    }
    for (const c of o.citations) {
      if (!kbIds.has(c)) violate("unknown_citation", bundleId, `${label} cites unknown rule ${c}`);
    }

    // setting must be within the chassis scope (template is the bounds DB)
    try {
      const template = getTemplate(kbData, bundle.chassis_template_id);
      if (settingUnknownToTemplate(o.setting, template)) {
        violate("setting_out_of_scope", bundleId, `${label} setting "${o.setting}" not on template ${bundle.chassis_template_id}`);
      }
    } catch {
      /* unknown template is reported separately by the throw check */
    }

    // collect direction sign for self-contradiction
    for (const c of o.citations) {
      const rule = ruleById.get(c);
      if (!rule) continue;
      const sign = directionSign(rule.direction);
      if (sign === 0) continue;
      if (!dirBySetting.has(rule.setting)) dirBySetting.set(rule.setting, new Set());
      dirBySetting.get(rule.setting)!.add(sign);
    }
  }

  // no self-contradiction: same setting recommended both directions
  for (const [setting, signs] of dirBySetting) {
    if (signs.has(1) && signs.has(-1)) {
      violate("self_contradiction", bundleId, `setting "${setting}" recommended in BOTH directions`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Invariant checks on a buildReport() result
// ─────────────────────────────────────────────────────────────────────────────
function checkReport(bundleId: string, bundle: ContextBundle, rep: EngineerReport): void {
  if (!["report", "do_nothing", "refusal"].includes(rep.kind)) {
    violate("invalid_kind", bundleId, `report kind=${String(rep.kind)}`);
  }
  scanString("report.conditions_echo", rep.conditions_echo, bundleId);
  scanString("report.diagnosis", rep.diagnosis, bundleId);
  scanString("report.rationale", rep.rationale, bundleId);
  if (rep.expected_behavior !== undefined) scanString("report.expected_behavior", rep.expected_behavior, bundleId);
  for (const t of rep.driving_tips) scanString("report.driving_tip", t, bundleId);
  for (const d of rep.do_not_touch) scanString("report.do_not_touch", d, bundleId);
  scanString("report.confidence", rep.confidence, bundleId);

  if (rep.kind === "refusal" || rep.kind === "do_nothing") {
    if (!rep.message || rep.message.trim() === "") {
      violate("refusal_without_message", bundleId, `report ${rep.kind} carries no message`);
    } else {
      scanString("report.message", rep.message, bundleId);
    }
    return;
  }

  // kind === report
  const options: { label: string; o: RecommendationOption }[] = [];
  if (rep.primary) options.push({ label: "primary", o: rep.primary });
  if (rep.secondary) options.push({ label: "secondary", o: rep.secondary });
  if (!rep.primary) {
    violate("invalid_kind", bundleId, "report kind=report without a primary");
  }

  const dirBySetting = new Map<string, Set<1 | -1>>();
  const recommendedSettings = new Set<string>();
  for (const { label, o } of options) {
    scanOption(label, o, bundleId);
    recommendedSettings.add(o.setting);
    if (o.citations.length === 0) violate("missing_citation", bundleId, `${label} (${o.setting}) no citation`);
    for (const c of o.citations) if (!kbIds.has(c)) violate("unknown_citation", bundleId, `${label} cites unknown ${c}`);

    try {
      const template = getTemplate(kbData, bundle.chassis_template_id);
      if (settingUnknownToTemplate(o.setting, template)) {
        violate("setting_out_of_scope", bundleId, `${label} setting "${o.setting}" not on template ${bundle.chassis_template_id}`);
      }
    } catch {
      /* throw reported separately */
    }

    for (const c of o.citations) {
      const rule = ruleById.get(c);
      if (!rule) continue;
      const sign = directionSign(rule.direction);
      if (sign === 0) continue;
      if (!dirBySetting.has(rule.setting)) dirBySetting.set(rule.setting, new Set());
      dirBySetting.get(rule.setting)!.add(sign);
    }
  }

  for (const [setting, signs] of dirBySetting) {
    if (signs.has(1) && signs.has(-1)) {
      violate("self_contradiction", bundleId, `report setting "${setting}" in BOTH directions`);
    }
  }

  // do_not_touch must not also be recommended. The report renders do_not_touch
  // entries as humanized prose: "<Setting humanized> — relevant but ranked
  // lower…". A recommended setting whose humanized form prefixes a do_not_touch
  // line would be a contradiction.
  for (const setting of recommendedSettings) {
    const human = humanize(setting);
    for (const dnt of rep.do_not_touch) {
      const dntHead = dnt.split("—")[0].trim().toLowerCase();
      if (dntHead === human.toLowerCase()) {
        violate(
          "recommended_and_do_not_touch",
          bundleId,
          `setting "${setting}" is recommended AND listed in do_not_touch ("${dnt.slice(0, 60)}")`,
        );
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Determinism: same bundle twice → byte-identical JSON.
// ─────────────────────────────────────────────────────────────────────────────
function checkDeterminism(bundleId: string, bundle: ContextBundle): void {
  let a: string, b: string;
  try {
    a = JSON.stringify(recommend(structuredClone(bundle), kbData));
    b = JSON.stringify(recommend(structuredClone(bundle), kbData));
  } catch {
    return; // throw handled elsewhere
  }
  if (a !== b) violate("nondeterministic", bundleId, "recommend() not byte-identical on repeat");

  let ra: string, rb: string;
  try {
    ra = JSON.stringify(buildReport(structuredClone(bundle), kbData));
    rb = JSON.stringify(buildReport(structuredClone(bundle), kbData));
  } catch {
    return;
  }
  if (ra !== rb) violate("nondeterministic", bundleId, "buildReport() not byte-identical on repeat");
}

// ─────────────────────────────────────────────────────────────────────────────
// One full bundle pass: recommend + report + determinism, all guarded.
// ─────────────────────────────────────────────────────────────────────────────
let bundlesTested = 0;
function runBundle(bundleId: string, bundle: ContextBundle): void {
  bundlesTested++;
  let rec: Recommendation | undefined;
  try {
    rec = recommend(structuredClone(bundle), kbData);
  } catch (err) {
    violate("throw", bundleId, `recommend() threw: ${(err as Error).message}`);
  }
  if (rec) checkRecommendation(bundleId, bundle, rec);

  let rep: EngineerReport | undefined;
  try {
    rep = buildReport(structuredClone(bundle), kbData);
  } catch (err) {
    violate("throw", bundleId, `buildReport() threw: ${(err as Error).message}`);
  }
  if (rep) checkReport(bundleId, bundle, rep);

  checkDeterminism(bundleId, bundle);
}

// ─────────────────────────────────────────────────────────────────────────────
// Matrix generation
// ─────────────────────────────────────────────────────────────────────────────
const SURFACES = ["clay", "astroturf", "carpet", "dirt", "loamy", "hard-packed"];
const GRIPS: ContextBundle["track"]["grip"][] = ["green", "medium", "high", "blue_groove"];
const CONDITION_PROFILES: { name: string; conditions: string[] }[] = [
  { name: "hot", conditions: ["hot", "high_grip", "smooth"] },
  { name: "cold", conditions: ["cold", "low_grip"] },
  { name: "wet", conditions: ["wet", "low_grip"] },
  { name: "dusty", conditions: ["dusty", "low_grip"] },
  { name: "bumpy", conditions: ["bumpy", "rough"] },
  { name: "bluegroove", conditions: ["blue_groove", "high_grip", "smooth"] },
  { name: "fastopen", conditions: ["fast_open", "big_jumps"] },
  { name: "techtight", conditions: ["technical_tight"] },
  { name: "none", conditions: [] },
];
const TYRE_STATES: (ContextBundle["tyres"])[] = [
  undefined,
  { wear: "new", run_count: 0 },
  { wear: "light", run_count: 2 },
  { wear: "medium", run_count: 5 },
  { wear: "worn", run_count: 12 },
];
const MODES: ContextBundle["mode"][] = ["practice", "race_day"];
const EVOLUTIONS: (ContextBundle["track"]["evolution"])[] = [undefined, "improving", "stable", "degrading"];

// Symptom combos (in-taxonomy), single + multi + with phases.
const SYMPTOM_COMBOS: { name: string; tags: FeedbackTag[] }[] = [
  { name: "understeer-mid", tags: [{ symptom: "understeer", phase: "mid_corner" }] },
  { name: "understeer-entry", tags: [{ symptom: "understeer", phase: "corner_entry" }] },
  { name: "oversteer-power", tags: [{ symptom: "oversteer", phase: "on_power" }] },
  { name: "oversteer-exit", tags: [{ symptom: "oversteer", phase: "corner_exit" }] },
  { name: "bouncy-rough", tags: [{ symptom: "bouncy", phase: "rough_section" }] },
  { name: "bottoming-jumps", tags: [{ symptom: "bottoming", phase: "jumps" }] },
  { name: "traction_roll-mid", tags: [{ symptom: "traction_roll", phase: "mid_corner" }] },
  { name: "unstable_braking", tags: [{ symptom: "unstable_braking", phase: "braking" }] },
  { name: "no_forward_bite-exit", tags: [{ symptom: "no_forward_bite", phase: "corner_exit" }] },
  { name: "sluggish_steering", tags: [{ symptom: "sluggish_steering", phase: "corner_entry" }] },
  { name: "twitchy-highspeed", tags: [{ symptom: "twitchy", phase: "high_speed" }] },
  { name: "nosedive-jumps", tags: [{ symptom: "nosedive_jumps", phase: "jumps" }] },
  { name: "poor_bump-rough", tags: [{ symptom: "poor_bump_handling", phase: "rough_section" }] },
  { name: "hard_to_drive", tags: [{ symptom: "hard_to_drive" }] },
  // no-phase variants
  { name: "understeer-nophase", tags: [{ symptom: "understeer" }] },
  { name: "oversteer-nophase", tags: [{ symptom: "oversteer" }] },
  // multi-symptom (independent)
  { name: "multi-understeer+bumpy", tags: [{ symptom: "understeer", phase: "mid_corner" }, { symptom: "poor_bump_handling", phase: "rough_section" }] },
  { name: "multi-nfb+oversteer", tags: [{ symptom: "no_forward_bite", phase: "corner_exit" }, { symptom: "oversteer", phase: "on_power" }] },
  // CONFLICTING symptoms (push AND loose at once — adversarial)
  { name: "conflict-under+oversteer", tags: [{ symptom: "understeer", phase: "mid_corner" }, { symptom: "oversteer", phase: "mid_corner" }] },
  { name: "conflict-roll+nfb", tags: [{ symptom: "traction_roll", phase: "mid_corner" }, { symptom: "no_forward_bite", phase: "corner_exit" }] },
  { name: "conflict-twitchy+sluggish", tags: [{ symptom: "twitchy", phase: "high_speed" }, { symptom: "sluggish_steering", phase: "corner_entry" }] },
];

const SAMPLE_SETUP: Record<string, string | number> = {
  front_diff_oil: 8000,
  center_diff_oil: 5000,
  rear_diff_oil: 3000,
  front_sway_bar: 2.3,
  rear_sway_bar: 2.8,
  rear_toe: 3,
  front_camber: -1,
  rear_camber: -2,
  front_shock_oil: 450,
  rear_shock_oil: 400,
};

function baseTrack(surface: string, grip: ContextBundle["track"]["grip"], conditions: string[], evolution: ContextBundle["track"]["evolution"]): ContextBundle["track"] {
  return {
    name: `Track-${surface}`,
    surface,
    grip,
    conditions: [...conditions],
    ...(evolution ? { evolution } : {}),
  };
}

// Full combinatorial matrix would be huge; sample the diverse axes densely but
// pseudo-randomly-deterministically to keep runtime bounded while covering
// every value of every axis many times.
let seed = 1234567;
function rnd(): number {
  // deterministic LCG — test stays reproducible
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}

// 1) Dense structured sweep over the primary axes (symptom × grip × condition ×
//    mode × template), with sampled surface/tyre/evolution/weather.
for (const combo of SYMPTOM_COMBOS) {
  for (const grip of GRIPS) {
    for (const profile of CONDITION_PROFILES) {
      for (const mode of MODES) {
        for (const templateId of TEMPLATE_IDS) {
          const surface = pick(SURFACES);
          const tyres = pick(TYRE_STATES);
          const evolution = pick(EVOLUTIONS);
          // sample weather presence: hot/cold profiles get matching temps,
          // others sometimes omit weather entirely (missing-weather coverage)
          let weather: ContextBundle["weather"] | undefined;
          if (profile.name === "hot") weather = { air_temp_c: 34, humidity_pct: 60, rain_risk_pct: 0 };
          else if (profile.name === "cold") weather = { air_temp_c: 6, humidity_pct: 50 };
          else if (profile.name === "wet") weather = { air_temp_c: 12, rain_risk_pct: 80, humidity_pct: 95 };
          else if (rnd() < 0.5) weather = { air_temp_c: Math.round(rnd() * 40) };
          else weather = undefined; // missing weather

          const bundle: ContextBundle = {
            chassis_template_id: templateId,
            setup: { ...SAMPLE_SETUP },
            track: baseTrack(surface, grip, profile.conditions, evolution),
            ...(weather ? { weather } : {}),
            ...(tyres ? { tyres } : {}),
            feedback: { tags: combo.tags.map((t) => ({ ...t })), text: combo.name.replace(/-/g, " ") },
            mode,
          };
          runBundle(`sweep:${combo.name}|${grip}|${profile.name}|${mode}|${templateId}`, bundle);
        }
      }
    }
  }
}

// 2) DEGENERATE / adversarial inputs — must yield a SAFE response, never crash.
const degenerates: { id: string; bundle: ContextBundle }[] = [];

// empty feedback (no tags, no text)
degenerates.push({
  id: "deg:empty-feedback",
  bundle: {
    chassis_template_id: "kyosho-inferno-mp11",
    setup: { ...SAMPLE_SETUP },
    track: baseTrack("clay", "medium", ["low_grip"], undefined),
    feedback: { tags: [] },
    mode: "practice",
  },
});

// empty feedback + empty setup + missing weather + no conditions
degenerates.push({
  id: "deg:everything-empty",
  bundle: {
    chassis_template_id: "generic-offroad",
    setup: {},
    track: { name: "", surface: "", grip: "medium", conditions: [] },
    feedback: { tags: [] },
    mode: "practice",
  },
});

// unknown symptom (out of taxonomy)
degenerates.push({
  id: "deg:unknown-symptom",
  bundle: {
    chassis_template_id: "kyosho-inferno-mp11",
    setup: { ...SAMPLE_SETUP },
    track: baseTrack("clay", "high", ["high_grip"], undefined),
    feedback: { tags: [{ symptom: "car_feels_evil_today", phase: "the_void" }] as unknown as FeedbackTag[] },
    mode: "practice",
  },
});

// out-of-taxonomy condition strings
degenerates.push({
  id: "deg:garbage-conditions",
  bundle: {
    chassis_template_id: "kyosho-inferno-mp11",
    setup: { ...SAMPLE_SETUP },
    track: { name: "X", surface: "moon-dust", grip: "blue_groove", conditions: ["zero_gravity", "🌧", "", "LOW_GRIP", "low_grip"] },
    feedback: { tags: [{ symptom: "understeer", phase: "mid_corner" }] },
    mode: "race_day",
  },
});

// conflicting symptoms, race_day, worn tyres, degrading track
degenerates.push({
  id: "deg:conflict-raceday",
  bundle: {
    chassis_template_id: "kyosho-inferno-mp11",
    setup: { ...SAMPLE_SETUP },
    track: { name: "Y", surface: "clay", grip: "green", conditions: ["low_grip", "dusty"], evolution: "degrading" },
    tyres: { wear: "worn", run_count: 20 },
    feedback: { tags: [{ symptom: "understeer", phase: "mid_corner" }, { symptom: "oversteer", phase: "mid_corner" }], text: "it pushes then snaps" },
    mode: "race_day",
  },
});

// engine-scope question embedded in feedback text (must REFUSE)
for (const kw of ["needle", "glow plug", "carb mixture lean", "engine temp too high"]) {
  degenerates.push({
    id: `deg:engine-scope:${kw}`,
    bundle: {
      chassis_template_id: "kyosho-inferno-mp11",
      setup: { ...SAMPLE_SETUP },
      track: baseTrack("clay", "medium", ["low_grip"], undefined),
      feedback: { tags: [], text: `my ${kw} is acting up, what do I do` },
      mode: "practice",
    },
  });
}

// NaN / weird numeric setup values + weird weather
degenerates.push({
  id: "deg:nan-setup",
  bundle: {
    chassis_template_id: "kyosho-inferno-mp11",
    setup: { front_shock_oil: NaN, rear_shock_oil: Infinity, front_camber: -1 } as Record<string, number>,
    track: baseTrack("clay", "medium", ["low_grip"], undefined),
    weather: { air_temp_c: NaN, rain_risk_pct: NaN },
    feedback: { tags: [{ symptom: "understeer", phase: "mid_corner" }] },
    mode: "practice",
  },
});

// UNKNOWN chassis template — degenerate input the engine must handle safely.
degenerates.push({
  id: "deg:unknown-template",
  bundle: {
    chassis_template_id: "totally-made-up-chassis-9000",
    setup: { ...SAMPLE_SETUP },
    track: baseTrack("clay", "medium", ["low_grip"], undefined),
    feedback: { tags: [{ symptom: "understeer", phase: "mid_corner" }] },
    mode: "practice",
  },
});

// empty-string text only
degenerates.push({
  id: "deg:whitespace-text",
  bundle: {
    chassis_template_id: "generic-offroad",
    setup: { ...SAMPLE_SETUP },
    track: baseTrack("dirt", "medium", [], undefined),
    feedback: { tags: [], text: "   " },
    mode: "race_day",
  },
});

// huge history (learning loop) with mixed outcomes & unknown citations
degenerates.push({
  id: "deg:history-spam",
  bundle: {
    chassis_template_id: "kyosho-inferno-mp11",
    setup: { ...SAMPLE_SETUP },
    track: { track_id: "trk-1", name: "Z", surface: "clay", grip: "medium", conditions: ["low_grip"] },
    feedback: { tags: [{ symptom: "understeer", phase: "mid_corner" }] },
    mode: "practice",
    history: [
      { change: "front_sway_bar: softer", conditions: "low grip", outcome: "worse", citations: ["kb-swaybar-front-softer-301"], track_id: "trk-1" },
      { change: "rear_diff_oil: thinner", conditions: "low grip", outcome: "better", citations: ["kb-diff-rear-thinner-005"], track_id: "trk-1" },
      { change: "bogus", conditions: "x", outcome: "better", citations: ["kb-does-not-exist-999"], track_id: "trk-1" },
      { change: "no-cite", conditions: "x", outcome: "worse" },
    ],
  },
});

for (const d of degenerates) {
  runBundle(d.id, d.bundle);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) RaceEngineerChat.handle — drive a few dialogues with diverse text inputs.
//    Assert no throw + every emitted line is a clean, non-empty string.
// ─────────────────────────────────────────────────────────────────────────────
const CHAT_SCRIPTS: { id: string; mode: ContextBundle["mode"]; inputs: string[] }[] = [
  { id: "chat:push-mid", mode: "practice", inputs: ["it pushes mid corner", "mid corner", "worse", "same", "better"] },
  { id: "chat:loose-power", mode: "practice", inputs: ["loose on power out of the infield", "on power", "better"] },
  { id: "chat:engine-needle", mode: "practice", inputs: ["my needle is too lean and the engine temp is high"] },
  { id: "chat:gibberish", mode: "practice", inputs: ["asdkjfh qwoiuer", "", "   ", "?", "help"] },
  { id: "chat:raceday-switch", mode: "practice", inputs: ["race day", "car bottoms out on the big jumps", "jumps", "worse"] },
  { id: "chat:bumps", mode: "practice", inputs: ["bounces through the braking bumps", "bumps", "same", "next"] },
  { id: "chat:newproblem-midloop", mode: "practice", inputs: ["it pushes everywhere", "everywhere", "now it's loose on power", "on power", "better"] },
];

for (const script of CHAT_SCRIPTS) {
  const chatBundle: ContextBundle = {
    chassis_template_id: "kyosho-inferno-mp11",
    setup: { ...SAMPLE_SETUP },
    setup_version_id: "v1",
    track: baseTrack("clay", "medium", ["low_grip", "dusty"], undefined),
    feedback: { tags: [] },
    mode: script.mode,
  };
  bundlesTested++;
  try {
    const chat = new RaceEngineerChat(structuredClone(chatBundle), kbData);
    const greeting = chat.greeting();
    for (const line of greeting) scanString(`${script.id}.greeting`, line, script.id);
    for (const input of script.inputs) {
      const out = chat.handle(input);
      if (!Array.isArray(out)) {
        violate("bad_string", script.id, `handle(${JSON.stringify(input)}) returned non-array`);
        continue;
      }
      if (out.length === 0) {
        violate("bad_string", script.id, `handle(${JSON.stringify(input)}) returned empty array`);
      }
      for (const line of out) {
        // chat lines may legitimately be short; only flag bad tokens + empties
        scanString(`${script.id}.handle(${JSON.stringify(input)})`, line, script.id);
      }
    }
  } catch (err) {
    violate("throw", script.id, `RaceEngineerChat threw: ${(err as Error).message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
const byType = new Map<ViolationType, Violation[]>();
for (const v of violations) {
  if (!byType.has(v.type)) byType.set(v.type, []);
  byType.get(v.type)!.push(v);
}

const ALL_TYPES: ViolationType[] = [
  "throw",
  "missing_citation",
  "unknown_citation",
  "bad_string",
  "invalid_kind",
  "refusal_without_message",
  "self_contradiction",
  "setting_out_of_scope",
  "recommended_and_do_not_touch",
  "nondeterministic",
  "magnitude_invariant",
];

console.log("\n══════════════════════════════════════════════════════════════════");
console.log("  RaceLab ADVERSARIAL SAFETY TEST");
console.log("══════════════════════════════════════════════════════════════════");
console.log(`KB: ${kbData.rules.length} rules, ${TEMPLATE_IDS.length} templates [${TEMPLATE_IDS.join(", ")}]`);
console.log(`Inputs tested: ${bundlesTested} (recommend + buildReport each; + ${CHAT_SCRIPTS.length} chat dialogues)`);
console.log(`Total violations: ${violations.length}`);
console.log("------------------------------------------------------------------");
console.log("Invariant results:");
const INVARIANT_LABELS: Record<ViolationType, string> = {
  throw: "No throw/crash on any input",
  missing_citation: "Every change has >=1 citation (grounded-or-silent)",
  unknown_citation: "All citations resolve to a known KB rule",
  bad_string: "No NaN/undefined/[object Object]/empty in user-facing fields",
  invalid_kind: "Report/recommendation kind always valid (+primary present)",
  refusal_without_message: "Refusal/do-nothing always carries a message",
  self_contradiction: "Never same setting in opposite directions",
  setting_out_of_scope: "Recommended setting within chassis scope",
  recommended_and_do_not_touch: "do_not_touch never overlaps a recommendation",
  nondeterministic: "Determinism: same bundle twice → byte-identical JSON",
  magnitude_invariant: "magnitude is a string, NaN-free, hoisted out of change",
};
for (const t of ALL_TYPES) {
  const n = byType.get(t)?.length ?? 0;
  const mark = n === 0 ? "PASS" : "FAIL";
  console.log(`  [${mark}] ${INVARIANT_LABELS[t]}  ${n === 0 ? "" : `— ${n} violation(s)`}`);
}

if (violations.length > 0) {
  console.log("------------------------------------------------------------------");
  console.log("Violation details (up to 5 examples per type):");
  for (const t of ALL_TYPES) {
    const list = byType.get(t);
    if (!list || list.length === 0) continue;
    console.log(`\n  ${t} (${list.length} total):`);
    for (const v of list.slice(0, 5)) {
      console.log(`    • [${v.bundleId}] ${v.detail}`);
    }
  }

  // setting_out_of_scope is per-template — surface the breakdown so the cause
  // is unambiguous (template field-vocabulary desync, not a per-input bug).
  const scopeViols = byType.get("setting_out_of_scope") ?? [];
  if (scopeViols.length > 0) {
    const perTemplate = new Map<string, Set<string>>();
    for (const v of scopeViols) {
      const tMatch = v.detail.match(/not on template (\S+)/);
      const sMatch = v.detail.match(/setting "([^"]+)"/);
      if (!tMatch || !sMatch) continue;
      if (!perTemplate.has(tMatch[1])) perTemplate.set(tMatch[1], new Set());
      perTemplate.get(tMatch[1])!.add(sMatch[1]);
    }
    console.log("\n  setting_out_of_scope — distinct settings flagged per template:");
    for (const [tid, set] of perTemplate) {
      console.log(`    ${tid}: ${set.size} distinct settings → ${[...set].sort().join(", ")}`);
    }
  }
}

console.log("\n══════════════════════════════════════════════════════════════════");
if (violations.length === 0) {
  console.log(`  RESULT: ALL INVARIANTS HELD across ${bundlesTested} inputs. No violations.`);
} else {
  console.log(`  RESULT: ${violations.length} violation(s) across ${bundlesTested} inputs — see above.`);
}
console.log("══════════════════════════════════════════════════════════════════\n");

process.exitCode = violations.length === 0 ? 0 : 1;
