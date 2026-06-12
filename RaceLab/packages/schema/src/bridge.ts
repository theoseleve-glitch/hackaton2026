/**
 * Bridge — one-shot lifts from the two LEGACY run/outcome models into the
 * canonical schema model (runs.ts):
 *
 *  - packages/sessions (D22 app store): Run / OutcomeRecord / TrackInfo where
 *    grip lives ON the track and conditions is a string[] of taxonomy tags
 *  - Theo's packages/logbook (origin/theo/racelab): RunEntry with TrackInfo
 *    (surface: string), `result` instead of `timing`, no session/car linkage
 *
 * The input shapes below are STRUCTURAL copies — this package keeps zero
 * runtime deps; the real sessions/logbook types are assignable to them as-is.
 * Lifts run through makeRun/makeOutcomeRecord, so every write-time guard
 * applies; ids/timestamps are minted from the legacy `at`/`created_at`, and
 * the synthesized linkage ids (track/session/car) are passed ONCE per store
 * in the context. Lifting is a migration, not a sync: run it once during the
 * B0 unification merge, keep the id mapping, then retire the legacy store —
 * the shared ss/run/oc prefixes mean two live stores would be
 * runtime-indistinguishable.
 */

import type { Outcome, RunType, Surface, Traffic } from "./vocab";
import { SURFACES, TYRE_WEARS } from "./vocab";
import type { TyreWear } from "./vocab";
import type { CarId, SessionId, TrackId } from "./ids";
import type { TrackSnapshot } from "./tracks";
import type {
  FeedbackTag,
  MakeOutcomeInput,
  MakeRunInput,
  OutcomeRecord,
  OutcomeRejectReason,
  RunConditions,
  RunEntry,
  RunRejectReason,
  RunTimingInput,
} from "./runs";
import { makeOutcomeRecord, makeRun } from "./runs";

// ── packages/sessions shapes (structural) ────────────────────────────────────

/** sessions.TrackInfo — grip lives on the track; conditions are taxonomy tags. */
export interface SessionsTrackInfo {
  name: string;
  surface: Surface;
  grip: RunConditions["grip"];
  conditions: readonly string[];
}

/** sessions.Run (timing was summary-only: best lap + count). */
export interface SessionsRun {
  id: string;
  at: string; // ISO
  type: RunType;
  setup_version_id: string;
  setup_name: string;
  track: SessionsTrackInfo;
  best_lap_s?: number;
  lap_count?: number;
  feedback_text?: string;
}

/** sessions.OutcomeRecord (no run_id linkage existed). */
export interface SessionsOutcomeRecord {
  id: string;
  at: string; // ISO
  setting: string;
  change: string;
  citations: readonly string[];
  outcome: Outcome;
  setup_version_id: string;
  setup_name: string;
  track: SessionsTrackInfo;
  note?: string;
}

/** Per-store constants for a sessions lift — synthesize the ids ONCE (e.g.
 *  makeId("trk"/"car", store_created_ms)) and reuse them for every entry so
 *  lifted history keeps joining. */
export interface SessionsLiftContext {
  track_id: TrackId;
  session_id: SessionId; // the sessions Session.id is already "ss-…"-shaped
  car_id: CarId;
  car_name: string; // outcome records REQUIRE it (see OutcomeRecord.car_name)
  car_template_id: string; // single-car era: the active chassis template id
  /** sessions never recorded indoor; defaults false (outdoor dominates 1/8 offroad). */
  indoor?: boolean;
}

/** Documented reverse of conditionsToTags — only the unambiguous tags map back:
 *  dusty → dusty:true; smooth/bumpy/rough → bumpiness; wet → sky "raining".
 *  Grip tags are ignored (track.grip is authoritative), hot/cold are ignored
 *  (a temperature cannot be honestly synthesized from a tag), unknown tags drop. */
export function conditionsFromTags(track: SessionsTrackInfo): RunConditions {
  const c: { -readonly [K in keyof RunConditions]: RunConditions[K] } = { grip: track.grip };
  for (const tag of track.conditions) {
    if (tag === "dusty") c.dusty = true;
    else if (tag === "smooth") c.bumpiness = "smooth";
    else if (tag === "bumpy") c.bumpiness = "medium";
    else if (tag === "rough") c.bumpiness = "rough";
    else if (tag === "wet") c.sky = "raining";
  }
  return c;
}

