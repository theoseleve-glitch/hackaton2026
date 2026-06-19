import type { ChassisTemplate, KBRule, Taxonomy } from "./types";

/**
 * KBData is the engine's entire knowledge, as plain data (D18).
 * Node tooling loads it from packages/kb via node-kb.ts; the app imports
 * the pre-compiled packages/kb/bundle.json. The advice path never touches
 * the filesystem or the network.
 */
export interface KBData {
  rules: KBRule[];
  taxonomy: Taxonomy;
  templates: Record<string, ChassisTemplate>;
}

export function getTemplate(data: KBData, templateId: string): ChassisTemplate {
  const template = data.templates[templateId];
  if (!template) {
    throw new Error(
      `Unknown chassis template '${templateId}' (have: ${Object.keys(data.templates).join(", ")})`,
    );
  }
  return template;
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

/** Throws if the bundle is internally inconsistent. Call once at startup. */
export function assertValidKBData(data: KBData): void {
  const errors = validateRulesAgainstTaxonomy(data.rules, data.taxonomy);
  const ids = new Set<string>();
  for (const r of data.rules) {
    if (ids.has(r.id)) errors.push(`Duplicate KB rule id: ${r.id}`);
    ids.add(r.id);
  }
  if (errors.length > 0) throw new Error(`KB validation failed:\n${errors.join("\n")}`);
}
