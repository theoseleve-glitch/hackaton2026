import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { retrieve, templateExposes } from "./retrieval";
import { resolveTemplate, type KBData } from "./data";
import { loadKBData } from "./node-kb";
import { proposePlan } from "./plan";
import { recommend } from "./engineer";
import { planRaceDay } from "./raceday";
import { makeId } from "../../schema/src/ids";
import { surfaceToTags, powerTypeToTags } from "../../schema/src/runs";
import type { ChassisTemplate, ContextBundle, KBRule } from "./types";

// Unit tests for the model-aware gating (D48): capability filter, forbidden_on,
// legal_in_power hard exclusions, alias/derived templateExposes, and the
// registry→category-template resolution. Synthetic data — the live rules don't
// use forbidden_on/legal_in_power yet, so the gates are proven here.

let failed = 0;
function check(label: string, cond: boolean, detail = ""): void {
  console.log(`${cond ? "✓" : "✗"} ${label}${cond ? "" : `  ${detail}`}`);
  if (!cond) failed++;
}

// ── templateExposes: concrete / alias / derived / absent ─────────────────────
const tmpl = (fields: ChassisTemplate["fields"]): ChassisTemplate => ({
  template_id: "t",
  template_version: 1,
  brand: "b",
  model: "m",
  category: "offroad",
  scope: ["1-8-offroad"],
  fields,
});

const tConcrete = tmpl({
  front_shock_oil: { type: "number" },
  front_ride_height: { type: "number" },
  rear_ride_height: { type: "number" },
  ride_height: { type: "alias", of: ["front_ride_height", "rear_ride_height"] },
  ride_height_rake: { type: "derived", of: ["front_ride_height", "rear_ride_height"] },
  orphan_alias: { type: "alias", of: ["front_ride_height", "missing_field"] },
});

check("exposes a concrete field", templateExposes(tConcrete, "front_shock_oil"));
check("exposes an alias whose targets are all present", templateExposes(tConcrete, "ride_height"));
check("exposes a derived whose targets are all present", templateExposes(tConcrete, "ride_height_rake"));
check("does NOT expose an absent setting", !templateExposes(tConcrete, "front_sway_bar"));
check("does NOT expose an alias with a missing target", !templateExposes(tConcrete, "orphan_alias"));

// ── retrieve gates: capability / forbidden_on / legal_in_power ───────────────
const baseRule = (over: Partial<KBRule>): KBRule => ({
  id: "kb-test-rule-001",
  setting: "front_shock_oil",
  direction: "increase",
  effects: [{ axis: "x", change: "more" }],
  addresses: [{ symptom: "understeer", phase: "mid_corner" }],
  conditions: { amplified_on: [], reduced_on: [] },
  counter_indications: [],
  magnitude_guidance: "small",
  reversal_cost_minutes: 5,
  confidence: "high",
  sources: ["TEST p.1"],
  scope: ["1-8-offroad"],
  ...over,
});

const bundle = (conditions: string[]): ContextBundle => ({
  chassis_template_id: "t",
  setup: {},
  track: { name: "T", surface: "clay", grip: "green", conditions },
  feedback: { tags: [{ symptom: "understeer", phase: "mid_corner" }], text: "pushes mid-corner" },
  mode: "practice",
});

// capability gate: a rule targeting a part the template lacks is dropped
const lacksPart = tmpl({ rear_shock_oil: { type: "number" } }); // no front_shock_oil
check(
  "capability gate drops a rule whose setting the template lacks",
  retrieve([baseRule({})], bundle([]), lacksPart).length === 0,
);
check(
  "rule fires when the template exposes its setting",
  retrieve([baseRule({})], bundle([]), tConcrete).length === 1,
);

// forbidden_on: hard exclusion even with a strong symptom match
check(
  "forbidden_on hard-excludes when a forbidden condition is active",
  retrieve([baseRule({ forbidden_on: ["loose_dirt"] })], bundle(["loose_dirt"]), tConcrete).length === 0,
);
check(
  "forbidden_on does not exclude when the condition is absent",
  retrieve([baseRule({ forbidden_on: ["loose_dirt"] })], bundle(["carpet"]), tConcrete).length === 1,
);