function sessionsSnapshot(track: SessionsTrackInfo, ctx: SessionsLiftContext): TrackSnapshot {
  return {
    track_id: ctx.track_id,
    name: track.name,
    surface: track.surface,
    indoor: ctx.indoor ?? false,
  };
}

/** Lift a sessions.Run into a canonical RunEntry (fresh run- id minted from
 *  the legacy timestamp; full makeRun validation applies). */
export function liftSessionsRun(
  run: SessionsRun,
  ctx: SessionsLiftContext,
  rand?: () => number,
): { ok: true; run: RunEntry } | { ok: false; reason: RunRejectReason } {
  const hasSummary = run.best_lap_s !== undefined || run.lap_count !== undefined;
  const timing: RunTimingInput | undefined = hasSummary
    ? {
        kind: "summary",
        result: {
          ...(run.best_lap_s !== undefined ? { best_lap_s: run.best_lap_s } : {}),
          ...(run.lap_count !== undefined ? { laps: run.lap_count } : {}),
        },
      }
    : undefined;
  const input: MakeRunInput = {
    type: run.type,
    session_id: ctx.session_id,
    car_id: ctx.car_id,
    car_name: ctx.car_name,
    car_template_id: ctx.car_template_id,
    setup_version_id: run.setup_version_id,
    setup_name: run.setup_name,
    track: sessionsSnapshot(run.track, ctx),
    conditions: conditionsFromTags(run.track),
    ...(timing !== undefined ? { timing } : {}),
    feedback: {
      tags: [],
      ...(run.feedback_text !== undefined && run.feedback_text.trim() !== ""
        ? { text: run.feedback_text }
        : {}),
    },
  };
  return makeRun(input, run.at, rand);
}

/** Lift a sessions.OutcomeRecord into a canonical OutcomeRecord. */
export function liftSessionsOutcome(
  outcome: SessionsOutcomeRecord,
  ctx: SessionsLiftContext,
  rand?: () => number,
): { ok: true; record: OutcomeRecord } | { ok: false; reason: OutcomeRejectReason } {
  const input: MakeOutcomeInput = {
    session_id: ctx.session_id,
    car_id: ctx.car_id,
    car_name: ctx.car_name,
    setting: outcome.setting,
    change: outcome.change,
    citations: outcome.citations,
    outcome: outcome.outcome,
    setup_version_id: outcome.setup_version_id,
    setup_name: outcome.setup_name,
    track: sessionsSnapshot(outcome.track, ctx),
    conditions: conditionsFromTags(outcome.track),
    ...(outcome.note !== undefined ? { note: outcome.note } : {}),
  };
  return makeOutcomeRecord(input, outcome.at, rand);
}

// ── Theo's logbook shapes (structural) ───────────────────────────────────────

export interface TheoTrackInfo {
  name: string;
  surface: string; // free string in his model — narrowed to Surface on lift
  indoor: boolean;
  layout?: string;
}

export interface TheoRunResult {
  best_lap_s?: number;
  avg_lap_s?: number;
  consistency_pct?: number;
  laps?: number;
  position?: number;
  mistakes?: number;
  driver_confidence?: number;
  traffic?: Traffic;
  tyre_state_after?: string; // free string in his model — narrowed to TyreWear or dropped
}

export interface TheoTyreSet {
  brand?: string;
  compound?: string;
  insert?: string;
  sauce?: string;
  wear?: string; // narrowed to TyreWear or dropped
  run_count?: number;
}

export interface TheoRunEntry {
  id: string;
  created_at: string; // ISO
  type: RunType;
  car_template_id: string;
  setup_version_id: string;
  setup_name: string;
  track: TheoTrackInfo;
  conditions: RunConditions; // verbatim-compatible vocabulary
  tyres?: TheoTyreSet;
  result?: TheoRunResult;
  feedback: { tags: readonly FeedbackTag[]; text?: string };
  note?: string;
  outcome?: Outcome;
}

