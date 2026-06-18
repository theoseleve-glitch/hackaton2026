/**
 * D25 — tracks as first-class entities, now backed by the canonical schema
 * `Track` (packages/schema). `TrackEntity` IS the schema `Track`; `TracksState`
 * is `{ tracks: Track[] }`. `LapRecord` IS the schema `TrackRecord`.
 *
 * Mapping from theo's pre-schema shape (documented in 2026-06-18-schema-
 * extension-B1a.md), applied at the form/op seam:
 *  - `corners: CornerSpec[]`  → `Track.turns` (direction left/right → L/R,
 *    shape → corner_type, features[] → bumps/banking/surface_override).
 *    The reverse view for the form is `cornersOf(track)` (conditions.ts).
 *  - `visibility "private"|"public"` → `Track.is_public` (public → true).
 *  - `traits: string[]` → `Track.traits` (free strings — schema does not couple
 *    to theo's closed TRACK_TRAITS list).
 *  - `surface` (rich app id) → `Track.surface` narrowed to the schema Surface
 *    union via `toSchemaSurface()` (see conditions.ts). DEFERRED (William): a
 *    track-level multi-surface list; the rich pick collapses to one Surface.
 */

import type { Surface, TrackRecord as SchemaTrackRecord, Track } from "../../schema/src/index";

/** The track entity IS the schema Track. */
export type TrackEntity = Track;

/** A lap record IS the schema TrackRecord ({ class, best_lap_s, holder?, date?,
 *  source, conditions? }). */
export type LapRecord = SchemaTrackRecord;

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

/** Theo's open trait list — kept for the form's chip palette. Stored as free
 *  strings on `Track.traits` (schema does not enforce this list). */
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

/** Theo's corner view — the form authors corners in this shape; the op layer
 *  maps it to/from `Track.turns`. */
export interface CornerSpec {
  /** corner number on the track map, 1-based */
  n: number;
  /** pilot's name for the corner ("le triple", "hairpin du fond") */
  name?: string;
  direction: CornerDirection;
  shape?: CornerShape;
  features: CornerFeature[];
  /** overrides the track surface for this corner (mixed-surface tracks);
   *  narrowed to a schema Surface on the way into Track.turns.surface_override */
  surface?: string;
  note?: string;
}

export interface TracksState {
  tracks: Track[]; // chronological, oldest first
}

export type { Surface };
