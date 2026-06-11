import type { TrackEntity, TrackTrait } from "./types";

/**
 * Bridge: track facts → engine taxonomy condition vocabulary. ONLY values
 * from CONDITION_VOCABULARY are ever emitted — traits without a taxonomy
 * equivalent surface through trackCharacterNotes instead, never as invented
 * tags (grounded-or-silent, D18 discipline).
 */

/** Closed engine taxonomy condition list — the only emittable tag values. */
const CONDITION_VOCABULARY = [
  "low_grip",
  "high_grip",
  "blue_groove",
  "dusty",
  "wet",
  "bumpy",
  "rough",
  "smooth",
  "technical_tight",
  "fast_open",
  "big_jumps",
  "hot",
  "cold",
] as const;

const TRAIT_TO_CONDITION: Partial<Record<TrackTrait, string>> = {
  bumpy: "bumpy",
  smooth: "smooth",
  dusty: "dusty",
  technical_tight: "technical_tight",
  fast_open: "fast_open",
  big_jumps: "big_jumps",
};

/** Fraction of corners carrying bump/rut at which the whole track reads bumpy+rough. */
const BUMPY_CORNER_RATIO = 0.3;

/**
 * Deterministic condition tags for a track: trait mappings, plus ≥30% of
 * corners featuring bump/rut → bumpy + rough, plus any corner featuring
 * jump → big_jumps. Output is deduplicated and ordered by the taxonomy
 * vocabulary, independent of trait/corner input order.
 */
export function trackConditionTags(track: TrackEntity): string[] {
  const tags = new Set<string>();
  for (const trait of track.traits) {
    const tag = TRAIT_TO_CONDITION[trait];
    if (tag !== undefined) tags.add(tag);
  }
  if (track.corners.length > 0) {
    const bumpyCorners = track.corners.filter((c) =>
      c.features.some((f) => f === "bump" || f === "rut"),
    ).length;
    if (bumpyCorners / track.corners.length >= BUMPY_CORNER_RATIO) {
      tags.add("bumpy");
      tags.add("rough");
    }
  }
  if (track.corners.some((c) => c.features.includes("jump"))) tags.add("big_jumps");
  return CONDITION_VOCABULARY.filter((t) => tags.has(t));
}

const TRAIT_TO_NOTE: Partial<Record<TrackTrait, string>> = {
  banked: "banked corners",
  off_camber: "off-camber sections",
  slopes: "elevation changes",
  high_kerbs: "kerbs in play",
  mixed_surface: "mixed surface",
};

/**
 * Human-readable notes for traits with NO taxonomy equivalent — shown by the
 * app and echoed by the engineer in diagnosis context. Deterministic order
 * (TRACK_TRAITS declaration order via TRAIT_TO_NOTE), deduplicated.
 */
export function trackCharacterNotes(track: TrackEntity): string[] {
  const notes: string[] = [];
  for (const trait of Object.keys(TRAIT_TO_NOTE) as TrackTrait[]) {
    if (track.traits.includes(trait)) notes.push(TRAIT_TO_NOTE[trait] as string);
  }
  return notes;
}