export interface TheoLiftContext {
  track_id: TrackId; // synthesized once per store
  session_id: SessionId; // synthesized once per store
  car_id: CarId; // synthesized once per store
  car_name?: string;
}

export type TheoLiftRejectReason = RunRejectReason | "unknown_surface";

function asTyreWear(v: string | undefined): TyreWear | undefined {
  return v !== undefined && (TYRE_WEARS as readonly string[]).includes(v) ? (v as TyreWear) : undefined;
}

/** Lift one of Theo's logbook RunEntries — performs the FULL merge mapping
 *  documented in the runs.ts header: result → timing summary (his
 *  driver_confidence normalizes into DriverState via makeRun), TrackInfo →
 *  TrackSnapshot with the synthesized track_id, free-string surface narrowed
 *  to the Surface union (unknown → reject), free-string tyre wear fields
 *  narrowed to TyreWear (unknown → DROP the field, never the run). */
export function liftTheoRunEntry(
  entry: TheoRunEntry,
  ctx: TheoLiftContext,
  rand?: () => number,
): { ok: true; run: RunEntry } | { ok: false; reason: TheoLiftRejectReason } {
  if (!(SURFACES as readonly string[]).includes(entry.track.surface)) {
    return { ok: false, reason: "unknown_surface" };
  }
  const track: TrackSnapshot = {
    track_id: ctx.track_id,
    name: entry.track.name,
    surface: entry.track.surface as Surface,
    indoor: entry.track.indoor,
    ...(entry.track.layout !== undefined ? { layout: entry.track.layout } : {}),
  };

  let timing: RunTimingInput | undefined;
  if (entry.result !== undefined) {
    const r = entry.result;
    const wearAfter = asTyreWear(r.tyre_state_after);
    timing = {
      kind: "summary",
      result: {
        ...(r.best_lap_s !== undefined ? { best_lap_s: r.best_lap_s } : {}),
        ...(r.avg_lap_s !== undefined ? { avg_lap_s: r.avg_lap_s } : {}),
        ...(r.consistency_pct !== undefined ? { consistency_pct: r.consistency_pct } : {}),
        ...(r.laps !== undefined ? { laps: r.laps } : {}),
        ...(r.position !== undefined ? { position: r.position } : {}),
        ...(r.mistakes !== undefined ? { mistakes: r.mistakes } : {}),
        ...(r.driver_confidence !== undefined ? { driver_confidence: r.driver_confidence } : {}),
        ...(r.traffic !== undefined ? { traffic: r.traffic } : {}),
        ...(wearAfter !== undefined ? { tyre_state_after: wearAfter } : {}),
      },
    };
  }

  let tyres: MakeRunInput["tyres"];
  if (entry.tyres !== undefined) {
    const t = entry.tyres;
    const wear = asTyreWear(t.wear);
    tyres = {
      ...(t.brand !== undefined ? { brand: t.brand } : {}),
      ...(t.compound !== undefined ? { compound: t.compound } : {}),
      ...(t.insert !== undefined ? { insert: t.insert } : {}),
      ...(t.sauce !== undefined ? { sauce: t.sauce } : {}),
      ...(wear !== undefined ? { wear } : {}),
      ...(t.run_count !== undefined ? { run_count: t.run_count } : {}),
    };
  }

  const input: MakeRunInput = {
    type: entry.type,
    session_id: ctx.session_id,
    car_id: ctx.car_id,
    ...(ctx.car_name !== undefined ? { car_name: ctx.car_name } : {}),
    car_template_id: entry.car_template_id,
    setup_version_id: entry.setup_version_id,
    setup_name: entry.setup_name,
    track,
    conditions: entry.conditions,
    ...(tyres !== undefined ? { tyres } : {}),
    ...(timing !== undefined ? { timing } : {}),
    feedback: {
      tags: entry.feedback.tags,
      ...(entry.feedback.text !== undefined ? { text: entry.feedback.text } : {}),
    },
    ...(entry.outcome !== undefined ? { outcome: entry.outcome } : {}),
    ...(entry.note !== undefined ? { note: entry.note } : {}),
  };
  return makeRun(input, entry.created_at, rand);
}
