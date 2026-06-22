import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { z } from "zod";
import { assertValidKBData, type ChassisRegistryEntry, type KBClassDef, type KBData } from "./data";
import { parseChassisRegistry } from "../../kb/src/index";
import type { ChassisTemplate, KBRule, Taxonomy } from "./types";

/**
 * Node-only KB loader (CLI, eval, bundle script). The app never imports this
 * file — it imports the pre-compiled packages/kb/bundle.json instead.
 */

const KB_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "kb");

export const RuleSchema = z.object({
  id: z.string().regex(/^kb-[a-z0-9-]+$/),
  setting: z.string(),
  direction: z.string(),
  effects: z.array(z.object({ axis: z.string(), change: z.string() })).min(1),
  addresses: z.array(z.object({ symptom: z.string(), phase: z.string().optional() })).default([]),
  conditions: z.object({
    amplified_on: z.array(z.string()).default([]),
    reduced_on: z.array(z.string()).default([]),
  }),
  counter_indications: z.array(z.string()).default([]),
  magnitude_guidance: z.string(),
  reversal_cost_minutes: z.number().positive(),
  confidence: z.enum(["high", "medium", "low"]),
  sources: z.array(z.string()).min(1),
  scope: z.array(z.string()).min(1),
  forbidden_on: z.array(z.string()).optional(),
  legal_in_power: z.array(z.string()).optional(),
});

// kb/chassis/registry.json — schema/cars.ts ChassisRegistryEntry is the contract
// for the REQUIRED fields; the KB builder's extra fields (power_types,
// template_status, provenance, …) pass through untouched. Accepts a bare
// array or { entries: [...] }.
// Registry validation uses the CANONICAL kb parseChassisRegistry (single source of truth)
// rather than a thin local Zod schema — so the runtime/bundle load fails the build on the
// exact same gate the kb test asserts (no drift where a malformed entry the test would
// reject still loads at runtime).

// kb/classes/*.json — tolerant: the engine only requires class_id; the rest of
// the shape is owned by the KB builder and passes through untouched.
const ClassDefSchema = z.object({ class_id: z.string().min(1) }).passthrough();
const ClassFileSchema = z.union([ClassDefSchema, z.array(ClassDefSchema)]);

export function loadKBData(): KBData {
  // Live rules are the top-level kb/rules/*.yaml. Drafts pending source
  // verification live in kb/rules/drafts/ and are DELIBERATELY excluded from the
  // bundle (D18: the live engine never ships an unverified rule). readdirSync is
  // non-recursive and we take only .yaml files, so the drafts/ subdir is skipped;
  // test-bundle-fresh asserts a rule dropped in drafts/ never reaches the bundle.
  const rulesDir = join(KB_DIR, "rules");
  const rules: KBRule[] = [];
  // SORT filenames before reading: readdir order is filesystem-dependent, so an unsorted
  // load makes the bundled rule array (and thus any sort tie-break that falls through to
  // rule id / array order) non-reproducible across machines. Matches the categoryTemplates
  // loader below, which already sorts.
  const ruleFiles = readdirSync(rulesDir, { withFileTypes: true })
    .filter((f) => f.isFile() && f.name.endsWith(".yaml"))
    .map((f) => f.name)
    .sort();
  for (const name of ruleFiles) {
    const docs = parse(readFileSync(join(rulesDir, name), "utf8")) as unknown[];
    for (const doc of docs) rules.push(RuleSchema.parse(doc) as KBRule);
  }

  const taxonomy = parse(readFileSync(join(KB_DIR, "taxonomy.yaml"), "utf8")) as Taxonomy;

  const templates: Record<string, ChassisTemplate> = {};
  const chassisDir = join(KB_DIR, "chassis");
  for (const file of readdirSync(chassisDir).filter(
    (f) =>
      f.endsWith(".json") &&
      !f.includes("pdf-map") &&
      f !== "bundle.json" &&
      f !== "registry.json",
  )) {
    const template = JSON.parse(readFileSync(join(chassisDir, file), "utf8")) as ChassisTemplate;
    templates[template.template_id] = template;
  }

  // kb/chassis/categories/*.json — the per-category setup-page scaffolds a
  // pending_pdf model resolves to. Loaded into a SEPARATE map so they never
  // masquerade as real per-model templates (proposePlan etc. only see `templates`).
  const categoryTemplates: Record<string, ChassisTemplate> = {};
  const categoriesDir = join(chassisDir, "categories");
  if (existsSync(categoriesDir)) {
    for (const file of readdirSync(categoriesDir)
      .filter((f) => f.endsWith(".json"))
      .sort()) {
      const t = JSON.parse(readFileSync(join(categoriesDir, file), "utf8")) as ChassisTemplate;
      if (categoryTemplates[t.template_id]) {
        throw new Error(`KB categories: duplicate template_id '${t.template_id}' (${file})`);
      }
      categoryTemplates[t.template_id] = t;
    }
  }

  // kb/chassis/registry.json — OPTIONAL (lands in parallel); validated when present
  let registry: ChassisRegistryEntry[] | undefined;
  const registryPath = join(chassisDir, "registry.json");
  if (existsSync(registryPath)) {
    const parsed = parseChassisRegistry(JSON.parse(readFileSync(registryPath, "utf8")));
    if (!parsed.ok) throw new Error(`registry.json failed kb validation: ${parsed.reason}`);
    registry = parsed.value as unknown as ChassisRegistryEntry[];
  }

  // kb/classes/*.json — OPTIONAL (lands in parallel); validated when present
  let classes: Record<string, KBClassDef> | undefined;
  const classesDir = join(KB_DIR, "classes");
  if (existsSync(classesDir)) {
    const defs: Record<string, KBClassDef> = {};
    for (const file of readdirSync(classesDir).filter((f) => f.endsWith(".json")).sort()) {
      const raw = ClassFileSchema.parse(JSON.parse(readFileSync(join(classesDir, file), "utf8")));
      for (const def of Array.isArray(raw) ? raw : [raw]) {
        if (defs[def.class_id]) {
          throw new Error(`KB classes: duplicate class_id '${def.class_id}' (${file})`);
        }
        defs[def.class_id] = def as KBClassDef;
      }
    }
    if (Object.keys(defs).length > 0) classes = defs;
  }

  const data: KBData = {
    rules,
    taxonomy,
    templates,
    ...(registry !== undefined ? { registry } : {}),
    ...(classes !== undefined ? { classes } : {}),
    ...(Object.keys(categoryTemplates).length > 0 ? { categoryTemplates } : {}),
  };
  assertValidKBData(data);
  return data;
}

/** Where the compiled bundle the app imports lives (packages/kb/bundle.json). */
export const KB_BUNDLE_PATH = join(KB_DIR, "bundle.json");

/** The exact string the bundler writes — the SINGLE source of truth shared by
 *  `npm run bundle` (bundle-kb.ts) and the freshness guard (test-bundle-fresh.ts),
 *  so the two can never silently diverge and ship a stale bundle to the app. */
export function serializeBundle(data: KBData = loadKBData()): string {
  return JSON.stringify(data);
}
