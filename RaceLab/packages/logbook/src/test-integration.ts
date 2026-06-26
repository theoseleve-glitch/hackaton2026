import { templateIdForCar } from "../../garage/src";
import { bundleFromRun } from "./bundle";
import { proposePlan, resolveTemplate } from "../../engine/src";
import type { KBData } from "../../engine/src";
import bundleJson from "../../kb/bundle.json";
import type { LogbookState, RunEntry } from "./types";

/**
 * P1 regression guard (D72): the WHOLE chain a car drives through, end to end —
 * garage typology → template routing → engine bundle (surface + power tags) →
 * grounded advice. Each layer is unit-tested in isolation; this proves they
 * compose so an on-road car can never silently get off-road advice again.
 */

const KB = bundleJson as unknown as KBData;

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) console.log(`✓ ${label}`);
  else {
    failures++;
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const state: LogbookState = { runs: [] };

function run(over: Partial<RunEntry>): RunEntry {
  return {
    id: "run-x",
    created_at: "2026-06-21T09:00:00.000Z",
    type: "practice",
    car_template_id: "kyosho-inferno-mp11",
    setup_version_id: "sv-1",
    setup_name: "Kit",
    track: { name: "Test", surface: "clay", indoor: false },
    conditions: { grip: "high" },
    feedback: { tags: [{ symptom: "understeer", phase: "mid_corner" }], text: "" },
    ...over,
  };
}

function primaryRuleId(bundle: ReturnType<typeof bundleFromRun>): string | undefined {
  const plan = proposePlan(bundle, KB);
  return plan.kind === "plan" ? plan.changes[0]?.option.citations[0] : undefined;
}

// ── 1. typology → resolvable class template ───────────────────────────────────
const touringId = templateIdForCar({ brand: "Xray", model: "T4", category: "onroad", scale: "1/10", power: "electric" });
const buggyId = templateIdForCar({ brand: "TLR", model: "22X", category: "buggy", scale: "1/10", power: "electric", drivetrain: "2wd" });
check("on-road car routes to the on-road template", touringId === "1_10_touring_electric", touringId);
check("off-road buggy routes to an off-road template", buggyId === "1_10_offroad_2wd", buggyId);
const touringTpl = resolveTemplate(KB, touringId);
const buggyTpl = resolveTemplate(KB, buggyId);
check("on-road template resolves in the bundled KB", touringTpl !== undefined);
check("off-road template resolves in the bundled KB", buggyTpl !== undefined);

// ── 2. bundle carries surface + power tags (was dark before D72) ───────────────
const touringRun = run({ car_template_id: touringId, track: { name: "Carpet Hall", surface: "asphalt", indoor: false } });
const touringBundle = bundleFromRun(touringRun, {}, state, { power: "electric" });
check("bundle resolves to the on-road template", resolveTemplate(KB, touringBundle.chassis_template_id) === touringTpl);
check("bundle carries the surface-family tag (asphalt)", touringBundle.track.conditions.includes("asphalt"), touringBundle.track.conditions.join(","));
check("bundle carries the power tag (electric → stock_blinky)", touringBundle.track.conditions.includes("stock_blinky"));

// ── 3. advice is grounded IN-SCOPE for the on-road car ────────────────────────
const touringRuleId = primaryRuleId(touringBundle);
check("on-road car gets a grounded plan", touringRuleId !== undefined);
const touringRule = KB.rules.find((r) => r.id === touringRuleId);
// NON-tautological: retrieve() already guarantees the rule intersects the touring
// template scope, so asserting that proves nothing. Assert instead that the rule's
// scope is DISJOINT from the off-road buggy template — i.e. it is a genuinely
// on-road rule the off-road car could never be offered, so routing (not just the
// scope filter) is what makes it reachable.
check(
  "on-road advice is a genuinely ON-ROAD rule — scope never intersects the off-road buggy template (routing gates it)",
  !!touringRule && !!buggyTpl && !touringRule.scope.some((s) => buggyTpl.scope.includes(s)),
  JSON.stringify(touringRule?.scope),
);

// ── 4. routing CHANGES the answer — the same symptom on a buggy grounds elsewhere
const buggyRun = run({ car_template_id: buggyId, track: { name: "Outdoor Clay", surface: "clay", indoor: false } });
const buggyBundle = bundleFromRun(buggyRun, {}, state, { power: "electric" });
const buggyRuleId = primaryRuleId(buggyBundle);
check("off-road car gets a grounded plan", buggyRuleId !== undefined);
check(
  "the SAME symptom grounds on DIFFERENT rules for an on-road vs off-road car (routing is live)",
  touringRuleId !== undefined && buggyRuleId !== undefined && touringRuleId !== buggyRuleId,
  `touring=${touringRuleId} buggy=${buggyRuleId}`,
);

console.log(failures === 0 ? "\nINTEGRATION: P1 chain end-to-end green" : `\nINTEGRATION: ${failures} failures`);
if (failures > 0) process.exit(1);
