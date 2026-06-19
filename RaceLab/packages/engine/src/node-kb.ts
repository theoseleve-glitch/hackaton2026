import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { z } from "zod";
import { assertValidKBData, type KBData } from "./data";
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
});

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
    (f) => f.endsWith(".json") && !f.includes("pdf-map") && f !== "bundle.json",
  )) {
    const template = JSON.parse(readFileSync(join(chassisDir, file), "utf8")) as ChassisTemplate;
    templates[template.template_id] = template;
  }

  const data: KBData = { rules, taxonomy, templates };
  assertValidKBData(data);
  return data;
}
