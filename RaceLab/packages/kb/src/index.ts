/**
 * packages/kb validators — pure functions that make malformed KB data a build
 * error (the standing-orders invariant "a KB rule that fails taxonomy
 * validation is a build error" extended to the registry/class layer).
 *
 * Ownership split:
 *  - packages/schema owns the SHAPES (`ChassisRegistryEntry`, section ids,
 *    `PowerType`) — frozen contract, imported below.
 *  - THIS package owns the kb extras (`power_types`, `template_status`,
 *    `template_file`, `provenance`) and the canonical class-facet VOCABULARY.
 *    The example facet values in schema cars.ts comments / test fixture
 *    ("buggy", "offroad-competition") are placeholders, not vocabulary;
 *    `sectionApplies` matches raw strings and fails CLOSED, so everything that
 *    authors `when` conditions must use the FACET_* values validated here.
 *
 * Zero I/O, zero node built-ins, zero runtime deps — callers hand in parsed
 * JSON as `unknown`; results are discriminated (`ok:false` carries a stable
 * reason, mirroring schema parse.ts), nothing throws across the boundary.
 * Unknown extra keys are tolerated (forward compatibility), validated values
 * are deep-frozen in place.
 */

import type { ChassisRegistryEntry, PowerType } from "../../schema/src/index";
import {
  BRUSHLESS_SECTIONS,
  COMMON_SECTIONS,
  NITRO_SECTIONS,
  POWER_TYPES,
} from "../../schema/src/index";

// ── canonical class-facet vocabulary (kb owns the VALUES) ────────────────────

/** New classes extend these arrays — one commit: class json + here + tests.
 *  Widened (2026-06-16) from the 1/8-buggy seed to the full competitive scene:
 *  category = racing surface; type = body/discipline; scale = nominal class. */
export const FACET_CATEGORIES = ["offroad", "onroad"] as const;
export const FACET_SCALES = ["1/8", "1/10", "1/12", "1/5"] as const;
export const FACET_TYPES = [
  "buggy",
  "truggy",
  "short_course",
  "stadium_truck",
  "monster_truck",
  "gt",
  "touring",
  "pan",
  "f1",
  "crawler",
  "rally",
] as const;

export const TEMPLATE_STATUSES = ["full", "pending_pdf"] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

/** Ids of the kb category templates (chassis/categories/*.json). A registry
 *  entry's optional `category_template` must name one of these — it is the
 *  setup-page scaffold a non-`full` model resolves to. New category template =
 *  one commit: the json + here + tests (same drift-is-a-build-error rule). */
export const CATEGORY_TEMPLATES = [
  "1_8_offroad_nitro",
  "1_8_offroad_electric",
  "1_8_truggy",
  "1_8_gt",
  "1_10_offroad_2wd",
  "1_10_offroad_4wd",
  "stadium_truck",
  "short_course",
  "1_10_touring_electric",
  "1_10_nitro_onroad",
  "1_12_pan",
  "f1",
  "large_scale_1_5",
  "monster_truck",
  "crawler",
  "rally",
] as const;

// ── shapes ───────────────────────────────────────────────────────────────────

/** A row of kb/chassis/registry.json: the frozen schema contract plus kb
 *  extras. Pass rows verbatim as the `registry` argument of schema
 *  `makeCar`/`classLabels` (KbChassisRegistryEntry extends the contract). */
export interface KbChassisRegistryEntry extends ChassisRegistryEntry {
  power_types: readonly PowerType[];
  template_status: TemplateStatus;
  /** Full entries only. Forward-looking metadata — the engine joins templates
   *  by `template_id`; when resolved, the path is relative to `kb/chassis/`
   *  (the registry's own directory). */
  template_file?: string;
  /** Non-`full` entries: the category template that backs this model's setup
   *  page (one of CATEGORY_TEMPLATES). */
  category_template?: string;
  /** Where each identity fact was verified (grounding rule: no source → no entry). */
  provenance: string;
}

/** A kb/classes/*.json declaration. Section ids must come from the schema
 *  buckets (COMMON/NITRO/BRUSHLESS_SECTIONS); facets from the FACET_* vocab. */
export interface KbClassDecl {
  class_id: string;
  label: string;
  category: string;
  scale: string;
  type: string;
  power_types: readonly PowerType[];
  sections: {
    common: readonly string[];
    nitro: readonly string[];
    brushless: readonly string[];
  };
  notes?: string;
}

export type KbParseResult<T> = { ok: true; value: T } | { ok: false; reason: string };

// ── internal helpers (pure) ──────────────────────────────────────────────────

type Rec = Record<string, unknown>;

