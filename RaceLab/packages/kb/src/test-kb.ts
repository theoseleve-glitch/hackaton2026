/**
 * packages/kb test gate — validates the ACTUAL data files (registry, class
 * declaration, chassis template, compiled bundle) against the schema contract
 * and the canonical facet vocabulary, plus parser negatives. Style mirrors
 * packages/schema/src/test-schema.ts: plain checks, console output, exit(1).
 */

import registryJson from "../chassis/registry.json";
import classJson from "../classes/1-8-tt-buggy.json";
import mp11Json from "../chassis/inferno-mp11.json";
import bundleJson from "../bundle.json";
import {
  BRUSHLESS_SECTIONS,
  COMMON_SECTIONS,
  CUSTOM_CHASSIS_ID,
  NITRO_SECTIONS,
  classLabels,
  makeCar,
  sectionApplies,
} from "../../schema/src/index";
import type { ChassisRegistryEntry } from "../../schema/src/index";
import { FACET_CATEGORIES, FACET_SCALES, FACET_TYPES, parseChassisRegistry, parseClassDecl } from "./index";
import type { KbChassisRegistryEntry, KbClassDecl } from "./index";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`✓ ${label}`);
  } else {
    failures++;
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
function fatal(label: string): never {
  console.log(`✗ FATAL: ${label}`);
  process.exit(1);
}
function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

const NOW = "2026-06-12T09:00:00.000Z";

// ═══ registry file (kb/chassis/registry.json) ════════════════════════════════

console.log("\n— registry file —");
const regRes = parseChassisRegistry(registryJson as unknown);
if (!regRes.ok) fatal(`registry.json rejected: ${regRes.reason}`);
const registry: readonly KbChassisRegistryEntry[] = regRes.value;
check("registry.json is a bare array (NOT a template-shaped object)", Array.isArray(registryJson));
check("registry has 11 entries", registry.length === 11, String(registry.length));
check(
  "chassis_ids are unique",
  new Set(registry.map((e) => e.chassis_id)).size === registry.length,
);
check(
  "every entry uses the canonical facet vocabulary (offroad / 1/8 / buggy)",
  registry.every((e) => e.category === "offroad" && e.scale === "1/8" && e.type === "buggy"),
);
check(
  "every entry's power_types contains its default_power_type",
  registry.every((e) => e.power_types.includes(e.default_power_type)),
);
const full = registry.filter((e) => e.template_status === "full");
const pending = registry.filter((e) => e.template_status === "pending_pdf");
check("exactly 1 full entry + 10 pending_pdf", full.length === 1 && pending.length === 10);
check("the full entry is the MP11", full[0]?.chassis_id === "kyosho-inferno-mp11");
check("full entry carries template_file", full[0]?.template_file === "inferno-mp11.json");
check(
  "pending entries never carry template_file (identity facts only)",
  pending.every((e) => e.template_file === undefined),
);
check("every entry has a provenance string (grounding rule)", registry.every((e) => e.provenance.trim() !== ""));

// ═══ template join (the join node-kb.ts actually performs) ═══════════════════

console.log("\n— template join —");
const mp11 = mp11Json as { template_id?: unknown; fields?: unknown };
check(
  "chassis template is an object with a string template_id (registry-as-template guard)",
  !Array.isArray(mp11Json) && typeof mp11.template_id === "string",
);
check("template has a fields object", mp11.fields !== null && typeof mp11.fields === "object");
check(
  "join key: full entry's template_id === template file's template_id",
  full[0]?.template_id === mp11.template_id,
  `${full[0]?.template_id} vs ${String(mp11.template_id)}`,
);

// ═══ class declaration (kb/classes/1-8-tt-buggy.json) ════════════════════════

console.log("\n— class declaration —");
const classRes = parseClassDecl(classJson as unknown);
if (!classRes.ok) fatal(`1-8-tt-buggy.json rejected: ${classRes.reason}`);
const decl: KbClassDecl = classRes.value;
check("class_id is 1-8-tt-buggy", decl.class_id === "1-8-tt-buggy");
check(
  "class facets match the registry facets",
  registry.every((e) => e.category === decl.category && e.scale === decl.scale && e.type === decl.type),
);
check("sections.common is byte-identical (order included) to schema COMMON_SECTIONS", sameList(decl.sections.common, COMMON_SECTIONS));
check("sections.nitro is byte-identical to schema NITRO_SECTIONS", sameList(decl.sections.nitro, NITRO_SECTIONS));
check("sections.brushless is byte-identical to schema BRUSHLESS_SECTIONS", sameList(decl.sections.brushless, BRUSHLESS_SECTIONS));
check("class power_types is exactly [nitro, brushless]", sameList(decl.power_types, ["nitro", "brushless"]));
check(
  "every registry power_type is allowed by the class",
  registry.every((e) => e.power_types.every((p) => decl.power_types.includes(p))),
);

// ═══ vocabulary pin — end-to-end against schema matchers (finding-2 regression)

console.log("\n— facet vocabulary end-to-end —");
const schemaRegistry: readonly ChassisRegistryEntry[] = registry; // extends the frozen contract
const labels = classLabels({ chassis_id: "kyosho-inferno-mp11" }, schemaRegistry);
check(
  "classLabels(MP11) returns the canonical labels",
  labels !== null && labels.category === "offroad" && labels.scale === "1/8" && labels.type === "buggy",
);
const ctx = { power_type: "nitro" as const, labels };
check("sectionApplies matches when.category=[offroad]", sectionApplies({ category: ["offroad"] }, ctx));
check("sectionApplies matches when.scale=[1/8]", sectionApplies({ scale: ["1/8"] }, ctx));
check("sectionApplies matches when.type=[buggy]", sectionApplies({ type: ["buggy"] }, ctx));
check(
  "the cars.ts comment placeholder vocabulary does NOT match kb data (documented discrepancy)",
  !sectionApplies({ type: ["offroad-competition"] }, ctx) && !sectionApplies({ category: ["buggy"] }, ctx),
);
check(
  "facet conditions fail CLOSED without labels",
  !sectionApplies({ category: ["offroad"] }, { power_type: "nitro", labels: null }),
);
check(
  "FACET_* vocabulary covers every facet value in the data",
  registry.every(
    (e) =>
      (FACET_CATEGORIES as readonly string[]).includes(e.category) &&
      (FACET_SCALES as readonly string[]).includes(e.scale) &&
      (FACET_TYPES as readonly string[]).includes(e.type),
  ),
);

// ═══ registry feeds schema makeCar verbatim ══════════════════════════════════

console.log("\n— makeCar against the real registry —");
{
  const okRes = makeCar({ name: "MP11 #1", chassis_id: "kyosho-inferno-mp11", power_type: "nitro" }, NOW, schemaRegistry);
  check("makeCar accepts a registered chassis", okRes.ok);
  const badRes = makeCar({ name: "Ghost", chassis_id: "tlr-8ight-x", power_type: "nitro" }, NOW, schemaRegistry);
  check("makeCar rejects an unregistered chassis", !badRes.ok && badRes.reason === "unknown_chassis");
  const customRes = makeCar({ name: "Mystery", chassis_id: CUSTOM_CHASSIS_ID, power_type: "brushless" }, NOW, schemaRegistry);
  check("makeCar accepts the custom escape hatch", customRes.ok);
  check("classLabels is null for the custom chassis (fails closed)", classLabels({ chassis_id: CUSTOM_CHASSIS_ID }, schemaRegistry) === null);
}

// ═══ parser negatives (never throw, reject loudly) ═══════════════════════════

console.log("\n— parseChassisRegistry negatives —");
function entry(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    chassis_id: "kyosho-inferno-mp11",
    template_id: "kyosho-inferno-mp11",
    brand: "Kyosho",
    model: "Inferno MP11",
    category: "offroad",
    scale: "1/8",
    type: "buggy",
    default_power_type: "nitro",
    power_types: ["nitro"],
    template_status: "full",
    template_file: "inferno-mp11.json",
    provenance: "test",
    ...overrides,
  };
}
function rejects(label: string, value: unknown, reason: string): void {
  const r = parseChassisRegistry(value);
  check(label, !r.ok && r.reason === reason, r.ok ? "accepted" : r.reason);
}
rejects("non-array registry rejected", { entries: [] }, "not_an_array");
rejects("null registry rejected (no throw)", null, "not_an_array");
rejects(
  "duplicate chassis_id rejected",
  [entry({}), entry({})],
  "duplicate:[1].chassis_id",
);
rejects(
  "schema-comment placeholder category 'buggy' rejected (vocabulary drift = build error)",
  [entry({ category: "buggy" })],
  "invalid:[0].category",
);
rejects(
  "schema-comment placeholder type 'offroad-competition' rejected",
  [entry({ type: "offroad-competition" })],
  "invalid:[0].type",
);
rejects("unknown scale rejected", [entry({ scale: "1/10" })], "invalid:[0].scale");
rejects("template_status outside the enum rejected", [entry({ template_status: "wip" })], "invalid:[0].template_status");
rejects(
  "full entry without template_file rejected",
  [entry({ template_file: undefined })],
  "invalid:[0].template_file",
);
rejects(
  "pending entry WITH template_file rejected",
  [entry({ template_status: "pending_pdf", template_file: "x.json" })],
  "invalid:[0].template_file",
);
rejects(
  "default_power_type missing from power_types rejected",
  [entry({ power_types: ["brushless"] })],
  "invalid:[0].power_types",
);
rejects("empty power_types rejected", [entry({ power_types: [] })], "invalid:[0].power_types");
rejects("empty provenance rejected (grounding rule)", [entry({ provenance: "  " })], "invalid:[0].provenance");

