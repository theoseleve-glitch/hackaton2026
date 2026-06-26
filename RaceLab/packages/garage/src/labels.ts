import type { CarEntity } from "./types";

/**
 * D26 typology label engine — a dumb deterministic mapping from a car's
 * typology to sheet customization. The app applies the result by plain
 * string lookup (section ids for hiding, field ids for label overrides);
 * this module never sees the sheet schema itself.
 */

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

/**
 * Pick the KB template id the engine should reason over for this car's typology.
 * Returns a per-model template when we have one, else a CATEGORY template id the
 * engine resolves (resolveTemplate accepts category ids directly) — so an
 * on-road car NEVER lands on the off-road `generic-offroad` template and gets
 * off-road rules fired at it, and every on-road rule pack stays reachable.
 *
 * Every id returned here must exist in the bundled KB (templates ∪
 * categoryTemplates) — packages/garage/test-garage cross-checks that against
 * the real bundle, so a typo or a renamed category template fails the suite.
 */
export function templateIdForCar(
  car: Pick<CarEntity, "brand" | "model" | "category" | "scale" | "power" | "drivetrain">,
): string {
  const m = `${car.brand} ${car.model}`.toLowerCase();
  if (m.includes("mp11") || m.includes("inferno")) return "kyosho-inferno-mp11";

  const electric = car.power === "electric";

  // On-road: route by scale to the matching on-road category scaffold. Never
  // off-road scope (the bug this function exists to kill).
  if (car.category === "onroad") {
    if (car.scale === "1/8") return "1_8_gt";
    if (car.scale === "1/12") return "1_12_pan";
    if (car.scale === "1/10") return electric ? "1_10_touring_electric" : "1_10_nitro_onroad";
    return "1_10_touring_electric"; // default on-road
  }

  // Off-road by category, then scale/power/drivetrain.
  if (car.category === "truggy") return "1_8_truggy";
  if (car.category === "stadium_truck") return "stadium_truck";
  if (car.category === "sc") return "short_course";
  // buggy (and any other off-road category)
  if (car.scale === "1/8") return electric ? "1_8_offroad_electric" : "1_8_offroad_nitro";
  if (car.scale === "1/10") return car.drivetrain === "2wd" ? "1_10_offroad_2wd" : "1_10_offroad_4wd";
  return "generic-offroad";
}

/** Deterministic rules; badge order is fixed: scale, power, category, brand. */
export function sheetProfile(car: CarEntity): SheetProfile {
  const hidden_sections: string[] = [];
  const label_overrides: Record<string, string> = {};
  const badges: string[] = [car.scale];

  if (car.power === "nitro") {
    hidden_sections.push("electronics");
    label_overrides.gearing = "Clutch bell / Spur";
    badges.push("NITRO");
  } else {
    hidden_sections.push("engine");
    label_overrides.gearing = "Pinion / Spur";
    badges.push("EP");
  }

  const category = CATEGORY_BADGES[car.category];
  if (category !== undefined) badges.push(category);

  const brand = car.brand.toLowerCase();
  if (BRAND_BADGES.has(brand)) badges.push(brand.toUpperCase());

  return { hidden_sections, label_overrides, badges };
}
