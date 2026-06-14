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