console.log("\n— parseClassDecl negatives —");
function declFix(overrides: Record<string, unknown>): Record<string, unknown> {
  return { ...(classJson as unknown as Record<string, unknown>), ...overrides };
}
function declRejects(label: string, value: unknown, reason: string): void {
  const r = parseClassDecl(value);
  check(label, !r.ok && r.reason === reason, r.ok ? "accepted" : r.reason);
}
declRejects("garbage rejected (no throw)", 42, "not_an_object");
declRejects("off-vocab category rejected", declFix({ category: "onroad" }), "invalid:category");
declRejects(
  "unknown section id rejected",
  declFix({ sections: { common: ["front_suspension", "flux_capacitor"], nitro: [], brushless: [] } }),
  "invalid:sections.common",
);
declRejects(
  "nitro id in the common bucket rejected",
  declFix({ sections: { common: ["engine"], nitro: [], brushless: [] } }),
  "invalid:sections.common",
);
declRejects(
  "duplicate section id rejected",
  declFix({ sections: { common: ["tyres", "tyres"], nitro: [], brushless: [] } }),
  "invalid:sections.common",
);
declRejects("empty power_types rejected", declFix({ power_types: [] }), "invalid:power_types");

// ═══ compiled bundle (kb/bundle.json — finding-1 regression) ═════════════════

