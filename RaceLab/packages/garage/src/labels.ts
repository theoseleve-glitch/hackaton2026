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
  const electric = car.power === "electric";
  const onroad = car.category === "onroad";

  // Per-model FULL template only for the off-road MP11 it actually covers. Gate
  // on NOT-on-road and match "mp11" only (not the bare "inferno" substring) — an
  // Inferno GT is on-road and must follow its category, and an MP10 is not an
  // MP11, so both fall through to category routing.
  if (!onroad && `${car.brand} ${car.model}`.toLowerCase().includes("mp11")) {
    return "kyosho-inferno-mp11";
  }

  // Large scale has its own scaffold whatever the category.
  if (car.scale === "1/5") return "large_scale_1_5";

  switch (car.category) {
    case "onroad":
      if (car.scale === "1/8") return "1_8_gt";
      if (car.scale === "1/12") return "1_12_pan";
      return electric ? "1_10_touring_electric" : "1_10_nitro_onroad"; // 1/10 (+ default)
    case "truggy":
      return "1_8_truggy";
    case "stadium_truck":
      return "stadium_truck";
    case "sc":
      return "short_course";
    case "crawler":
      return "crawler";
    case "monster_truck":
    case "mt":
      return "monster_truck";
    case "rally":
      return "rally";
    case "f1":
      return "f1";
    case "buggy": {
      if (car.scale === "1/8") return electric ? "1_8_offroad_electric" : "1_8_offroad_nitro";
      // 1/10 buggy: route to the 4WD scaffold ONLY when drivetrain is explicitly
      // 4wd. Unset/2wd → the 2WD template, which exposes no centre/front diff, so
      // the worst case is a missing 4WD-specific rule — never recommending a part
      // a 2WD car physically lacks (grounded or silent about hardware).
      if (car.scale === "1/10") return car.drivetrain === "4wd" ? "1_10_offroad_4wd" : "1_10_offroad_2wd";
      return "generic-offroad"; // other-scale buggy
    }
    default:
      // Unknown/freeform off-road category: the drivetrain/scale-agnostic
      // off-road scaffold (renderable; the known on/off-road categories above are
      // all handled, so this only catches genuinely freeform input).
      return "generic-offroad";
  }
}

/** The car typology fields that determine its KB template. */
export type CarTypology = Pick<CarEntity, "brand" | "model" | "category" | "scale" | "power" | "drivetrain">;

/**
 * The template_id to persist when saving a car. Re-derives from the CURRENT
 * typology when the stored id is missing, the old `generic-offroad` sentinel, or
 * itself a derivation of the car's PREVIOUS typology — so editing a car's
 * category/scale/power follows through to the engine AND the setup sheet, never
 * leaving an on-road car stuck on its old off-road template. Only a genuine
 * NON-derivation override (an imported payload template, or a hand-set per-model
 * id that no typology produces) is preserved.
 */
export function templateIdOnSave(prev: CarEntity | undefined, next: CarTypology): string {
  const stored = prev?.template_id;
  if (stored && stored !== "generic-offroad" && stored !== templateIdForCar(prev as CarTypology)) {
    return stored;
  }
  return templateIdForCar(next);
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
