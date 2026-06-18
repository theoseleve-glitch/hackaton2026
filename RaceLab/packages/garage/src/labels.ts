import type { Car, ChassisRegistryEntry } from "../../schema/src/cars";
import { classLabels } from "../../schema/src/cars";
import type { PowerType } from "./types";

/**
 * D26 typology label engine — a dumb deterministic mapping from a car's
 * typology to sheet customization, now reading identity facts off the schema
 * `Car` via `carLabels()` (registry-first, `Car.custom` fallback). The app
 * applies the result by plain string lookup (section ids for hiding, field ids
 * for label overrides); this module never sees the sheet schema itself.
 */

/** Resolved, render-ready identity facts for a car. brand/model are display
 *  strings; category/scale drive badges and the typology subtitle. */
export interface CarLabels {
  brand: string;
  model: string;
  category: string;
  scale: string;
}

/** UI power label (theo vocab) from the schema PowerType. */
export function powerLabel(car: Pick<Car, "power_type">): PowerType {
  return car.power_type === "nitro" ? "nitro" : "electric";
}

/** Schema PowerType from the UI vocab (form mint seam). */
export function powerFromUi(p: PowerType): Car["power_type"] {
  return p === "nitro" ? "nitro" : "brushless";
}

/** Identity facts for a car: a registry entry wins (single source of truth for
 *  registry-known chassis); otherwise `Car.custom` (app-minted cars). Missing
 *  fields read as empty strings so renderers never print "undefined". */
export function carLabels(car: Car, registry?: readonly ChassisRegistryEntry[]): CarLabels {
  const reg = registry !== undefined ? classLabels(car, registry) : null;
  const entry = registry?.find((e) => e.chassis_id === car.chassis_id);
  return {
    brand: entry?.brand ?? car.custom?.brand ?? "",
    model: entry?.model ?? car.custom?.model ?? "",
    category: reg?.category ?? car.custom?.category ?? "",
    scale: reg?.scale ?? car.custom?.scale ?? "",
  };
}

export interface SheetProfile {
  hidden_sections: string[];
  label_overrides: Record<string, string>;
  badges: string[];
}

/** Brands badged on the sheet header (matched case-insensitively). */
const BRAND_BADGES = new Set(["kyosho", "mugen", "xray", "tekno", "associated", "tlr"]);

const CATEGORY_BADGES: Record<string, string> = {
  buggy: "BUGGY",
  truggy: "TRUGGY",
  stadium_truck: "TT",
};

/** Deterministic rules; badge order is fixed: scale, power, category, brand.
 *  Reads identity facts through `carLabels(car, registry)`. */
export function sheetProfile(car: Car, registry?: readonly ChassisRegistryEntry[]): SheetProfile {
  const labels = carLabels(car, registry);
  const hidden_sections: string[] = [];
  const label_overrides: Record<string, string> = {};
  const badges: string[] = labels.scale ? [labels.scale] : [];

  if (car.power_type === "nitro") {
    hidden_sections.push("electronics");
    label_overrides.gearing = "Clutch bell / Spur";
    badges.push("NITRO");
  } else {
    hidden_sections.push("engine");
    label_overrides.gearing = "Pinion / Spur";
    badges.push("EP");
  }

  const category = CATEGORY_BADGES[labels.category];
  if (category !== undefined) badges.push(category);

  const brand = labels.brand.toLowerCase();
  if (BRAND_BADGES.has(brand)) badges.push(brand.toUpperCase());

  return { hidden_sections, label_overrides, badges };
}

/** One-line typology subtitle, "1/8 nitro buggy · 4WD" style: scale, power and
 *  humanized category (underscores → spaces) joined by spaces, missing parts
 *  skipped; drivetrain appended uppercased after a " · " separator. */
export function carSubtitle(car: Car, registry?: readonly ChassisRegistryEntry[]): string {
  const labels = carLabels(car, registry);
  const main = [labels.scale, powerLabel(car), labels.category.replace(/_/g, " ")]
    .filter((p) => p.length > 0)
    .join(" ");
  const drive = car.drivetrain?.toUpperCase();
  return [main, drive].filter((p): p is string => !!p && p.length > 0).join(" · ");
}