console.log("\n— compiled bundle —");
const bundle = bundleJson as unknown as {
  rules: unknown[];
  taxonomy: unknown;
  templates: Record<string, { template_id?: unknown }>;
  registry?: { chassis_id?: unknown }[];
  classes?: Record<string, { class_id?: unknown }>;
};
check("bundle has no 'undefined' template key (registry-swallowed-as-template guard)", !("undefined" in bundle.templates));
check(
  "every bundle template key matches its value's template_id",
  Object.entries(bundle.templates).every(([k, t]) => t.template_id === k),
);
check("bundle ships the MP11 template", "kyosho-inferno-mp11" in bundle.templates);
check("bundle ships the registry", Array.isArray(bundle.registry), typeof bundle.registry);
check(
  "bundle registry chassis_id set matches the kb registry (not stale)",
  Array.isArray(bundle.registry) &&
    bundle.registry.length === registry.length &&
    registry.every((e) => bundle.registry!.some((b) => b.chassis_id === e.chassis_id)),
);
check(
  "bundle ships the class declaration keyed by class_id",
  bundle.classes !== undefined && bundle.classes["1-8-tt-buggy"]?.class_id === "1-8-tt-buggy",
);

// ═══ verdict ═════════════════════════════════════════════════════════════════

if (failures > 0) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll packages/kb checks passed.");