// legal_in_power: fires only when an allowed power tag is the active run power
check(
  "legal_in_power drops a mod-only rule for a stock entrant",
  retrieve([baseRule({ legal_in_power: ["modified_power"] })], bundle(["stock_blinky"]), tConcrete).length === 0,
);
check(
  "legal_in_power allows the rule when the run power matches",
  retrieve([baseRule({ legal_in_power: ["modified_power"] })], bundle(["modified_power"]), tConcrete).length === 1,
);
// P1-E1: powerTypeToTags is the missing producer — without it no power tag ever
// reaches track.conditions and every legal_in_power rule is silently dropped.
check("powerTypeToTags: nitro → nitro_power", powerTypeToTags("nitro").includes("nitro_power"));
check("powerTypeToTags: brushless defaults to stock_blinky", powerTypeToTags("brushless").includes("stock_blinky"));
check(
  "power gate END-TO-END: a [stock_blinky,modified_power] rule fires for a brushless-tagged bundle, not a nitro one",
  retrieve([baseRule({ legal_in_power: ["stock_blinky", "modified_power"] })], bundle([...powerTypeToTags("brushless")]), tConcrete).length === 1 &&
    retrieve([baseRule({ legal_in_power: ["stock_blinky", "modified_power"] })], bundle([...powerTypeToTags("nitro")]), tConcrete).length === 0,
);

// ── race-day bar is applied to the FULL pool BEFORE truncation (night M2 P1) ──
// A race-day-INELIGIBLE rule (medium confidence) must be dropped by retrieve() in
// race_day mode even though it matches and would otherwise rank — and an eligible
// high-confidence rule must survive. (Previously the bar ran post-slice in the callers,
// so ineligible rules could fill the top-N and starve eligible ones into a false "do nothing".)
const rdEligible = baseRule({ id: "kb-rd-elig-001", setting: "front_shock_oil", confidence: "high", reversal_cost_minutes: 5 });
const rdIneligible = baseRule({ id: "kb-rd-inelig-002", setting: "front_ride_height", confidence: "medium", reversal_cost_minutes: 5 });
const raceDayBundle: ContextBundle = { ...bundle([]), mode: "race_day" };
const practiceBundle: ContextBundle = bundle([]);
check(
  "race_day: retrieve drops the ineligible (medium) rule, keeps the eligible (high) one",
  retrieve([rdIneligible, rdEligible], raceDayBundle, tConcrete).map((s) => s.rule.id).join() === "kb-rd-elig-001",
);
check(
  "practice: both rules survive (race-day bar is off)",
  retrieve([rdIneligible, rdEligible], practiceBundle, tConcrete).length === 2,
);

// ── resolveTemplate: full / pending→category / unknown ───────────────────────
const catT = tmpl({ front_shock_oil: { type: "number" } });
catT.template_id = "1_8_offroad_nitro";
const fullT = tmpl({ front_shock_oil: { type: "number" } });
fullT.template_id = "kyosho-inferno-mp11";
const data: KBData = {
  rules: [],
  taxonomy: { symptoms: [], phases: [], evolution: [], conditions: [], engine_scope_refusal: { keywords: [], refusal: "" } },
  templates: { "kyosho-inferno-mp11": fullT },
  categoryTemplates: { "1_8_offroad_nitro": catT },
  registry: [
    { chassis_id: "kyosho-inferno-mp10", template_id: "kyosho-inferno-mp10", brand: "Kyosho", model: "MP10", category: "offroad", scale: "1/8", type: "buggy", default_power_type: "nitro", category_template: "1_8_offroad_nitro" },
  ] as unknown as KBData["registry"],
};
check("resolveTemplate returns the full template directly", resolveTemplate(data, "kyosho-inferno-mp11") === fullT);
check("resolveTemplate maps a pending chassis to its category template", resolveTemplate(data, "kyosho-inferno-mp10") === catT);
check("resolveTemplate resolves a category-template id used directly (app routes a car to its class scaffold)", resolveTemplate(data, "1_8_offroad_nitro") === catT);
check("resolveTemplate returns undefined for an unknown id", resolveTemplate(data, "ghost-9000") === undefined);

