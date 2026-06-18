/**
 * Tracks — robust track entity with an optional turn-by-turn model, append-only
 * records (the current best is COMPUTED via `bestRecord`, never marked), and a
 * frozen `TrackSnapshot` that gets stamped onto runs/outcomes at log time so a
 * later rename/relayout can never falsify history (D22 doctrine).
 *
 * The snapshot INCLUDES the turns so per-turn feedback survives a layout rebuild.
 */

import type { Bumpiness, IsoDate, IsoDateTime, Surface } from "./vocab";
import { deepFreeze, isFiniteNum } from "./vocab";
import type { TrackId } from "./ids";
import { isoToMs, makeId } from "./ids";

export const TURN_DIRECTIONS = ["L", "R"] as const;
export type TurnDirection = (typeof TURN_DIRECTIONS)[number];

export const CORNER_TYPES = [
  "hairpin",
  "sweeper",
  "chicane",
  "kink",
  "double",
  "straight",
  "jump_section",
  "rhythm_section",
  "other",
] as const;
export type CornerType = (typeof CORNER_TYPES)[number];

export const BANKINGS = ["flat", "banked", "off_camber"] as const;
export type Banking = (typeof BANKINGS)[number];

export const TRACK_RECORD_SOURCES = ["manual", "speedhive"] as const;
export type TrackRecordSource = (typeof TRACK_RECORD_SOURCES)[number];

export interface TrackTurn {
  n: number; // 1-based turn number, unique within the track — per-turn feedback joins on this
  direction: TurnDirection;
  corner_type: CornerType;
  bumps?: Bumpiness; // reuses Theo's scale — ONE bumpiness vocab everywhere
  banking?: Banking;
  surface_override?: Surface; // e.g. astro jump faces on a clay track
  notes?: string;
}

export interface TrackRecord {
  class: string; // free label, e.g. "1/8 nitro buggy"
  best_lap_s: number;
  holder?: string;
  date?: IsoDate;
  source: TrackRecordSource;
  /** theo product field (Phase 2B-B1a); pending William ratification.
   *  Free-form conditions qualifier ("dry", "wet evening") — records are
   *  keyed by class+conditions in theo's model. */
  conditions?: string;
}

export interface Gps {
  lat: number; // [-90, 90]
  lon: number; // [-180, 180]
}

export interface Track {
  id: TrackId;
  name: string;
  gps?: Gps;
  surface: Surface;
  indoor: boolean;
  is_public: boolean; // sharing flag ("Strava of RC"); publishing itself is a sync concern
  layout?: string; // layout/revision label — bump it when the club rebuilds
  turns?: readonly TrackTurn[];
  /** theo product field (Phase 2B-B1a); pending William ratification.
   *  Venue trait tags (e.g. "bumpy", "big_jumps", "technical_tight"). Free
   *  strings here — schema does not couple to theo's TRACK_TRAITS closed list. */
  traits?: readonly string[];
  records: readonly TrackRecord[]; // APPEND-ONLY; the current best is computed, never marked
  photos?: readonly string[]; // local URIs (offline-first)
  notes?: string;
  created_at: IsoDateTime;
}

/** Frozen identity snapshot stamped onto sessions/runs/outcomes — survives
 *  renames/relayouts. Records/photos stay OUT (they are track-level facts,
 *  not run-time conditions). */
export interface TrackSnapshot {
  track_id: TrackId;
  name: string; // denormalized: history renders even if the tracks store is reset
  surface: Surface;
  indoor: boolean;
  layout?: string;
  turns?: readonly TrackTurn[]; // per-turn feedback survives a layout rebuild
}

export interface MakeTrackInput {
  name: string;
  surface: Surface;
  indoor: boolean;
  is_public: boolean;
  gps?: Gps;
  layout?: string;
  turns?: readonly TrackTurn[];
  /** theo product field (Phase 2B-B1a); pending William ratification. */
  traits?: readonly string[];
  records?: readonly TrackRecord[];
  photos?: readonly string[];
  notes?: string;
}

export type TrackRejectReason =
  | "empty_name"
  | "empty_class"
  | "duplicate_turn_n"
  | "non_finite_numeric"
  | "out_of_range";

export type RecordRejectReason = "empty_class" | "non_finite_numeric" | "out_of_range";

