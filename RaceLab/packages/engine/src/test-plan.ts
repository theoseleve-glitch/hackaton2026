import { loadKBData } from "./node-kb";
import { proposePlan, MAX_PLAN_CHANGES } from "./plan";
import type { ContextBundle } from "./types";

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
    "promoted change carries the deterministic history note (small-sample qualified)",
    promoted.changes[0].option.history_note === "Rated better here last time (small sample) — ranked up.",
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
    "mixed history carries the tally note (small-sample qualified)",
    mixed.changes[0].option.history_note === "Tried here before (small sample): 1 better / 0 same / 1 worse.",
    mixed.changes[0].option.history_note,
  );
}

console.log(failures === 0 ? "\nPLAN: all proposePlan/history tests passed" : `\nPLAN: ${failures} failures`);
if (failures > 0) process.exit(1);
