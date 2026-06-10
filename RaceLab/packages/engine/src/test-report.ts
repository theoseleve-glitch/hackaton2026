import { drivingTips } from "./driving-tips";
import { loadKBData } from "./node-kb";
import { buildReport } from "./report";
import type { ContextBundle } from "./types";

/** Tests for the structured 8-part engineer report (D22) + driving tips (D23). */

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

function bundle(overrides: Partial<ContextBundle> = {}): ContextBundle {
  return {
    chassis_template_id: "kyosho-inferno-mp11",
    setup: { front_diff_oil: 8000, center_diff_oil: 5000, rear_diff_oil: 3000, front_sway_bar: 2.3, rear_sway_bar: 2.8 },
    track: { name: "Club Track", surface: "clay", grip: "green", conditions: ["low_grip", "dusty"] },
    feedback: { tags: [{ symptom: "understeer", phase: "mid_corner" }] },
    mode: "practice",
    ...overrides,
  };
}

// 1. Full report shape on a known-good scenario (push mid-corner, low grip)
{
  const r = buildReport(bundle(), data);
  check("kind is report", r.kind === "report", r.kind);
  check("diagnosis names the symptom and context", /understeer/.test(r.diagnosis) && /green grip clay/.test(r.diagnosis), r.diagnosis);
  check("primary change exists with citation", r.primary !== undefined && r.primary.citations.length > 0);
  check("secondary uses a DIFFERENT lever", r.secondary === undefined || r.secondary.setting !== r.primary!.setting);
  check("do_not_touch always closes with one-change-at-a-time", r.do_not_touch[r.do_not_touch.length - 1].includes("one change at a time"));
  check("expected behavior present", r.expected_behavior !== undefined && r.expected_behavior.length > 0);
  check("confidence mirrors the primary rule", r.confidence === r.primary!.confidence);
  check("rationale cites the rule id", r.primary!.citations.every((c) => r.rationale.includes(c)), r.rationale);
  check("rationale invites rating when no history", /rate this run/i.test(r.rationale), r.rationale);
}

// 2. History is surfaced in the rationale (the learning loop made visible)
{
  const r = buildReport(
    bundle({
      history: [
        { change: 'ran "Softer front"', conditions: "green grip clay", outcome: "better" },
        { change: 'ran "Q2 sheet"', conditions: "green grip clay", outcome: "worse" },
      ],
    }),
    data,
  );
  check("history counts surfaced", /1 run rated better, 1 worse, of 2 rated/.test(r.rationale), r.rationale);
}

// 3. Engine-scope question → hard refusal, no setup advice (D13)
{
  const r = buildReport(bundle({ question: "should I lean the HSN a bit?" }), data);
  check("needle question refused", r.kind === "refusal" && r.primary === undefined);
  check("refusal carries the canned message", (r.message ?? "").includes("out of my scope"));
}

// 4. Race day + unknown symptom → do_nothing protects the result
{
  const r = buildReport(
    bundle({ mode: "race_day", feedback: { tags: [{ symptom: "nosedive_jumps" }] } }),
    data,
  );
  check(
    "race day below the bar → do_nothing or high-confidence-only report",
    r.kind === "do_nothing" || (r.kind === "report" && r.confidence === "high"),
    r.kind,
  );
}

// 5. Driving tips — change-driven, condition-driven, tyre-driven (D23)
{
  const b = bundle({ tyres: { wear: "worn" }, track: { name: "T", surface: "carpet", grip: "high", conditions: ["high_grip"], evolution: "degrading" } });
  const tips = drivingTips(b);
  check("tips fire from conditions/tyres/evolution without a rule", tips.length > 0 && tips.length <= 3, String(tips.length));
  check("worn tyres tip present", tips.some((t) => t.includes("worn tyres")));

  const report = buildReport(bundle(), data);
  check("report includes driving tips", report.driving_tips.length > 0);
  check("tips capped at 3", report.driving_tips.length <= 3);
}

// 6. Determinism: same bundle → identical report (D18)
{
  const a = JSON.stringify(buildReport(bundle(), data));
  const b = JSON.stringify(buildReport(bundle(), data));
  check("report is deterministic", a === b);
}

if (failures > 0) {
  console.error(`\n${failures} report test(s) failed`);
  process.exit(1);
}
console.log("\nAll report tests passed");
