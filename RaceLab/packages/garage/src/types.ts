/**
 * D26 — the multi-car garage. A car is the anchor entity every other layer
 * hangs off (sheets reference its template, runs reference the car driven).
 * Almost every field is optional — adding a car must survive "10 minutes
 * before your heat" — but power/category/scale are required because they
 * drive the typology label engine (labels.ts) deterministically.
 */

export type PowerType = "nitro" | "electric";

export interface CarEntity {
  id: string;
  name: string;
  template_id: string; // e.g. "kyosho-inferno-mp11" or "generic-offroad"
  brand: string;
  model: string;
  category: string; // "buggy" | "truggy" | "stadium_truck" | "sc" | "onroad" | freeform
  scale: string; // "1/8", "1/10", ...
  drivetrain?: "4wd" | "2wd";
  power: PowerType;
  engine?: string;
  motor?: string;
  esc?: string;
  battery?: string;
  weight_g?: number;
  options?: string;
  /** fuel tank capacity in centiliters — the pilot's unit (1 cL = 10 cc);
   *  nitro, feeds race strategy */
  fuel_tank_cl?: number;
  /** @deprecated v1 field in cubic centimeters — kept for migration only;
   *  format-2 blobs carry fuel_tank_cl (cc / 10) instead */
  fuel_tank_cc?: number;
  transponder?: string; // Speedhive chip number (integration deferred, D31)
  photo_uri?: string;
  notes?: string;
  created_at: string; // ISO
}

export interface GarageState {
  cars: CarEntity[]; // chronological, oldest first
}
