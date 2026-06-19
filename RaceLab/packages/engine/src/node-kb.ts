import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { z } from "zod";
import { assertValidKBData, type ChassisRegistryEntry, type KBClassDef, type KBData } from "./data";
import type { ChassisTemplate, KBRule, Taxonomy } from "./types";

/**
 * Node-only KB loader (CLI, eval, bundle script). The app never imports this
 * file — it imports the pre-compiled packages/kb/bundle.json instead.
 */

const KB_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "kb");

const RuleSchema = z.object({
  id: z.string().regex(/^kb-[a-z0-9-]+$/),
  setting: z.string(),
  direction: z.string(),
  // R2-3: magnitude_estimate is OPTIONAL on an effect — validated-if-present
  // (must be a non-empty string), absent is fine (current behaviour).
  effects: z
    .array(
      z.object({
        axis: z.string(),
        change: z.string(),
        magnitude_estimate: z.string().min(1).optional(),
      }),
    )
    .min(1),
  addresses: z.array(z.object({ symptom: z.string(), phase: z.string().optional() })).default([]),
  conditions: z.object({
    amplified_on: z.array(z.string()).default([]),
    reduced_on: z.array(z.string()).default([]),
  }),
  counter_indications: z.array(z.string()).default([]),
  magnitude_guidance: z.string(),
  // M1-M3: optional hard-safety caveat surfaced verbatim into rendered advice.
  danger: z.string().optional(),
  // R2-3: OPTIONAL quantification fields — validated-if-present, absent → current
  // behaviour. mechanism_brief is a one-line physics string; lap_time_impact_s is
  // a positive, finite estimated lap-time gain (SURFACE-ONLY, never reorders).
  mechanism_brief: z.string().min(1).optional(),
  lap_time_impact_s: z.number().positive().finite().optional(),
  reversal_cost_minutes: z.number().positive(),
  confidence: z.enum(["high", "medium", "low"]),
  sources: z.array(z.string()).min(1),
  scope: z.array(z.string()).min(1),
});

// kb/chassis/registry.json — schema/cars.ts ChassisRegistryEntry is the contract
// for the REQUIRED fields; the KB builder's extra fields (power_types,
// template_status, provenance, …) pass through untouched. Accepts a bare
// array or { entries: [...] }.
const RegistryEntrySchema = z
  .object({
    chassis_id: z.string().min(1),
    template_id: z.string().min(1),
    brand: z.string(),
    model: z.string(),
    category: z.string(),
    scale: z.string(),
    type: z.string(),
    default_power_type: z.enum(["nitro", "brushless"]),
  })
  .passthrough();
const RegistryFileSchema = z.union([
  z.array(RegistryEntrySchema),
  z.object({ entries: z.array(RegistryEntrySchema) }),
]);

// kb/classes/*.json — tolerant: the engine only requires class_id; the rest of
// the shape is owned by the KB builder and passes through untouched.
const ClassDefSchema = z.object({ class_id: z.string().min(1) }).passthrough();
const ClassFileSchema = z.union([ClassDefSchema, z.array(ClassDefSchema)]);

export function loadKBData(): KBData {
  const rulesDir = join(KB_DIR, "rules");
  const rules: KBRule[] = [];
  for (const file of readdirSync(rulesDir).filter((f) => f.endsWith(".yaml"))) {
    const docs = parse(readFileSync(join(rulesDir, file), "utf8")) as unknown[];
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

  // kb/chassis/registry.json — OPTIONAL (lands in parallel); validated when present
  let registry: ChassisRegistryEntry[] | undefined;
  const registryPath = join(chassisDir, "registry.json");
  if (existsSync(registryPath)) {
    const raw = RegistryFileSchema.parse(JSON.parse(readFileSync(registryPath, "utf8")));
    registry = (Array.isArray(raw) ? raw : raw.entries) as ChassisRegistryEntry[];
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
  };
  assertValidKBData(data);
  return data;
}
