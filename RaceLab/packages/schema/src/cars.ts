/**
 * Cars (garage) — a Car is a fact about a PHYSICAL car (conversions exist),
 * chassis design facts live in the kb chassis registry. Class labels
 * (category/scale/type) are READ from the registry via `classLabels`, never
 * stored on the car — one source of truth per fact.
 *
 * Conditional sheet sections come in two layers:
 *  - `sheetSections(power)`: the built-in default split
 *    (common ∪ nitro: engine/clutch/fuel/exhaust | brushless: esc/motor/gearing/battery)
 *  - declarative `SheetSection.when` predicates (`sectionApplies`/`visibleSections`)
 *    for kb templates that ship their own section lists — additive, the existing
 *    MP11 kb json stays valid unchanged.
 */

import type { IsoDateTime, PowerType } from "./vocab";
import { deepFreeze } from "./vocab";
import type { CarId } from "./ids";
import { isoToMs, makeId } from "./ids";

/** Contract the kb bundle's chassis registry must satisfy (engine owns the data; schema owns the shape). */
export interface ChassisRegistryEntry {
  chassis_id: string;
  template_id: string; // engine ChassisTemplate.template_id
  brand: string;
  model: string;
  category: string; // "buggy" | "truggy" | ...
  scale: string; //    "1/8" | "1/10" | ...
  type: string; //     "offroad-competition" | ...
  default_power_type: PowerType;
}

export interface CarClassLabels {
  category: string;
  scale: string;
  type: string;
}

export interface Car {
  id: CarId;
  name: string;
  chassis_id: string; // key into the kb chassis registry
  power_type: PowerType;
  transponder_id?: string; // MyLaps/Speedhive transponder number
  photo_uri?: string; // local URI (offline-first)
  notes?: string;
  created_at: IsoDateTime;
}

export interface MakeCarInput {
  name: string;
  chassis_id: string;
  power_type: PowerType;
  transponder_id?: string;
  photo_uri?: string;
  notes?: string;
}

export type CarRejectReason = "empty_name" | "unknown_chassis";

/** Reserved chassis_id that bypasses the registry check: the escape hatch for
 *  drivers whose chassis isn't extracted yet (Mugen/Associated/TLR ten minutes
 *  before a heat). classLabels returns null for it, so class-facet sections
 *  fail closed; the default power-type sheetSections split still applies. */
export const CUSTOM_CHASSIS_ID = "custom";

/** Build a frozen Car. When a registry is provided the chassis_id must resolve
 *  (reject "unknown_chassis") — except the reserved CUSTOM_CHASSIS_ID, which is
 *  always accepted; without a registry the reference is taken on faith. */
export function makeCar(
  input: MakeCarInput,
  now: IsoDateTime,
  registry?: readonly ChassisRegistryEntry[],
  rand?: () => number,
): { ok: true; car: Car } | { ok: false; reason: CarRejectReason } {
  const name = input.name.trim();
  if (name === "") return { ok: false, reason: "empty_name" };
  if (
    registry !== undefined &&
    input.chassis_id !== CUSTOM_CHASSIS_ID &&
    !registry.some((e) => e.chassis_id === input.chassis_id)
  ) {
    return { ok: false, reason: "unknown_chassis" };
  }
  const car: Car = deepFreeze({
    id: makeId("car", isoToMs(now), rand),
    name,
    chassis_id: input.chassis_id,
    power_type: input.power_type,
    ...(input.transponder_id !== undefined ? { transponder_id: input.transponder_id } : {}),
    ...(input.photo_uri !== undefined ? { photo_uri: input.photo_uri } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    created_at: now,
  });
  return { ok: true, car };
}

/** Class labels are READ from the registry, never stored on the car. */
export function classLabels(
  car: Pick<Car, "chassis_id">,
  registry: readonly ChassisRegistryEntry[],
): CarClassLabels | null {
  const entry = registry.find((e) => e.chassis_id === car.chassis_id);
  if (!entry) return null;
  return Object.freeze({ category: entry.category, scale: entry.scale, type: entry.type });
}

// ── Conditional sheet sections ───────────────────────────────────────────────

export const COMMON_SECTIONS = [
  "front_suspension",
  "rear_suspension",
  "diffs",
  "tyres",
  "geometry",
  "electronics_radio",
] as const;
export type CommonSectionId = (typeof COMMON_SECTIONS)[number];

export const NITRO_SECTIONS = ["engine", "clutch", "fuel_system", "exhaust"] as const;
export type NitroSectionId = (typeof NITRO_SECTIONS)[number];

export const BRUSHLESS_SECTIONS = ["esc", "motor", "gearing", "battery"] as const;
export type BrushlessSectionId = (typeof BRUSHLESS_SECTIONS)[number];

export type SheetSectionId = CommonSectionId | NitroSectionId | BrushlessSectionId;

const NITRO_SHEET: readonly SheetSectionId[] = Object.freeze([...COMMON_SECTIONS, ...NITRO_SECTIONS]);
const BRUSHLESS_SHEET: readonly SheetSectionId[] = Object.freeze([...COMMON_SECTIONS, ...BRUSHLESS_SECTIONS]);

/** Built-in default: common ∪ power-type-specific sections, in render order. */
export function sheetSections(power: PowerType): readonly SheetSectionId[] {
  return power === "nitro" ? NITRO_SHEET : BRUSHLESS_SHEET;
}

/** Declarative conditional section, layered ADDITIVELY on a chassis template —
 *  templates without `sections` keep using the default `sheetSections` split. */
export interface SheetSection {
  id: string;
  label: string;
  fields: readonly string[]; // keys of the chassis template's fields
  when?: SectionCondition; // absent ⇒ always visible
}

export interface SectionCondition {
  power_type?: readonly PowerType[];
  category?: readonly string[];
  scale?: readonly string[];
  type?: readonly string[];
}

export interface SectionContext {
  power_type: PowerType;
  labels?: CarClassLabels | null; // from classLabels(car, registry)
}

/** Pure predicate: every present facet of `when` must match the car's context.
 *  A facet constraint with no labels available fails CLOSED (section hidden) —
 *  showing a nitro-only section on an unknown car is worse than hiding it. */
export function sectionApplies(when: SectionCondition | undefined, ctx: SectionContext): boolean {
  if (when === undefined) return true;
  if (when.power_type !== undefined && !when.power_type.includes(ctx.power_type)) return false;
  const labels = ctx.labels ?? null;
  if (when.category !== undefined && (labels === null || !when.category.includes(labels.category))) return false;
  if (when.scale !== undefined && (labels === null || !when.scale.includes(labels.scale))) return false;
  if (when.type !== undefined && (labels === null || !when.type.includes(labels.type))) return false;
  return true;
}

export function visibleSections(
  sections: readonly SheetSection[],
  ctx: SectionContext,
): readonly SheetSection[] {
  return Object.freeze(sections.filter((s) => sectionApplies(s.when, ctx)));
}
