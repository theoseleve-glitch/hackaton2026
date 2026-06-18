/**
 * D26 — the multi-car garage, now backed by the canonical schema `Car`
 * (packages/schema). The garage no longer owns a parallel CarEntity shape:
 * `CarEntity` is the schema `Car`, and `GarageState` is just `{ cars: Car[] }`.
 *
 * Identity facts (brand/model/category/scale) live on the schema registry for
 * registry-known chassis, OR — since the app ships NO chassis registry yet —
 * on `Car.custom` for app-minted cars (chassis_id = CUSTOM_CHASSIS_ID). The
 * label/subtitle engine (labels.ts) reads them through `carLabels()`, which
 * prefers a registry entry and falls back to `Car.custom`.
 *
 * Power note: theo's UI vocab is "nitro" | "electric"; schema's PowerType is
 * "nitro" | "brushless". The form bridge maps electric↔brushless at the
 * mint/read seam (powerLabel/powerFromUi in labels.ts) — the stored fact is
 * always the schema PowerType.
 */

import type { Car } from "../../schema/src/cars";

/** The garage car IS the schema Car. */
export type CarEntity = Car;

/** UI-facing power vocabulary (theo). Schema stores "nitro" | "brushless". */
export type PowerType = "nitro" | "electric";

export interface GarageState {
  cars: Car[]; // chronological, oldest first
}
