import type { Surface, Track, TrackTurn } from "../../schema/src/index";
import { SURFACES } from "../../schema/src/index";
import type { CornerFeature, CornerShape, CornerSpec } from "./types";

/**
 * Bridge: schema-`Track` facts → engine taxonomy condition vocabulary, plus the
 * theo `CornerSpec` ⇄ schema `TrackTurn` mappers the form and the engine bridge
 * use. ONLY values from CONDITION_VOCABULARY are ever emitted — traits without a
 * taxonomy equivalent surface through trackCharacterNotes instead, never as
 * invented tags (grounded-or-silent, D18 discipline).
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

/** theo trait string → taxonomy condition tag (free-string traits now). */
const TRAIT_TO_CONDITION: Record<string, string> = {
  bumpy: "bumpy",
  smooth: "smooth",
  dusty: "dusty",
  technical_tight: "technical_tight",
  fast_open: "fast_open",
  big_jumps: "big_jumps",
};

/** Fraction of corners carrying bump/rut at which the whole track reads bumpy+rough. */
const BUMPY_CORNER_RATIO = 0.3;

/** Deterministic condition tags for a track: trait mappings, plus ≥30% of
 *  corners with bumpy turns → bumpy + rough, plus any jump-section corner →
 *  big_jumps. Output deduplicated and ordered by the taxonomy vocabulary. */
export function trackConditionTags(track: Track): string[] {
  const tags = new Set<string>();
  for (const trait of track.traits ?? []) {
    const tag = TRAIT_TO_CONDITION[trait];
    if (tag !== undefined) tags.add(tag);
  }
  const turns = track.turns ?? [];
  if (turns.length > 0) {
    const bumpy = turns.filter((tn) => tn.bumps === "rough" || tn.bumps === "medium").length;
    if (bumpy / turns.length >= BUMPY_CORNER_RATIO) {
      tags.add("bumpy");
      tags.add("rough");
    }
  }
  if (turns.some((tn) => tn.corner_type === "jump_section")) tags.add("big_jumps");
  return CONDITION_VOCABULARY.filter((t) => tags.has(t));
}

const TRAIT_TO_NOTE: Record<string, string> = {
  banked: "banked corners",
  off_camber: "off-camber sections",
  slopes: "elevation changes",
  high_kerbs: "kerbs in play",
  mixed_surface: "mixed surface",
};
const TRAIT_NOTE_ORDER = ["banked", "off_camber", "slopes", "high_kerbs", "mixed_surface"];

/** Human-readable notes for traits with NO taxonomy equivalent — deterministic
 *  order, deduplicated. A track whose turns carry more than one distinct
 *  surface additionally notes "mixed surface track" (grounded-or-silent). */
export function trackCharacterNotes(track: Track): string[] {
  const notes: string[] = [];
  const traits = track.traits ?? [];
  for (const trait of TRAIT_NOTE_ORDER) {
    if (traits.includes(trait)) notes.push(TRAIT_TO_NOTE[trait]);
  }
  const surfaces = new Set<string>([track.surface]);
  for (const tn of track.turns ?? []) if (tn.surface_override) surfaces.add(tn.surface_override);
  if (surfaces.size > 1) notes.push("mixed surface track");
  return notes;
}

// ── surface narrowing (rich app id → schema Surface) ────────────────────────

/** Best-effort map from theo's rich surface id vocabulary to the closed schema
 *  Surface union. Keyword-based; defaults to "clay" (the dominant 1/8 offroad
 *  surface). DEFERRED (William): the rich sub-classification collapses to one
 *  of six schema surfaces — a track-level rich-surface field is a schema gap. */
export function toSchemaSurface(id: string | undefined): Surface {
  if (id !== undefined && (SURFACES as readonly string[]).includes(id)) return id as Surface;
  const s = (id ?? "").toLowerCase();
  if (s.includes("carpet")) return "carpet";
  if (s.includes("astro") || s.includes("turf")) return "astro";
  if (s.includes("grass")) return "grass";
  if (s.includes("loam") || s.includes("sand") || s.includes("loose") || s.includes("sugar")) return "loam";
  if (
    s.includes("hard") ||
    s.includes("blue_groove") ||
    s.includes("groove") ||
    s.includes("asphalt") ||
    s.includes("concrete") ||
    s.includes("tarmac") ||
    s.includes("tile") ||
    s.includes("wood") ||
    s.includes("abrasive")
  ) {
    return "hard-packed";
  }
  return "clay";
}