// ── draft-staging: kb/rules/drafts/ is NEVER bundled (D18 safety net) ─────────
const live = loadKBData();
check(
  "draft sentinel rule is excluded from the live KB (drafts/ never bundled)",
  !live.rules.some((r) => r.id === "kb-draft-sentinel-000"),
);
check(
  "live KB still loaded the real rules (sanity)",
  live.rules.length >= 60,
  `got ${live.rules.length}`,
);

// ── surface reconciliation (D51): Théo's 67 app surfaces → engine condition tags ──
// Every tag surfaceToTags emits must be a real taxonomy condition (so a rule's
// amplified_on/forbidden_on actually fires), and the Tier-A racing surfaces must
// resolve their family. Reads the app's rcdata.json so it catches drift on either
// side (Théo adds a surface, or the taxonomy tag set changes).
const taxConds = new Set(live.taxonomy.conditions);
const rcPath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "apps", "mobile", "src", "rcdata.json");
const surfaces = (JSON.parse(readFileSync(rcPath, "utf8")).surfaces as { id: string }[]) ?? [];
const invalid: string[] = [];
let familyHits = 0;
for (const sf of surfaces) {
  const tags = surfaceToTags(sf.id);
  if (tags.length > 0) familyHits++;
  for (const t of tags) if (!taxConds.has(t)) invalid.push(`${sf.id}→${t}`);
}
check("every surface→tag output is a valid taxonomy condition", invalid.length === 0, invalid.join(", "));
check(
  "Tier-A racing surfaces resolve their family tag",
  surfaceToTags("loose_dirt_loam").includes("loose_dirt") &&
    surfaceToTags("astroturf").includes("astroturf") &&
    surfaceToTags("carpet_onroad").includes("carpet") &&
    surfaceToTags("asphalt_high_grip").includes("asphalt") &&
    surfaceToTags("blue_groove").includes("blue_groove"),
);
check(
  "watered/tacky clay is grippy clay, not rain-wet (no false 'wet' tag)",
  surfaceToTags("watered_tacky_clay").includes("clay") && !surfaceToTags("watered_tacky_clay").includes("wet"),
);
console.log(`surface reconciliation: ${familyHits}/${surfaces.length} of Théo's surfaces map to a family tag; all emitted tags valid`);

// ── P0-1 regression: pending_pdf models get GROUNDED advice, not a refusal ────
// The chatbot greets "ready" then (pre-fix) refused on 236/237 models because
// proposePlan/planRaceDay/analyzeRuns looked the template up DIRECTLY instead of
// via resolveTemplate (the D49 category fallback). recommend() always used the
// fallback; the three siblings did not. This drives a REAL pending registry model
// (xray-t4 → 1_10_touring_electric, a category with live rules) through the two
// ContextBundle entry points and asserts a recommendation, never a refusal.
// planRaceDay + analyzeRuns carry the same regression in test-raceday/test-reports.
const pendingId = "xray-t4";
const pendingEntry = live.registry?.find((e) => e.chassis_id === pendingId) as
  | { template_status?: string }
  | undefined;
check(
  "sanity: chosen regression model is genuinely pending_pdf (category-fallback path)",
  pendingEntry?.template_status === "pending_pdf",
  `status=${pendingEntry?.template_status}`,
);
const pendingBundle: ContextBundle = {
  chassis_template_id: pendingId,
  setup: {},
  track: { name: "Indoor Carpet", surface: "carpet", grip: "high", conditions: ["carpet"] },
  feedback: { tags: [{ symptom: "understeer", phase: "mid_corner" }] },
  mode: "practice",
};
check(
  "proposePlan grounds a pending_pdf model (was: refused 236/237) ",
  proposePlan(pendingBundle, live).kind !== "refusal",
);
check(
  "recommend grounds the same pending_pdf model (parity check)",
  recommend(pendingBundle, live).kind === "recommendation",
);
const raceDayPending = planRaceDay(
  {
    practice: [],
    forecast: [],
    track: { track_id: makeId("trk", 0, () => 0), name: "Carpet", surface: "carpet", indoor: true },
    chassis_template_id: pendingId,
  },
  live,
);
check(
  "planRaceDay resolves a pending_pdf model (not unknown_template)",
  raceDayPending.ok === true,
  raceDayPending.ok ? "" : `reason=${raceDayPending.reason}`,
);

console.log(`\n${failed === 0 ? "All" : failed + " FAILED —"} model-gating checks`);
if (failed > 0) process.exit(1);