function isRecord(v: unknown): v is Rec {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function nonEmptyStr(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}
function inEnum(arr: readonly string[], v: unknown): boolean {
  return typeof v === "string" && arr.includes(v);
}
function no(field: string): { ok: false; reason: string } {
  return { ok: false, reason: `invalid:${field}` };
}
function isPowerTypeList(v: unknown): v is readonly PowerType[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every((p) => inEnum(POWER_TYPES, p)) &&
    new Set(v).size === v.length
  );
}
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}
/** A section bucket must EQUAL its schema array exactly — same length, same
 *  element order. The class declaration drives the sheet's render order, so a
 *  reordered or short-but-valid bucket is malformed (it would silently desync
 *  the sheet from the schema). Subset/no-dup is not enough; require identity. */
function sectionListBad(v: unknown, bucket: readonly string[]): boolean {
  return !(
    Array.isArray(v) &&
    v.length === bucket.length &&
    v.every((id, i) => id === bucket[i])
  );
}

// ── validators ───────────────────────────────────────────────────────────────

/** Validate the full registry file (a bare array). Stable reasons:
 *  "not_an_array", "duplicate:[i].chassis_id", "invalid:[i].<field>". */
export function parseChassisRegistry(
  value: unknown,
): KbParseResult<readonly KbChassisRegistryEntry[]> {
  if (!Array.isArray(value)) return { ok: false, reason: "not_an_array" };
  const seen = new Set<string>();
  for (let i = 0; i < value.length; i++) {
    const e: unknown = value[i];
    if (!isRecord(e)) return no(`[${i}]`);
    if (!nonEmptyStr(e.chassis_id)) return no(`[${i}].chassis_id`);
    if (seen.has(e.chassis_id)) return { ok: false, reason: `duplicate:[${i}].chassis_id` };
    seen.add(e.chassis_id);
    if (!nonEmptyStr(e.template_id)) return no(`[${i}].template_id`);
    if (!nonEmptyStr(e.brand)) return no(`[${i}].brand`);
    if (!nonEmptyStr(e.model)) return no(`[${i}].model`);
    if (!inEnum(FACET_CATEGORIES, e.category)) return no(`[${i}].category`);
    if (!inEnum(FACET_SCALES, e.scale)) return no(`[${i}].scale`);
    if (!inEnum(FACET_TYPES, e.type)) return no(`[${i}].type`);
    if (!inEnum(POWER_TYPES, e.default_power_type)) return no(`[${i}].default_power_type`);
    if (!isPowerTypeList(e.power_types) || !e.power_types.includes(e.default_power_type as PowerType)) {
      return no(`[${i}].power_types`);
    }
    if (!inEnum(TEMPLATE_STATUSES, e.template_status)) return no(`[${i}].template_status`);
    const wantsFile = e.template_status === "full";
    if (wantsFile ? !nonEmptyStr(e.template_file) : e.template_file !== undefined) {
      return no(`[${i}].template_file`);
    }
    if (e.category_template !== undefined && !inEnum(CATEGORY_TEMPLATES, e.category_template)) {
      return no(`[${i}].category_template`);
    }
    if (!nonEmptyStr(e.provenance)) return no(`[${i}].provenance`);
  }
  return { ok: true, value: deepFreeze(value) as unknown as readonly KbChassisRegistryEntry[] };
}

/** Validate one kb/classes/*.json declaration. Stable reasons:
 *  "not_an_object", "invalid:<field path>". */
export function parseClassDecl(value: unknown): KbParseResult<KbClassDecl> {
  if (!isRecord(value)) return { ok: false, reason: "not_an_object" };
  if (!nonEmptyStr(value.class_id)) return no("class_id");
  if (!nonEmptyStr(value.label)) return no("label");
  if (!inEnum(FACET_CATEGORIES, value.category)) return no("category");
  if (!inEnum(FACET_SCALES, value.scale)) return no("scale");
  if (!inEnum(FACET_TYPES, value.type)) return no("type");
  if (!isPowerTypeList(value.power_types)) return no("power_types");
  const s = value.sections;
  if (!isRecord(s)) return no("sections");
  if (sectionListBad(s.common, COMMON_SECTIONS)) return no("sections.common");
  if (sectionListBad(s.nitro, NITRO_SECTIONS)) return no("sections.nitro");
  if (sectionListBad(s.brushless, BRUSHLESS_SECTIONS)) return no("sections.brushless");
  if (value.notes !== undefined && typeof value.notes !== "string") return no("notes");
  return { ok: true, value: deepFreeze(value) as unknown as KbClassDecl };
}
