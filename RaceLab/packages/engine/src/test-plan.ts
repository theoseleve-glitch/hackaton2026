import { loadKBData } from "./node-kb";
import { proposePlan, MAX_PLAN_CHANGES } from "./plan";
import { historyForRule, historyTier, historyNote } from "./history";
import type { ContextBundle, HistoryEntry } from "./types";

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
  change: "front_sway_bar: softer",
  conditions: "grip green, dusty",
  outcome: "worse" as const,
  citations: ["kb-swaybar-front-softer-301"],
  track_id: "trk-here",
};
{
  const clean = proposePlan(pushBundle(), data);
  check(
    "baseline: sway bar rule ranks #1 without history",
    clean.changes[0].option.citations.includes("kb-swaybar-front-softer-301"),
  );

  const demoted = proposePlan(pushBundle([WORSE_301]), data);
  check(
    "past 'worse' here demotes the rule below every clean rule",
    demoted.kind === "plan" &&
      !demoted.changes.some((c) => c.option.citations.includes("kb-swaybar-front-softer-301")),
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
    otherTrack.changes[0].option.citations.includes("kb-swaybar-front-softer-301"),
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
    unattributed.changes[0].option.citations.includes("kb-swaybar-front-softer-301"),
  );

  // legacy rows (schema ContextHistoryEntry shape: no citations) have no effect
  const legacy = proposePlan(
    pushBundle([{ change: "front_sway_bar: softer", conditions: "grip green", outcome: "worse" }]),
    data,
  );
  check(
    "rows without citations never influence ranking (no rule id, no attribution)",
    legacy.changes[0].option.citations.includes("kb-swaybar-front-softer-301"),
  );

  // mixed history → neutral tier, informational note
  const mixed = proposePlan(
    pushBundle([WORSE_301, { ...WORSE_301, outcome: "better" }]),
    data,
  );
  check(
    "mixed better/worse → neutral tier (rule keeps its clean rank)",
    mixed.changes[0].option.citations.includes("kb-swaybar-front-softer-301"),
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

  const hNeutral = historyForRule(R, hist([], undefined));
  check("condition-seg: neutral forecast → both rows generic-match → cancel to tier 0", historyTier(hNeutral) === 0);

  // backward compat: all-untagged history → all-rows fallback, identical to legacy
  const hLegacy = historyForRule(R, hist(["high_grip"], 34, [{ ...uW }, { ...uW }]));
  check("condition-seg: all-untagged rows → all-rows fallback (legacy behavior unchanged)", hLegacy?.matched_count === 0 && historyTier(hLegacy) === -1);
}

console.log(failures === 0 ? "\nPLAN: all proposePlan/history tests passed" : `\nPLAN: ${failures} failures`);
if (failures > 0) process.exit(1);