/** Shared turn-list guard: finite, integer >= 1, unique `n`. Used by makeTrack
 *  AND by makeRun/makeOutcomeRecord on caller-supplied snapshots — a hand-built
 *  TrackSnapshot must clear the exact same bar as a registered Track (a NaN
 *  turn number would silently neuter the per-turn feedback join forever). */
export function turnsReject(
  turns: readonly TrackTurn[],
): "non_finite_numeric" | "out_of_range" | "duplicate_turn_n" | null {
  const seen = new Set<number>();
  for (const t of turns) {
    if (!isFiniteNum(t.n)) return "non_finite_numeric";
    if (!Number.isInteger(t.n) || t.n < 1) return "out_of_range";
    if (seen.has(t.n)) return "duplicate_turn_n";
    seen.add(t.n);
  }
  return null;
}

/** Build a frozen Track. Rejects NaN/Infinity numerics at write time (the
 *  never-wipe guarantee depends on it), out-of-range gps, duplicate turn numbers. */
export function makeTrack(
  input: MakeTrackInput,
  now: IsoDateTime,
  rand?: () => number,
): { ok: true; track: Track } | { ok: false; reason: TrackRejectReason } {
  const name = input.name.trim();
  if (name === "") return { ok: false, reason: "empty_name" };

  if (input.gps !== undefined) {
    const bad = gpsReject(input.gps);
    if (bad !== null) return { ok: false, reason: bad };
  }

  if (input.turns !== undefined) {
    const bad = turnsReject(input.turns);
    if (bad !== null) return { ok: false, reason: bad };
  }

  for (const r of input.records ?? []) {
    const bad = recordReject(r);
    if (bad !== null) return { ok: false, reason: bad };
  }

  const track: Track = deepFreeze({
    id: makeId("trk", isoToMs(now), rand),
    name,
    ...(input.gps !== undefined ? { gps: { ...input.gps } } : {}),
    surface: input.surface,
    indoor: input.indoor,
    is_public: input.is_public,
    ...(input.layout !== undefined ? { layout: input.layout } : {}),
    ...(input.turns !== undefined ? { turns: input.turns.map((t) => ({ ...t })) } : {}),
    ...(input.traits !== undefined ? { traits: [...input.traits] } : {}),
    records: (input.records ?? []).map((r) => ({ ...r })),
    ...(input.photos !== undefined ? { photos: [...input.photos] } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    created_at: now,
  });
  return { ok: true, track };
}

/** Append-only record write: returns a NEW frozen track, the input is untouched. */
export function addTrackRecord(
  track: Track,
  record: TrackRecord,
): { ok: true; track: Track } | { ok: false; reason: RecordRejectReason } {
  const bad = recordReject(record);
  if (bad !== null) return { ok: false, reason: bad };
  const next: Track = deepFreeze({
    ...track,
    records: [...track.records, { ...record }],
  });
  return { ok: true, track: next };
}

/** Computed best per class from the append-only records list (lowest lap;
 *  ties keep the earliest appended). Null when the class has no record. */
export function bestRecord(track: Track, klass: string): TrackRecord | null {
  let best: TrackRecord | null = null;
  for (const r of track.records) {
    if (r.class !== klass) continue;
    if (best === null || r.best_lap_s < best.best_lap_s) best = r;
  }
  return best;
}

/** Frozen, detached identity snapshot for stamping onto runs/outcomes. */
export function snapshotTrack(track: Track): TrackSnapshot {
  return deepFreeze({
    track_id: track.id,
    name: track.name,
    surface: track.surface,
    indoor: track.indoor,
    ...(track.layout !== undefined ? { layout: track.layout } : {}),
    ...(track.turns !== undefined ? { turns: track.turns.map((t) => ({ ...t })) } : {}),
  });
}

function gpsReject(gps: Gps): TrackRejectReason | null {
  if (!isFiniteNum(gps.lat) || !isFiniteNum(gps.lon)) return "non_finite_numeric";
  if (gps.lat < -90 || gps.lat > 90 || gps.lon < -180 || gps.lon > 180) return "out_of_range";
  return null;
}

function recordReject(r: TrackRecord): RecordRejectReason | null {
  if (r.class.trim() === "") return "empty_class";
  if (!isFiniteNum(r.best_lap_s)) return "non_finite_numeric";
  if (r.best_lap_s <= 0) return "out_of_range";
  return null;
}
