import { loadKBData } from "./node-kb";
import { proposePlan, MAX_PLAN_CHANGES } from "./plan";
import { confidenceDetail, ruleToOption } from "./offline";
import { historyForRule, historyTier, historyNote } from "./history";
import type { ContextBundle, HistoryEntry, KBRule } from "./types";

/** proposePlan + history re-ranking unit tests (D18: pure functions, no API). */

const data = loadKBData();

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`✓ ${label}`);
  } else {
    failures++;
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function pushBundle(history?: ContextBundle["history"], trackId = "trk-here"): ContextBundle {
  return {
    chassis_template_id: "kyosho-inferno-mp11",
    setup: { front_diff_oil: 8000, rear_diff_oil: 3000, front_sway_bar: 2.3 },
    track: {
      track_id: trackId,
      name: "Club Track",
      surface: "clay",
      grip: "green",
      conditions: ["low_grip", "dusty"],
    },
    feedback: { tags: [{ symptom: "understeer", phase: "mid_corner" }] },
    mode: "practice",
    ...(history !== undefined ? { history } : {}),
  };
}

// ── Plan shape ────────────────────────────────────────────────────────────────
{
  const plan = proposePlan(pushBundle(), data);
  check("kind is plan when KB grounds changes", plan.kind === "plan");
  check(
    `plan caps at ${MAX_PLAN_CHANGES} changes`,
    plan.changes.length >= 2 && plan.changes.length <= MAX_PLAN_CHANGES,
    `got ${plan.changes.length}`,
  );
  check(
    "positions are 1-based and sequential",
    plan.changes.every((c, i) => c.position === i + 1),
  );
  const settings = plan.changes.map((c) => c.option.setting);
  check("distinct settings (one lever per change)", new Set(settings).size === settings.length);
  check(
    "every change is cited (grounded or silent)",
    plan.changes.every((c) => c.option.citations.length > 0),
  );
  check(
    "every change has a deterministic rationale",
    plan.changes.every((c) => /^Ranked #\d+ — addresses /.test(c.rationale)),
  );
  check("conditions echo present", plan.conditions_echo.includes("green grip clay"));
  const again = proposePlan(pushBundle(), data);
  check("deterministic: same input → identical plan", JSON.stringify(plan) === JSON.stringify(again));
}

// ── Degenerate single-change plan ─────────────────────────────────────────────
{
  const bundle = pushBundle();
  bundle.feedback = { tags: [{ symptom: "nosedive_jumps", phase: "jumps" }] };
  const plan = proposePlan(bundle, data);
  check("single-rule symptom → 1-change plan", plan.kind === "plan" && plan.changes.length === 1);
}

// ── Refusals ──────────────────────────────────────────────────────────────────
{
  const bundle = pushBundle();
  bundle.feedback = { tags: [] };
  const plan = proposePlan(bundle, data);
  check("no symptom → refusal, zero changes", plan.kind === "refusal" && plan.changes.length === 0);
  check("refusal carries an honest message", typeof plan.message === "string" && plan.message!.length > 10);

  const rd = pushBundle();
  rd.feedback = { tags: [] };
  rd.mode = "race_day";
  const planRd = proposePlan(rd, data);
  check("race day + nothing grounded → do_nothing", planRd.kind === "do_nothing" && planRd.changes.length === 0);

  const unknown = pushBundle();
  unknown.chassis_template_id = "not-a-template";
  const planU = proposePlan(unknown, data);
  check(
    "unknown template → in-band refusal, never a throw",
    planU.kind === "refusal" && (planU.message ?? "").includes("not-a-template"),
  );
}

// ── Race-day plans only contain race-day-safe changes ─────────────────────────
{
  const bundle = pushBundle();
  bundle.mode = "race_day";
  const plan = proposePlan(bundle, data);
  check(
    "race-day plan changes are all high-confidence",
    plan.kind === "plan" && plan.changes.every((c) => c.option.confidence === "high"),
  );
}

// ── History read half: demotion / promotion / isolation / caps ────────────────
const WORSE_301 = {
  change: "front_track_width: narrower",
  conditions: "grip green, dusty",
  outcome: "worse" as const,
  citations: ["kb-trackwidth-front-narrower-212"],
  track_id: "trk-here",
};
{
  const clean = proposePlan(pushBundle(), data);
  check(
    "baseline: track-width rule ranks #1 without history",
    clean.changes[0].option.citations.includes("kb-trackwidth-front-narrower-212"),
  );

  const demoted = proposePlan(pushBundle([WORSE_301]), data);
  check(
    "past 'worse' here demotes the rule below every clean rule",
    demoted.kind === "plan" &&
      !demoted.changes.some((c) => c.option.citations.includes("kb-trackwidth-front-narrower-212")),
    JSON.stringify(demoted.changes.map((c) => c.option.citations)),
  );
  check(
    "demotion never empties a grounded plan",
    demoted.changes.length === clean.changes.length,
  );

  const promoted = proposePlan(
    pushBundle([{ ...WORSE_301, outcome: "better", citations: ["kb-diff-rear-thinner-005"] }]),
    data,
  );
  check(
    "past 'better' here promotes the rule to #1",
    promoted.changes[0].option.citations.includes("kb-diff-rear-thinner-005"),
  );
  check(
    "promoted change carries the deterministic history note",
    promoted.changes[0].option.history_note === "Rated better here last time — ranked up.",
    promoted.changes[0].option.history_note,
  );

  const otherTrack = proposePlan(pushBundle([{ ...WORSE_301, track_id: "trk-other" }]), data);
  check(
    "history from a DIFFERENT track does not bleed in",
    otherTrack.changes[0].option.citations.includes("kb-trackwidth-front-narrower-212"),
  );

  // grounded-first cap: 'better' history can never promote a rule whose
  // symptom/conditions don't match (the clutch rule does not address understeer)
  const capped = proposePlan(
    pushBundle([{ ...WORSE_301, outcome: "better", citations: ["kb-clutch-springs-softer-009"] }]),
    data,
  );
  check(
    "history NEVER promotes a rule the KB doesn't ground for this symptom",
    !capped.changes.some((c) => c.option.citations.includes("kb-clutch-springs-softer-009")),
  );

  // rows with a track_id are ignorable when the bundle has none (can't attribute)
  const noBundleTrack = pushBundle([WORSE_301]);
  delete noBundleTrack.track.track_id;
  const unattributed = proposePlan(noBundleTrack, data);
  check(
    "track-stamped rows are ignored when the bundle track is unidentified",
    unattributed.changes[0].option.citations.includes("kb-trackwidth-front-narrower-212"),
  );

  // legacy rows (schema ContextHistoryEntry shape: no citations) have no effect
  const legacy = proposePlan(
    pushBundle([{ change: "front_track_width: narrower", conditions: "grip green", outcome: "worse" }]),
    data,
  );
  check(
    "rows without citations never influence ranking (no rule id, no attribution)",
    legacy.changes[0].option.citations.includes("kb-trackwidth-front-narrower-212"),
  );

  // mixed history → neutral tier, informational note
  const mixed = proposePlan(
    pushBundle([WORSE_301, { ...WORSE_301, outcome: "better" }]),
    data,
  );
  check(
    "mixed better/worse → neutral tier (rule keeps its clean rank)",
    mixed.changes[0].option.citations.includes("kb-trackwidth-front-narrower-212"),
  );
  check(
    "mixed history carries the tally note",
    mixed.changes[0].option.history_note === "Tried here before: 1 better / 0 same / 1 worse.",
    mixed.changes[0].option.history_note,
  );
}

// ── condition-segmented learning (D40-arc): a change rated better-when-hot /
//    worse-when-cold contributes the RIGHT signal for the current forecast
//    instead of cancelling to a null tier ───────────────────────────────────
{
  const R = "kb-test-rule";
  const betterHot: HistoryEntry = { change: "x: y", conditions: "hot", outcome: "better", citations: [R], track_id: "T", condition_tags: ["high_grip", "hot"] };
  const worseCold: HistoryEntry = { change: "x: y", conditions: "cold", outcome: "worse", citations: [R], track_id: "T", condition_tags: ["low_grip", "cold"] };
  const hist = (conditions: string[], air?: number, rows: HistoryEntry[] = [betterHot, worseCold]): ContextBundle => ({
    chassis_template_id: "x",
    setup: {},
    track: { track_id: "T", name: "t", surface: "clay", grip: "medium", conditions },
    ...(air !== undefined ? { weather: { air_temp_c: air } } : {}),
    feedback: { tags: [] },
    mode: "practice",
    history: rows,
  });

  const uW: HistoryEntry = { change: "x: y", conditions: "", outcome: "worse", citations: [R], track_id: "T" };

  // betterHot matches a hot forecast; worseCold conflicts → excluded → tier +1
  const hHot = historyForRule(R, hist(["high_grip"], 34));
  check("condition-seg: HOT forecast matches the hot-better row → tier +1 (cold-worse excluded)", historyTier(hHot) === 1 && hHot?.matched_net === 1 && hHot?.net === 0);
  check(
    "condition-seg: HOT note is condition-scoped",
    historyNote(hHot!) === "Rated better here in similar conditions last time — ranked up.",
    historyNote(hHot!),
  );

  const hCold = historyForRule(R, hist(["low_grip"], 4));
  check("condition-seg: COLD forecast matches the cold-worse row → tier -1 (hot-better excluded)", historyTier(hCold) === -1 && hCold?.matched_net === -1);
  check(
    "condition-seg: COLD note is condition-scoped (worse)",
    historyNote(hCold!) === "Rated worse here in similar conditions last time — ranked below untested options.",
    historyNote(hCold!),
  );

  // THE ship-blocker the review caught: only OPPOSITE-condition history → no usable
  // signal. Must be null/tier-0, NOT leak the conflicting net back through the fallback.
  const allConflict = historyForRule(R, hist(["low_grip"], 4, [betterHot]));
  check("condition-seg: only opposite-condition history → null, tier 0 (no conflicting leak)", allConflict === null && historyTier(allConflict) === 0);

  // conflicting 'better' + untagged 'worse' → the conflicting row never feeds the
  // fallback; the untagged worse drives it, and the note is honestly 'worse'.
  const mixed = historyForRule(R, hist(["low_grip"], 4, [betterHot, { ...uW }]));
  check("condition-seg: a conflicting 'better' never leaks into the untagged fallback", historyTier(mixed) === -1 && mixed?.matched_count === 0 && mixed?.net === -1);
  check("condition-seg: note is the honest untagged fallback, not a false 'better'", historyNote(mixed!) === "Rated worse here last time — ranked below untested options.");

  // documented + tested decision: a same-condition signal outranks untagged rows
  // (more relevant), bounded by the ±1 cap — 1 matched-better beats 3 untagged-worse.
  const outnumbered = historyForRule(R, hist(["high_grip"], 34, [betterHot, { ...uW }, { ...uW }, { ...uW }]));
  check("condition-seg: same-condition signal outranks untagged rows (±1-bounded)", historyTier(outnumbered) === 1 && outnumbered?.matched_net === 1 && outnumbered?.net === -3);

  // track-temp asymmetry fix: a hot-by-track-temp bundle (mild air) still matches a hot row
  const trackHot: ContextBundle = { ...hist(["high_grip"], 22, [betterHot, worseCold]), weather: { air_temp_c: 22, track_temp_c: 46 } };
  check("condition-seg: hot-by-track-temp bundle matches the hot row (mirrors conditionsToTags)", historyTier(historyForRule(R, trackHot)) === 1);

  // wet/blue_groove are significant; minor-tag-only rows never split the signal
  const betterWet: HistoryEntry = { change: "x: y", conditions: "wet", outcome: "better", citations: [R], track_id: "T", condition_tags: ["wet"] };
  check("condition-seg: 'wet' is a significant condition (segments on rain)", historyTier(historyForRule(R, hist(["wet"], undefined, [betterWet, { ...worseCold, condition_tags: ["high_grip"] }]))) === 1);
  const minorOnly: HistoryEntry = { change: "x: y", conditions: "dusty", outcome: "worse", citations: [R], track_id: "T", condition_tags: ["dusty", "bumpy"] };
  check("condition-seg: minor-tag-only row matches generically (never splits the signal)", historyForRule(R, hist(["high_grip"], 34, [minorOnly]))?.matched_count === 1);

  // A condition-NEUTRAL day (no significant tag) must NOT let a condition-specific
  // row drive ranking or claim "in similar conditions": the hot/cold rows are a
  // DIFFERENT context, excluded entirely → no signal (tier 0), not a generic match.
  const hNeutral = historyForRule(R, hist([], undefined));
  check("condition-seg: neutral day → condition-specific rows excluded → no signal, tier 0", hNeutral === null && historyTier(hNeutral) === 0);
  // finding-10 guard: full weather present but neutral (20C, neither hot nor cold) +
  // a hot-tagged 'better' row must NOT bleed in (was promoting to primary + falsely
  // claiming 'in similar conditions').
  const hNeutralWeather = historyForRule(R, hist([], 20, [betterHot]));
  check("condition-seg: hot 'better' row on a neutral 20C day → excluded (no cross-condition bleed)", hNeutralWeather === null);

  // backward compat: all-untagged history → all-rows fallback, identical to legacy
  const hLegacy = historyForRule(R, hist(["high_grip"], 34, [{ ...uW }, { ...uW }]));
  check("condition-seg: all-untagged rows → all-rows fallback (legacy behavior unchanged)", hLegacy?.matched_count === 0 && historyTier(hLegacy) === -1);
}

// ── LEARNING-TRAJECTORY: the ±1 cap holds across a streak, tracks stay isolated,
//    condition-segmentation picks the right signal per forecast, and a
//    conflicting-only streak never leaks ──────────────────────────────────────
{
  const RULE = "kb-trackwidth-front-narrower-212";
  const baseTags = (outcome: "better" | "worse"): HistoryEntry => ({
    change: "front_track_width: narrower",
    conditions: "grip green, dusty",
    outcome,
    citations: [RULE],
    track_id: "trk-here",
  });

  // (c1) a long 'better' streak still caps at tier +1 — a hot streak can never
  // outrank the KB's own ordering by more than one tier.
  const betterStreak = Array.from({ length: 6 }, () => baseTags("better"));
  const hBetter = historyForRule(RULE, pushBundle(betterStreak));
  check("trajectory: 6x 'better' here → net 6 but tier capped at +1 (±1 bound holds across a streak)", historyTier(hBetter) === 1 && hBetter?.net === 6);

  // (c2) a long 'worse' streak caps at tier -1 (symmetric).
  const worseStreak = Array.from({ length: 6 }, () => baseTags("worse"));
  const hWorse = historyForRule(RULE, pushBundle(worseStreak));
  check("trajectory: 6x 'worse' here → net -6 but tier floored at -1 (±1 bound holds across a streak)", historyTier(hWorse) === -1 && hWorse?.net === -6);

  // (c3) and the cap survives the full proposePlan path, not just the tier math:
  // a 'better' streak promotes the rule to #1 but never duplicates or empties.
  const promotedStreak = proposePlan(
    pushBundle(Array.from({ length: 6 }, () => ({ ...baseTags("better"), citations: ["kb-diff-rear-thinner-005"] }))),
    data,
  );
  check(
    "trajectory: a 'better' streak promotes to #1 through proposePlan (bounded, still grounded)",
    promotedStreak.kind === "plan" && promotedStreak.changes[0].option.citations.includes("kb-diff-rear-thinner-005"),
  );
  const clean = proposePlan(pushBundle(), data);
  check("trajectory: a streak never changes the plan LENGTH (no duplicate/empty)", promotedStreak.changes.length === clean.changes.length);
  check(
    "trajectory: every change in a re-ranked streak plan stays cited (grounded or silent)",
    promotedStreak.changes.every((c) => c.option.citations.length > 0),
  );

  // (c4) TRACK ISOLATION across a streak: a 6-row 'worse' streak at ANOTHER
  // track, mixed with the current track, never bleeds — only this-track rows
  // count. Here all rows are other-track → no usable signal at all.
  const otherTrackStreak = Array.from({ length: 6 }, () => ({ ...baseTags("worse"), track_id: "trk-other" }));
  const hOther = historyForRule(RULE, pushBundle(otherTrackStreak));
  check("trajectory: a 'worse' streak from ANOTHER track never bleeds in → null history", hOther === null && historyTier(hOther) === 0);
  const isolated = proposePlan(pushBundle(otherTrackStreak), data);
  check(
    "trajectory: other-track streak leaves THIS track's ranking untouched (track-width still #1)",
    isolated.changes[0].option.citations.includes(RULE),
  );

  // (c5) CONDITION-SEGMENTATION picks the right signal per forecast across a
  // trajectory: the SAME rule rated better-when-hot and worse-when-cold yields
  // +1 under a hot forecast and -1 under a cold forecast (no cancellation).
  const segRows: HistoryEntry[] = [
    { change: "x: y", conditions: "hot", outcome: "better", citations: [RULE], track_id: "trk-here", condition_tags: ["hot"] },
    { change: "x: y", conditions: "cold", outcome: "worse", citations: [RULE], track_id: "trk-here", condition_tags: ["cold"] },
  ];
  const segBundle = (air: number): ContextBundle => ({
    ...pushBundle(segRows),
    weather: { air_temp_c: air },
  });
  check("trajectory: same rule, HOT forecast → matches the hot-better row → tier +1", historyTier(historyForRule(RULE, segBundle(34))) === 1);
  check("trajectory: same rule, COLD forecast → matches the cold-worse row → tier -1", historyTier(historyForRule(RULE, segBundle(4))) === -1);

  // (c6) CONFLICTING-ONLY streak → null: a streak of only opposite-condition
  // outcomes (all 'cold' rows under a 'hot' forecast) has NO usable signal and
  // must NOT leak the conflicting net back through the fallback.
  const conflictOnly: HistoryEntry[] = Array.from({ length: 5 }, () => ({
    change: "x: y",
    conditions: "cold",
    outcome: "worse" as const,
    citations: [RULE],
    track_id: "trk-here",
    condition_tags: ["cold"],
  }));
  const hConflict = historyForRule(RULE, { ...pushBundle(conflictOnly), weather: { air_temp_c: 34 } });
  check("trajectory: a conflicting-ONLY streak (all cold rows vs a hot forecast) → null, tier 0 (no leak)", hConflict === null && historyTier(hConflict) === 0);
}

// ── COLD-START: a driver with zero or one rated run still gets a grounded
//    recommendation — history just doesn't re-rank when there's nothing usable ─
{
  const baseline = proposePlan(pushBundle(), data); // no history key at all

  // (d1) zero history (undefined) → grounded plan, every change cited, no notes.
  check("cold-start: zero history → grounded plan (kind=plan, >=1 change)", baseline.kind === "plan" && baseline.changes.length >= 1);
  check("cold-start: zero history → every change is cited (grounded or silent)", baseline.changes.every((c) => c.option.citations.length > 0));
  check("cold-start: zero history → no history note on any change (nothing to re-rank)", baseline.changes.every((c) => c.option.history_note === undefined));

  // (d2) an EMPTY history array behaves identically to no history.
  const empty = proposePlan(pushBundle([]), data);
  check(
    "cold-start: empty history array → identical grounded plan to no-history",
    JSON.stringify(empty.changes.map((c) => c.option.citations)) === JSON.stringify(baseline.changes.map((c) => c.option.citations)),
  );

  // (d3) ONE rated run on a rule the KB does NOT ground for this symptom (clutch
  // vs understeer) → grounded-first cap: the recommendation is unchanged and
  // still cited. A single unrelated datapoint cannot re-rank.
  const oneUnrelated = proposePlan(
    pushBundle([{ change: "clutch_spring: softer", conditions: "grip green", outcome: "better", citations: ["kb-clutch-springs-softer-009"], track_id: "trk-here" }]),
    data,
  );
  check(
    "cold-start: one rated run on an unrelated rule → grounded plan unchanged (grounded-first cap)",
    JSON.stringify(oneUnrelated.changes.map((c) => c.option.citations)) === JSON.stringify(baseline.changes.map((c) => c.option.citations)),
  );
  check("cold-start: one-unrelated-run plan stays fully cited", oneUnrelated.kind === "plan" && oneUnrelated.changes.every((c) => c.option.citations.length > 0));
}

// ── M3 PER-CARD CONFIDENCE QUALIFIER: additive, deterministic, honest read of
//    how sure THIS recommendation is — composes match strength, source breadth,
//    this-condition history depth and revert cost. Must NOT change which rules
//    fire, their order, the ±1 cap or the race-day bar (all key off confidence). ─
{
  // A controlled fixture rule so single/multi-source and medium/low wording can
  // be exercised independently of the all-HUDY-single-source live KB.
  const fixture = (over: Partial<KBRule> = {}): KBRule => ({
    id: "kb-fixture-001",
    setting: "front_sway_bar",
    direction: "decrease",
    effects: [{ axis: "front_traction", change: "more" }],
    addresses: [{ symptom: "understeer", phase: "mid_corner" }],
    conditions: { amplified_on: [], reduced_on: [] },
    counter_indications: [],
    magnitude_guidance: "One wire step.",
    reversal_cost_minutes: 12,
    confidence: "high",
    sources: ["HUDY Off-Road Set-Up Book p.32 §1.13"],
    scope: ["1-8-offroad"],
    ...over,
  });
  const bundleWith = (tags: ContextBundle["feedback"]["tags"], history?: ContextBundle["history"]): ContextBundle => ({
    chassis_template_id: "kyosho-inferno-mp11",
    setup: {},
    track: { track_id: "trk-here", name: "Club", surface: "clay", grip: "green", conditions: ["low_grip"] },
    feedback: { tags },
    mode: "practice",
    ...(history !== undefined ? { history } : {}),
  });

  // (q1) EXACT (symptom AND phase) vs symptom-only wording.
  const exact = confidenceDetail(fixture(), bundleWith([{ symptom: "understeer", phase: "mid_corner" }]));
  check("qualifier: exact (symptom+phase) match → 'exact match'", exact.qualifier.includes("exact match") && !exact.qualifier.includes("symptom-only"), exact.qualifier);
  const symptomOnly = confidenceDetail(fixture(), bundleWith([{ symptom: "understeer" }]));
  check("qualifier: symptom-only match (no phase) → 'symptom-only match'", symptomOnly.qualifier.includes("symptom-only match"), symptomOnly.qualifier);
  const phaseMismatch = confidenceDetail(fixture(), bundleWith([{ symptom: "understeer", phase: "off_power" }]));
  check("qualifier: symptom matches but phase differs → symptom-only (mirrors retrieval +2)", phaseMismatch.qualifier.includes("symptom-only match"), phaseMismatch.qualifier);

  // (q2) source breadth: single vs multi-source.
  const single = confidenceDetail(fixture(), bundleWith([{ symptom: "understeer" }]));
  check("qualifier: one source → 'single-source'", single.qualifier.includes("single-source"), single.qualifier);
  const multi = confidenceDetail(fixture({ sources: ["HUDY p.32", "AE T6 manual p.9"] }), bundleWith([{ symptom: "understeer" }]));
  check("qualifier: two+ sources → 'multi-source'", multi.qualifier.includes("multi-source"), multi.qualifier);

  // (q3) this-condition history depth: better / worse / untested wording, and the
  // matched-condition signal says 'in similar conditions' exactly when the tier did.
  const untested = confidenceDetail(fixture(), bundleWith([{ symptom: "understeer" }]));
  check("qualifier: no history → 'untested here'", untested.qualifier.includes("untested here"), untested.qualifier);

  const R = "kb-fixture-001";
  const betterRow: HistoryEntry = { change: "x: y", conditions: "low_grip", outcome: "better", citations: [R], track_id: "trk-here" };
  const worseRow: HistoryEntry = { change: "x: y", conditions: "low_grip", outcome: "worse", citations: [R], track_id: "trk-here" };
  const betterB = bundleWith([{ symptom: "understeer" }], [betterRow]);
  const hBetter = historyForRule(R, betterB) ?? undefined;
  const betterQ = confidenceDetail(fixture(), betterB, hBetter);
  check("qualifier: untagged 'better' history → 'rated better here' (no condition claim)", betterQ.qualifier.includes("rated better here") && !betterQ.qualifier.includes("similar conditions"), betterQ.qualifier);

  const worseB = bundleWith([{ symptom: "understeer" }], [worseRow]);
  const hWorse = historyForRule(R, worseB) ?? undefined;
  const worseQ = confidenceDetail(fixture(), worseB, hWorse);
  check("qualifier: untagged 'worse' history → 'rated worse here'", worseQ.qualifier.includes("rated worse here"), worseQ.qualifier);

  // condition-matched 'better' → must say 'in similar conditions', agreeing with the tier.
  const segRow: HistoryEntry = { change: "x: y", conditions: "hot", outcome: "better", citations: [R], track_id: "trk-here", condition_tags: ["hot"] };
  const segB: ContextBundle = { ...bundleWith([{ symptom: "understeer" }], [segRow]), weather: { air_temp_c: 34 } };
  const hSeg = historyForRule(R, segB) ?? undefined;
  const segQ = confidenceDetail(fixture(), segB, hSeg);
  check("qualifier: condition-matched 'better' → 'rated better here in similar conditions' (agrees with tier)", segQ.qualifier.includes("rated better here in similar conditions") && historyTier(hSeg) === 1, segQ.qualifier);

  // (q3b) HONESTY (review must-fix): no-symptom-match must NOT print a false 'symptom-only match'.
  const noMatch = confidenceDetail(fixture(), bundleWith([{ symptom: "oversteer" }]));
  check("qualifier: rule matches NO reported symptom → 'context-only match', never a false 'symptom-only'", noMatch.qualifier.includes("context-only match") && !noMatch.qualifier.includes("symptom-only match"), noMatch.qualifier);

  // (q3c) net-0 history: all-'same' reads 'no change' (not 'mixed'); equal better+worse reads 'mixed results'.
  const sameRow: HistoryEntry = { change: "x: y", conditions: "low_grip", outcome: "same", citations: [R], track_id: "trk-here" };
  const hSame = historyForRule(R, bundleWith([{ symptom: "understeer" }], [sameRow, { ...sameRow }])) ?? undefined;
  check("qualifier: all-'same' history (net 0) → 'no change here', not 'mixed'", confidenceDetail(fixture(), bundleWith([{ symptom: "understeer" }]), hSame).qualifier.includes("no change here"), JSON.stringify(hSame));
  const hMix = historyForRule(R, bundleWith([{ symptom: "understeer" }], [betterRow, worseRow])) ?? undefined;
  check("qualifier: equal better+worse history → 'mixed results here'", confidenceDetail(fixture(), bundleWith([{ symptom: "understeer" }]), hMix).qualifier.includes("mixed results here"), JSON.stringify(hMix));

  // (q4) revert cost surfaced verbatim from the rule.
  check("qualifier: revert cost surfaced as '~N min to revert'", exact.qualifier.includes("~12 min to revert"), exact.qualifier);
  const cheap = confidenceDetail(fixture({ reversal_cost_minutes: 4, confidence: "low" }), bundleWith([{ symptom: "understeer" }]));
  check("qualifier: low-confidence rule leads with 'Tentative'", cheap.qualifier.startsWith("Tentative —"), cheap.qualifier);
  check("qualifier: '~4 min to revert' on the cheap rule", cheap.qualifier.includes("~4 min to revert"), cheap.qualifier);
  const med = confidenceDetail(fixture({ confidence: "medium" }), bundleWith([{ symptom: "understeer" }]));
  check("qualifier: medium-confidence rule leads with 'Worth a try'", med.qualifier.startsWith("Worth a try —"), med.qualifier);
  check("qualifier: high-confidence rule leads with 'High confidence'", exact.qualifier.startsWith("High confidence —"), exact.qualifier);

  // (q5) example-shape sanity: the full sentence reads honestly end-to-end.
  const fullBetter = confidenceDetail(fixture({ sources: ["a", "b"] }), bundleWith([{ symptom: "understeer", phase: "mid_corner" }], [betterRow]), historyForRule(R, bundleWith([{ symptom: "understeer", phase: "mid_corner" }], [betterRow])) ?? undefined);
  check(
    "qualifier: composes the example shape (exact, better, multi-source, revert)",
    fullBetter.qualifier === "High confidence — exact match, rated better here, multi-source, ~12 min to revert",
    fullBetter.qualifier,
  );

  // (q6) base level is the rule's confidence, UNCHANGED.
  check("qualifier: level passes rule.confidence through unchanged (high)", confidenceDetail(fixture(), bundleWith([{ symptom: "understeer" }])).level === "high");
  check("qualifier: level passes rule.confidence through unchanged (low)", confidenceDetail(fixture({ confidence: "low" }), bundleWith([{ symptom: "understeer" }])).level === "low");

  // (q7) DETERMINISM: same inputs → byte-identical qualifier, twice.
  const d1 = confidenceDetail(fixture(), betterB, hBetter);
  const d2 = confidenceDetail(fixture(), betterB, hBetter);
  check("qualifier: deterministic (same inputs → identical string)", d1.qualifier === d2.qualifier && JSON.stringify(d1) === JSON.stringify(d2));

  // (q8) ruleToOption populates confidence_qualifier additively, leaving the
  // base confidence field untouched.
  const opt = ruleToOption(fixture(), bundleWith([{ symptom: "understeer", phase: "mid_corner" }]));
  check("ruleToOption: populates confidence_qualifier", typeof opt.confidence_qualifier === "string" && opt.confidence_qualifier!.startsWith("High confidence —"), opt.confidence_qualifier);
  check("ruleToOption: confidence field still the raw rule.confidence (untouched)", opt.confidence === "high");
}

// ── M3 NON-INTERFERENCE: adding confidence_qualifier changed NEITHER which rules
//    fire NOR their order. Assert the live-KB plan's citations + positions are
//    exactly what they were before the field existed (regression-locked here). ─
{
  const plan = proposePlan(pushBundle(), data);
  const citationOrder = plan.changes.map((c) => c.option.citations.join("|"));
  check(
    "non-interference: plan citations & order are the known-good sequence (field is additive only)",
    JSON.stringify(citationOrder) === JSON.stringify([
      "kb-trackwidth-front-narrower-212",
      "kb-swaybar-front-softer-301",
      "kb-spring-front-softer-107",
    ]),
    JSON.stringify(citationOrder),
  );
  check(
    "non-interference: every change now carries a qualifier (additive populated)",
    plan.changes.every((c) => typeof c.option.confidence_qualifier === "string" && c.option.confidence_qualifier!.length > 0),
  );
  check(
    "non-interference: the qualifier never replaces the base confidence field",
    plan.changes.every((c) => c.option.confidence === "high" || c.option.confidence === "medium" || c.option.confidence === "low"),
  );

  // History promotion still re-ranks by rule.confidence/history, NOT the qualifier:
  // a 'better' history on the rear-diff rule promotes it to #1 exactly as before.
  const promoted = proposePlan(
    pushBundle([{ change: "rear_diff_oil: thinner", conditions: "grip green, dusty", outcome: "better", citations: ["kb-diff-rear-thinner-005"], track_id: "trk-here" }]),
    data,
  );
  check(
    "non-interference: history promotion order is unchanged by the qualifier (rear-diff still #1)",
    promoted.changes[0].option.citations.includes("kb-diff-rear-thinner-005"),
  );
  // and the promoted card's qualifier honestly reflects the better history.
  check(
    "non-interference: promoted card's qualifier reads 'rated better here'",
    (promoted.changes[0].option.confidence_qualifier ?? "").includes("rated better here"),
    promoted.changes[0].option.confidence_qualifier,
  );

  // Full determinism through proposePlan WITH the new field present.
  const again = proposePlan(pushBundle(), data);
  check("non-interference: proposePlan stays byte-deterministic with the qualifier present", JSON.stringify(plan) === JSON.stringify(again));
}

console.log(failures === 0 ? "\nPLAN: all proposePlan/history tests passed" : `\nPLAN: ${failures} failures`);
if (failures > 0) process.exit(1);
