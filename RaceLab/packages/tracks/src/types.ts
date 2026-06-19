/**
 * D25 — tracks as first-class entities. A track is the stable half of every
 * run's context: corners and traits are facts about the venue, records are
 * the best laps ever set there (auto-updated from run results). Almost every
 * field is optional — a track must be creatable trackside in seconds — but
 * what IS captured is structured so the engine can reason over it.
 */

export type TrackVisibility = "private" | "public";

export type CornerDirection = "left" | "right";

export type CornerShape = "hairpin" | "ninety" | "sweeper" | "chicane" | "kink" | "esses";

export const CORNER_FEATURES = [
  "bump",
  "dip",
  "kerb",
  "slope_up",
  "slope_down",
  "off_camber",
  "banked",
  "jump",
  "rut",
] as const;
export type CornerFeature = (typeof CORNER_FEATURES)[number];

export const TRACK_TRAITS = [
  "bumpy",
  "smooth",
  "high_kerbs",
  "banked",
  "off_camber",
  "slopes",
  "big_jumps",
  "dusty",
  "mixed_surface",
  "technical_tight",
  "fast_open",
] as const;
export type TrackTrait = (typeof TRACK_TRAITS)[number];

export interface CornerSpec {
  /** corner number on the track map, 1-based */
  n: number;
  direction: CornerDirection;
  shape?: CornerShape;
  features: CornerFeature[];
  /** overrides the track surface for this corner (mixed-surface tracks) */
  surface?: string;
  note?: string;
}

export interface LapRecord {
  /** car category the record belongs to (e.g. "1/8 nitro buggy") */
  category: string;
  /** free-form qualifier ("dry", "wet evening"); records are keyed by category+conditions */
  conditions?: string;
  lap_s: number;
  holder?: string;
  date?: string; // ISO
}

export interface TrackEntity {
  id: string;
  name: string;
  surface: string; // clay / hard-packed / loam / astro / carpet / grass
  indoor: boolean;
  visibility: TrackVisibility;
  gps?: { lat: number; lon: number };
  length_m?: number;
  width_m?: number;
  traits: TrackTrait[];
  corners: CornerSpec[];
  notes?: string;
  photo_uris?: string[];
  records: LapRecord[];
  created_at: string; // ISO
}

export interface TracksState {
  tracks: TrackEntity[]; // chronological, oldest first
}