// ── CornerSpec ⇄ TrackTurn ──────────────────────────────────────────────────

const SHAPE_TO_CORNER_TYPE: Record<CornerShape, TrackTurn["corner_type"]> = {
  hairpin: "hairpin",
  ninety: "other",
  sweeper: "sweeper",
  chicane: "chicane",
  kink: "kink",
  esses: "rhythm_section",
};
const CORNER_TYPE_TO_SHAPE: Partial<Record<TrackTurn["corner_type"], CornerShape>> = {
  hairpin: "hairpin",
  sweeper: "sweeper",
  chicane: "chicane",
  kink: "kink",
  rhythm_section: "esses",
};

/** A theo corner name/note round-trips through TrackTurn.notes with a marker so
 *  the form can split the two halves back out. */
const NAME_SEP = ""; // unlikely in user text; never rendered

function packNotes(name?: string, note?: string): string | undefined {
  if (name === undefined && note === undefined) return undefined;
  return `${name ?? ""}${NAME_SEP}${note ?? ""}`;
}
function unpackNotes(notes: string | undefined): { name?: string; note?: string } {
  if (notes === undefined) return {};
  const i = notes.indexOf(NAME_SEP);
  if (i === -1) return { note: notes || undefined };
  const name = notes.slice(0, i) || undefined;
  const note = notes.slice(i + 1) || undefined;
  return { name, note };
}

/** Map one theo CornerSpec → a schema TrackTurn. features drive bumps/banking,
 *  surface (free string) narrows to surface_override, name+note packed into
 *  notes (so the form round-trips). */
export function turnFromCorner(c: CornerSpec): TrackTurn {
  const bumpy = c.features.includes("bump") || c.features.includes("rut") || c.features.includes("dip");
  const banking = c.features.includes("off_camber")
    ? ("off_camber" as const)
    : c.features.includes("banked") || c.features.includes("slope_up") || c.features.includes("slope_down")
      ? ("banked" as const)
      : undefined;
  const corner_type: TrackTurn["corner_type"] =
    c.shape !== undefined
      ? SHAPE_TO_CORNER_TYPE[c.shape]
      : c.features.includes("jump")
        ? "jump_section"
        : "other";
  const notes = packNotes(c.name, c.note);
  return {
    n: c.n,
    direction: c.direction === "left" ? "L" : "R",
    corner_type: c.features.includes("jump") ? "jump_section" : corner_type,
    ...(bumpy ? { bumps: "rough" as const } : {}),
    ...(banking !== undefined ? { banking } : {}),
    ...(c.surface !== undefined && c.surface.trim() !== "" ? { surface_override: toSchemaSurface(c.surface) } : {}),
    ...(notes !== undefined ? { notes } : {}),
  };
}

/** Map one schema TrackTurn → a theo CornerSpec (form view). Best-effort: bumps
 *  → "bump" feature, banking → banked/off_camber, jump_section → jump feature. */
export function cornerFromTurn(tn: TrackTurn): CornerSpec {
  const features: CornerFeature[] = [];
  if (tn.bumps === "rough" || tn.bumps === "medium") features.push("bump");
  if (tn.banking === "off_camber") features.push("off_camber");
  else if (tn.banking === "banked") features.push("banked");
  if (tn.corner_type === "jump_section") features.push("jump");
  const { name, note } = unpackNotes(tn.notes);
  const shape = CORNER_TYPE_TO_SHAPE[tn.corner_type];
  return {
    n: tn.n,
    ...(name !== undefined ? { name } : {}),
    direction: tn.direction === "L" ? "left" : "right",
    ...(shape !== undefined ? { shape } : {}),
    features,
    ...(tn.surface_override !== undefined ? { surface: tn.surface_override } : {}),
    ...(note !== undefined ? { note } : {}),
  };
}

/** The theo corner view of a schema Track (form/engine bridge). */
export function cornersOf(track: Track): CornerSpec[] {
  return (track.turns ?? []).map(cornerFromTurn);
}
