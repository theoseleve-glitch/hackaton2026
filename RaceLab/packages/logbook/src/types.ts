import type { FeedbackTag } from "../../engine/src/types";

/**
 * Layer 1 — the Run Log (the base product, D22). A run connects:
 *   setup version + track + conditions + tyres + result + driver feedback
 * That connection is what makes every other layer (comparison, engineer
 * report, learning loop) possible. Almost every field is optional — trackside
 * logging must survive "10 minutes before your heat" — but what IS captured
 * is structured so the deterministic engine can reason over it.
 */

export type Grip = "green" | "medium" | "high" | "blue_groove";
export type Bumpiness = "smooth" | "medium" | "rough";
export type TrackEvolution = "improving" | "stable" | "degrading";
export type Sky = "sunny" | "cloudy" | "rain_risk" | "raining";
export type TyreWear = "new" | "light" | "medium" | "worn";
export type RunType = "practice" | "qualifier" | "main";
export type Outcome = "better" | "same" | "worse";
export type Traffic = "clear" | "some" | "heavy";

export interface TrackInfo {
  name: string;
  surface: string; // clay / hard-packed / loam / astro / carpet / grass
  indoor: boolean;
  layout?: string;
}

export interface RunConditions {
  grip: Grip;
  bumpiness?: Bumpiness;
  dusty?: boolean;
  sky?: Sky;
  evolution?: TrackEvolution;
  air_temp_c?: number;
  track_temp_c?: number;
  humidity_pct?: number;
  wind_kmh?: number;
  pressure_hpa?: number;
  /** 0–100 sunshine */
  sun_pct?: number;
}

export interface TyreSet {
  brand?: string;
  compound?: string;
  insert?: string;
  sauce?: string;
  wear?: TyreWear;
  run_count?: number;
}

export interface RunResult {
  best_lap_s?: number;
  avg_lap_s?: number;
  /** 0–100; lap-to-lap consistency. Manual in V1 (timing import is exploratory). */
  consistency_pct?: number;
  laps?: number;
  position?: number;
  mistakes?: number;
  /** 1 (fighting the car) … 5 (could drive it all day) */
  driver_confidence?: number;
  traffic?: Traffic;
  tyre_state_after?: string;
  /** individual lap times (seconds), driving order. Stats come from lapStats
   *  ON DEMAND — never auto-written into best_lap_s/avg_lap_s (user wins). */
  laps_list?: number[];
  fuel_used_cc?: number;
}

export interface RunFeedback {
  tags: FeedbackTag[]; // taxonomy-validated (symptom, phase?, evolution?)
  text?: string;
  /** per-corner observations; corner numbered from the track map */
  corner_notes?: { corner: number; note: string }[];
}

export interface RunEntry {
  id: string;
  created_at: string; // ISO
  type: RunType;
  /** chassis template of the car driven (garage is single-car MP11 today) */
  car_template_id: string;
  /** the EXACT setup version on the car — references sheets SetupVersion.id */
  setup_version_id: string;
  /** denormalized label so the log renders without resolving the sheet */
  setup_name: string;
  track: TrackInfo;
  conditions: RunConditions;
  tyres?: TyreSet;
  result?: RunResult;
  feedback: RunFeedback;
  note?: string;
  /** learning loop: how did this run feel vs the previous one (after a change)? */
  outcome?: Outcome;
  /** garage car instance (multi-car future); car_template_id stays authoritative for the engine */
  car_id?: string;
  /** stable track reference (track DB future); track.name stays the display source */
  track_id?: string;
  /** 0–100 driver-feel slider */
  feeling?: number;
  /** 1 (fresh) … 5 (exhausted) */
  fatigue?: number;
}

export interface LogbookState {
  runs: RunEntry[]; // chronological, oldest first
}
