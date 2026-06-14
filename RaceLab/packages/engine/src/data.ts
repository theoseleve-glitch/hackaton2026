import type { ChassisTemplate, KBRule, Taxonomy } from "./types";
import type { ChassisRegistryEntry } from "../../schema/src/cars";

export type { ChassisRegistryEntry };

/** A car-class definition from kb/classes/*.json. Shape is owned by the KB
 *  builder; the engine only requires the identity key and passes the rest
 *  through (tolerant by design — the files land in parallel). */
export interface KBClassDef {
  class_id: string;
  [k: string]: unknown;
}

/**
 * KBData is the engine's entire knowledge, as plain data (D18).
 * Node tooling loads it from packages/kb via node-kb.ts; the app imports
 * the pre-compiled packages/kb/bundle.json. The advice path never touches
 * the filesystem or the network.
 *
 * `registry` (kb/chassis/registry.json) and `classes` (kb/classes/*.json) are
 * ADDITIVE and OPTIONAL — the engine works identically without them; when
 * present they are validated like everything else (a malformed entry is a
 * build error, not a warning).
 */
export interface KBData {
  rules: KBRule[];
  taxonomy: Taxonomy;
  templates: Record<string, ChassisTemplate>;
  /** Chassis → template mapping + class labels (schema owns the shape). */
  registry?: ChassisRegistryEntry[];
  /** Car-class definitions keyed by class_id. */
  classes?: Record<string, KBClassDef>;
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

/** Registry/classes cross-checks (only when present — both are optional).
 *  Registry entries may reference templates that are not extracted yet
 *  (`template_status: "pending_pdf"` in the KB's registry.json) — only an
 *  entry that CLAIMS a full template must actually resolve to one. */
export function validateRegistryAndClasses(data: KBData): string[] {
  const errors: string[] = [];
  if (data.registry) {
    const seen = new Set<string>();
    for (const e of data.registry) {
      if (seen.has(e.chassis_id)) errors.push(`registry: duplicate chassis_id '${e.chassis_id}'`);
      seen.add(e.chassis_id);
      const status = (e as { template_status?: unknown }).template_status;
      if (status === "full" && !data.templates[e.template_id]) {
        errors.push(
          `registry: '${e.chassis_id}' claims a full template but '${e.template_id}' is not bundled`,
        );
      }
    }
  }
  if (data.classes) {
    for (const [key, def] of Object.entries(data.classes)) {
      if (def.class_id !== key) {
        errors.push(`classes: key '${key}' does not match class_id '${def.class_id}'`);
      }
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
  errors.push(...validateRegistryAndClasses(data));
  if (errors.length > 0) throw new Error(`KB validation failed:\n${errors.join("\n")}`);
}
