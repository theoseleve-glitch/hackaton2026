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
  /** Category-template setup-page scaffolds (kb/chassis/categories/*.json),
   *  keyed by template_id. A `pending_pdf` registry entry resolves to one of
   *  these via its `category_template`; the engine gates advice on the resolved
   *  template's fields — class-level precision until a per-model sheet exists. */
  categoryTemplates?: Record<string, ChassisTemplate>;
}

/** Resolve a chassis id to the template the engineer reasons over: a bundled
 *  `full` per-model template by template_id, else (for a `pending_pdf` model)
 *  the category template named by its registry `category_template`, else a
 *  category-template id used DIRECTLY (the app routes a car with no per-model
 *  template to its class scaffold — e.g. an on-road car to "1_8_gt" — so it gets
 *  class-correct advice instead of the off-road generic). Returns undefined when
 *  none resolve — the caller refuses in-band, never throws. */
export function resolveTemplate(data: KBData, id: string): ChassisTemplate | undefined {
  const direct = data.templates[id];
  if (direct) return direct;
  const entry = data.registry?.find((e) => e.chassis_id === id || e.template_id === id);
  const ct = (entry as { category_template?: string } | undefined)?.category_template;
  if (ct && data.categoryTemplates) return data.categoryTemplates[ct];
  return data.categoryTemplates?.[id];
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
  const scopes = taxonomy.scopes ? new Set(taxonomy.scopes) : undefined;
  for (const r of rules) {
    for (const a of r.addresses) {
      if (!symptoms.has(a.symptom)) errors.push(`${r.id}: unknown symptom '${a.symptom}'`);
      if (a.phase && !phases.has(a.phase)) errors.push(`${r.id}: unknown phase '${a.phase}'`);
    }
    for (const c of [...r.conditions.amplified_on, ...r.conditions.reduced_on, ...(r.forbidden_on ?? [])]) {
      if (!conditions.has(c)) errors.push(`${r.id}: unknown condition '${c}'`);
    }
    for (const p of r.legal_in_power ?? []) {
      if (!conditions.has(p)) errors.push(`${r.id}: unknown power tag '${p}'`);
    }
    for (const ci of r.counter_indications) {
      if (!symptoms.has(ci)) errors.push(`${r.id}: unknown counter-indication '${ci}'`);
    }
    // scope tags must be drawn from the taxonomy vocabulary (no silent misfires)
    if (scopes) for (const s of r.scope) {
      if (!scopes.has(s)) errors.push(`${r.id}: unknown scope tag '${s}'`);
    }
  }
  return errors;
}

/** Every template/categoryTemplate scope tag must be a declared scope (so a rule
 *  and a template can actually intersect). Only enforced once taxonomy.scopes
 *  exists. */
export function validateScopes(data: KBData): string[] {
  const errors: string[] = [];
  const scopes = data.taxonomy.scopes ? new Set(data.taxonomy.scopes) : undefined;
  if (!scopes) return errors;
  const check = (label: string, t: ChassisTemplate) => {
    for (const s of t.scope ?? []) {
      if (!scopes.has(s)) errors.push(`${label} '${t.template_id}': unknown scope tag '${s}'`);
    }
  };
  for (const t of Object.values(data.templates)) check("template", t);
  for (const t of Object.values(data.categoryTemplates ?? {})) check("categoryTemplate", t);
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
      // a non-full entry's setup-page scaffold must resolve to a bundled
      // category template (only checked once category templates are bundled)
      const catT = (e as { category_template?: unknown }).category_template;
      if (typeof catT === "string" && data.categoryTemplates && !data.categoryTemplates[catT]) {
        errors.push(`registry: '${e.chassis_id}' category_template '${catT}' is not bundled`);
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
  errors.push(...validateScopes(data));
  if (errors.length > 0) throw new Error(`KB validation failed:\n${errors.join("\n")}`);
}
