import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { z } from "zod";
import type { ChassisTemplate, KBRule, Taxonomy } from "./types.js";

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

export function loadRules(): KBRule[] {
  const rulesDir = join(KB_DIR, "rules");
  const rules: KBRule[] = [];
  for (const file of readdirSync(rulesDir).filter((f) => f.endsWith(".yaml"))) {
    const docs = parse(readFileSync(join(rulesDir, file), "utf8")) as unknown[];
    for (const doc of docs) {
      rules.push(RuleSchema.parse(doc) as KBRule);
    }
  }
  const ids = new Set<string>();
  for (const r of rules) {
    if (ids.has(r.id)) throw new Error(`Duplicate KB rule id: ${r.id}`);
    ids.add(r.id);
  }
  return rules;
}

export function loadTaxonomy(): Taxonomy {
  return parse(readFileSync(join(KB_DIR, "taxonomy.yaml"), "utf8")) as Taxonomy;
}

export function loadChassisTemplate(templateId: string): ChassisTemplate {
  const file = join(KB_DIR, "chassis", `${templateId.replace(/^kyosho-/, "")}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as ChassisTemplate;
}

export function validateRulesAgainstTaxonomy(rules: KBRule[], taxonomy: Taxonomy): string[] {
  const symptoms = new Set(taxonomy.symptoms.map((s) => s.id));
  const phases = new Set(taxonomy.phases.map((p) => p.id));
  const conditions = new Set(taxonomy.conditions);
  const errors: string[] = [];
  for (const r of rules) {
    for (const a of r.addresses) {
      if (!symptoms.has(a.symptom)) errors.push(`${r.id}: unknown symptom '${a.symptom}'`);
      if (a.phase && !phases.has(a.phase)) errors.push(`${r.id}: unknown phase '${a.phase}'`);
    }
    for (const c of [...r.conditions.amplified_on, ...r.conditions.reduced_on]) {
      if (!conditions.has(c)) errors.push(`${r.id}: unknown condition '${c}'`);
    }
    for (const ci of r.counter_indications) {
      if (!symptoms.has(ci)) errors.push(`${r.id}: unknown counter-indication '${ci}'`);
    }
  }
  return errors;
}
