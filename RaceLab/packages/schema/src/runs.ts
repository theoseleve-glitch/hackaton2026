/**
 * Runs — the ultimate run log. Theo's RunEntry vocabulary is absorbed verbatim
 * (RunConditions / TyreSet / RunResult, field names unchanged) and extended:
 * session/car/track linkage, FROZEN TrackSnapshot + RunConditions at log time,
 * a discriminated RunTiming union that makes storing both a lap array and a
 * manual summary structurally impossible, fuel log with derived stats computed
 * never stored, per-turn feedback, driver state, Speedhive import shapes, and
 * the learning-loop bridge into the engine's ContextBundle.history.
 *
 * CANONICAL MODEL: this file. The two older run/outcome models — packages/sessions
 * (D22 app store) and Theo's packages/logbook (origin/theo/racelab) — are legacy
 * feeders to be lifted ONCE during the B0 unification merge via the bridge
 * functions (bridge.ts: liftSessionsRun / liftSessionsOutcome / liftTheoRunEntry)
 * and then deprecated. Their id prefixes (ss/run/oc) are deliberately shared so
 * lifted history keeps joining; don't run both stores side by side.
 *
 * Merge mapping for Theo's branch — the FULL divergence list (liftTheoRunEntry
 * performs all of it):
 *  1. his `{ result }` → `{ timing: { kind: "summary", result } }` (his
 *     driver_confidence number normalizes into DriverState.confidence_1to5)
 *  2. his `track: TrackInfo { name, surface: string, indoor, layout? }` →
 *     TrackSnapshot with REQUIRED `track_id` (synthesized once per store) and
 *     `surface` narrowed to the Surface union (unknown surface rejects)
 *  3. schema RunEntry adds REQUIRED `session_id` / `car_id`, which his entries
 *     lack — synthesized once per store and passed in the lift context
 *  4. his `tyre_state_after?: string` narrows to TyreWear — unknown values DROP
 *     the field, never the run
 */

import type {
  Bumpiness,
  Grip,
  IsoDateTime,
  Outcome,
  PowerType,
  Rating1to5,
  Rating1to10,
  RunType,
  Sky,
  TrackEvolution,
  Traffic,
  TyreWear,
} from "./vocab";
import { clampNum, clampRating10, clampRating5, deepFreeze, isFiniteNum, round } from "./vocab";
import type { CarId, OutcomeId, RunId, SessionId, TrackId } from "./ids";
import { isoToMs, makeId } from "./ids";
import type { TrackSnapshot } from "./tracks";
import { turnsReject } from "./tracks"; // runtime import — tracks never imports runs, acyclic
import type { ConditionsProvenance, WeatherObservation } from "./weather";
import { makeWeatherObservation } from "./weather"; // runtime import — weather imports runs TYPE-only, acyclic

// ── Theo's shapes, verbatim ──────────────────────────────────────────────────

/** Theo's RunConditions, unchanged. grip is required: a conditions object
 *  without grip is meaningless to the engine. */
export interface RunConditions {
  grip: Grip;
  bumpiness?: Bumpiness;
  dusty?: boolean;
  sky?: Sky;
  evolution?: TrackEvolution;
  air_temp_c?: number;
  track_temp_c?: number; // driver-measured (IR gun) — never auto-filled from weather
  humidity_pct?: number; // clamped to [0, 100] at write time
}

/** Theo's TyreSet, unchanged. run_count is an observed fact about the physical set. */
export interface TyreSet {
  brand?: string;
  compound?: string;
  insert?: string;
  sauce?: string;
  wear?: TyreWear;
  run_count?: number; // integer >= 0, write-time guarded
}

/** Theo's RunResult, unchanged shape (merge-trivial). Lives ONLY inside
 *  RunTiming kind:"summary" — when a laps array exists, best/avg/consistency/laps
 *  are computed via lapStats, never stored. */
export interface RunResult {
  best_lap_s?: number;
  avg_lap_s?: number;
  consistency_pct?: number; // [0, 100]
  laps?: number; // integer > 0
  position?: number; // integer >= 1
  mistakes?: number; // integer >= 0
  /** @deprecated single home for confidence is DriverState.confidence_1to5;
   *  makeRun normalizes this field into it and never stores it here. */
  driver_confidence?: Rating1to5;
  traffic?: Traffic;
  tyre_state_after?: TyreWear;
}

/** The non-derivable subset, allowed alongside a laps array. */
export type NonTimingResult = Omit<
  RunResult,
  "best_lap_s" | "avg_lap_s" | "consistency_pct" | "laps" | "driver_confidence"
>;

// ── Laps / Speedhive ─────────────────────────────────────────────────────────

export const LAP_SOURCES = ["speedhive", "manual"] as const;
export type LapSource = (typeof LAP_SOURCES)[number];

export interface LapTime {
  n: number; // 1-based, strictly increasing within a series
  t_s: number; // finite, > 0 — write-time guarded
  source: LapSource;
}

export interface SpeedhiveImportMeta {
  imported_at: IsoDateTime;
  speedhive_session_id?: string;
  event_name?: string;
  session_name?: string;
  transponder_id?: string;
}

/** Raw Speedhive payload after parsing (fetching/parsing is app-layer I/O, NOT here). */
export interface ImportedLap {
  n: number;
  t_s: number;
  position_in_session?: number; // running position after this lap
}

export interface ImportedLaps {
  source: "speedhive";
  imported_at: IsoDateTime;
  laps: readonly ImportedLap[];
  speedhive_session_id?: string;
  event_name?: string;
  session_name?: string;
  track_name?: string; // fuzzy-match hint against Track.name (app-layer concern)
  driver_name?: string;
  transponder_id?: string; // match against Car.transponder_id
}

/** Normalized series as attached to a run. Diffs/positions-gained are computed views. */
export interface LapSeries {
  laps: readonly LapTime[];
  import?: SpeedhiveImportMeta;
}

/** Validating mapping: parsed Speedhive payload → the lap series a run stores.
 *  Applies the SAME lap rules as makeRun (finite, strictly increasing n, t_s > 0)
 *  — a flaky Speedhive payload must never become a frozen, official-looking
 *  series whose derived stats render NaN. */
export function toLapSeries(
  imported: ImportedLaps,
): { ok: true; series: LapSeries } | { ok: false; reason: RunRejectReason } {
  const laps = imported.laps.map((l) => ({ n: l.n, t_s: l.t_s, source: "speedhive" as const }));
  const bad = lapsReject(laps);
  if (bad !== null) return { ok: false, reason: bad };
  const series: LapSeries = deepFreeze({
    laps,
    import: {
      imported_at: imported.imported_at,
      ...(imported.speedhive_session_id !== undefined
        ? { speedhive_session_id: imported.speedhive_session_id }
        : {}),
      ...(imported.event_name !== undefined ? { event_name: imported.event_name } : {}),
      ...(imported.session_name !== undefined ? { session_name: imported.session_name } : {}),
      ...(imported.transponder_id !== undefined ? { transponder_id: imported.transponder_id } : {}),
    },
  });
  return { ok: true, series };
}

/** Per-pair position delta (positive = positions GAINED); null when either
 *  lap lacks a position. Computed, never stored. */
export function positionDeltas(laps: readonly ImportedLap[]): readonly (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i + 1 < laps.length; i++) {
    const a = laps[i].position_in_session;
    const b = laps[i + 1].position_in_session;
    out.push(a !== undefined && b !== undefined ? a - b : null);
  }
  return Object.freeze(out);
}

// ── Derived timing — computed, never stored ──────────────────────────────────

export interface TimingStats {
  lap_count?: number;
  best_lap_s?: number;
  avg_lap_s?: number;
  consistency_pct?: number; // 100 * (1 - stddev/avg), floored at 0, 1 decimal
}

export function lapStats(laps: readonly LapTime[]): TimingStats {
  if (laps.length === 0) return Object.freeze({ lap_count: 0 });
  // Grounded or silent (same guard as detectTyreCliff): poisoned inputs yield
  // a count only, never NaN-bearing derived stats.
  if (!laps.every((l) => isFiniteNum(l.t_s) && l.t_s > 0)) {
    return Object.freeze({ lap_count: laps.length });
  }
  const times = laps.map((l) => l.t_s);
  const best = Math.min(...times);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const variance = times.reduce((a, b) => a + (b - avg) ** 2, 0) / times.length;
  const sd = Math.sqrt(variance);
  return Object.freeze({
    lap_count: laps.length,
    best_lap_s: round(best, 3),
    avg_lap_s: round(avg, 3),
    consistency_pct: round(Math.max(0, 100 * (1 - sd / avg)), 1),
  });
}

/** delta[i] = lap (i+2) minus lap (i+1). Computed, never stored. */
export function lapDeltas(laps: readonly LapTime[]): readonly number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < laps.length; i++) out.push(round(laps[i + 1].t_s - laps[i].t_s, 3));
  return Object.freeze(out);
}

// ── Fuel — observed facts only; per-lap stats derived ────────────────────────

/** Stored facts only; cc_per_lap / laps_per_tank are DERIVED via fuelStats(). */
export interface FuelLog {
  tank_cc?: number; // > 0
  consumed_cc?: number; // >= 0, <= tank_cc when both present
}

export interface FuelStats {
  cc_per_lap?: number;
  laps_per_tank?: number;
}

/** Derived view — garbage or missing inputs yield absent fields, never NaN. */
export function fuelStats(fuel: FuelLog | undefined, lap_count?: number): FuelStats {
  const out: { cc_per_lap?: number; laps_per_tank?: number } = {};
  if (
    fuel !== undefined &&
    isFiniteNum(fuel.consumed_cc) &&
    fuel.consumed_cc > 0 &&
    isFiniteNum(lap_count) &&
    Number.isInteger(lap_count) &&
    lap_count > 0
  ) {
    out.cc_per_lap = round(fuel.consumed_cc / lap_count, 2);
  }
  if (fuel !== undefined && isFiniteNum(fuel.tank_cc) && fuel.tank_cc > 0 && out.cc_per_lap !== undefined && out.cc_per_lap > 0) {
    out.laps_per_tank = Math.floor(fuel.tank_cc / out.cc_per_lap);
  }
  return Object.freeze(out);
}

// ── Feedback / driver state ──────────────────────────────────────────────────

/** Engine-compatible feedback tag (structurally identical to packages/engine FeedbackTag). */
export interface FeedbackTag {
  symptom: string;
  phase?: string;
  evolution?: string;
}

export interface TurnFeedback {
  turn_n: number; // validated against the track snapshot's turns when it has them
  tags?: readonly FeedbackTag[];
  text?: string; // at least one of tags/text required — write-time guarded
}

export interface RunFeedback {
  tags: readonly FeedbackTag[]; // [] when skipped — required, like Theo's
  text?: string;
  turns?: readonly TurnFeedback[];
}

/** Clamp-at-write input: raw numbers in, branded ratings out. */
export interface DriverStateInput {
  feeling_1to10?: number;
  fatigue_1to5?: number;
  confidence_1to5?: number;
}

export interface DriverState {
  feeling_1to10?: Rating1to10;
  fatigue_1to5?: Rating1to5;
  confidence_1to5?: Rating1to5; // THE home of driver confidence
}

// ── RunTiming — structural single-source-of-truth for timing ─────────────────

/** You either store laps (stats computed) or a manual summary (Theo's RunResult,
 *  unchanged) — never both. Theo merge: his `{ result }` → `{ kind: "summary", result }`. */
export type RunTiming =
  | { kind: "summary"; result: RunResult }
  | ({ kind: "laps"; result?: NonTimingResult } & LapSeries);

// ── RunEntry / OutcomeRecord ─────────────────────────────────────────────────

export interface RunEntry {
  id: RunId;
  created_at: IsoDateTime;
  type: RunType;
  session_id: SessionId;
  car_id: CarId;
  /** Denormalized — renders after a garage reset. OPTIONAL here (unlike
   *  OutcomeRecord) because lifted legacy runs (sessions/logbook) may predate
   *  the garage entirely: their car_id is synthesized and no human-given name
   *  ever existed. Fresh app writes should always provide it. */
  car_name?: string;
  car_template_id: string; // chassis template the setup values belong to, frozen at log time
  setup_version_id: string; // packages/sheets version id — learning-tuple key
  setup_name: string; // denormalized at log time — survives a sheets-store reset
  track_id: TrackId;
  track: TrackSnapshot; // FROZEN at log time (includes turns)
  conditions: RunConditions; // FROZEN copy at log time
  conditions_provenance?: ConditionsProvenance;
  weather?: WeatherObservation; // FROZEN raw auto observation backing the resolution (Patm for nitro)
  tyres?: TyreSet;
  fuel?: FuelLog;
  timing?: RunTiming;
  feedback: RunFeedback;
  driver?: DriverState;
  /** Driver's quick rating of THIS RUN vs the previous one. Advised-change
   *  attribution is OutcomeRecord — two different facts, two fields. */
  outcome?: Outcome;
  note?: string;
}

/** Engine-hook record: the structurally complete learning datapoint —
 *  (track snapshot, conditions, setup version, change, outcome) all required. */
export interface OutcomeRecord {
  id: OutcomeId;
  created_at: IsoDateTime;
  session_id: SessionId;
  car_id: CarId;
  /** REQUIRED denormalization (unlike RunEntry): outcome rows are the long-lived
   *  learning datapoints a two-car driver reads back ("front oil 500→450: better
   *  — on which car?") and must render without a garage join, even after the
   *  garage reset. The engine hook always has the active car in scope. */
  car_name: string;
  setting: string; // KB rule setting that was changed
  change: string; // human-readable delta, e.g. "front oil 500 → 450 cst"
  citations: readonly string[]; // KB rule sources — grounded or silent (D13/D18)
  outcome: Outcome;
  setup_version_id: string; // TRIAL-time version (baseline the change was judged against)
  setup_name: string; // denormalized
  track_id: TrackId;
  track: TrackSnapshot; // FROZEN at record time
  conditions: RunConditions; // FROZEN — the conditions the change was judged under
  run_id?: RunId; // the trial run, when known
  note?: string;
}

// ── Constructors ─────────────────────────────────────────────────────────────

/** Input timing accepts raw numbers where the entity clamps/normalizes. */
export type RunTimingInput =
  | { kind: "summary"; result: Omit<RunResult, "driver_confidence"> & { driver_confidence?: number } }
  | ({ kind: "laps"; result?: NonTimingResult } & { laps: readonly LapTime[]; import?: SpeedhiveImportMeta });

export interface MakeRunInput {
  type: RunType;
  session_id: SessionId;
  car_id: CarId;
  car_name?: string;
  car_template_id: string;
  setup_version_id: string;
  setup_name: string;
  track: TrackSnapshot; // caller: snapshotTrack(track) or session's frozen copy
  conditions: RunConditions;
  conditions_provenance?: ConditionsProvenance;
  weather?: WeatherObservation;
  tyres?: TyreSet;
  fuel?: FuelLog;
  timing?: RunTimingInput;
  feedback: RunFeedback;
  driver?: DriverStateInput;
  outcome?: Outcome;
  note?: string;
}

export type RunRejectReason =
  | "empty_setup_version"
  | "non_finite_numeric" // any NaN/Infinity numeric (never-wipe guarantee)
  | "out_of_range" // sign/integer violations that are not clampable ratings
  | "duplicate_turn_n" // hand-built snapshot with two turns sharing an n
  | "bad_lap_sequence" // empty laps, n not strictly increasing, or t_s <= 0
  | "unknown_turn" // per-turn feedback referencing a turn the snapshot doesn't have
  | "empty_turn_feedback" // TurnFeedback with neither tags nor text
  | "invalid_timestamp"; // weather observed_at unparseable or missing an explicit offset

/** Build a frozen RunEntry. Everything passed in is COPIED (caller objects
 *  stay detached) and deep-frozen; clampable ratings clamp, everything else
 *  guards. Failure never returns a partial entity. The track snapshot's turns
 *  clear the SAME bar as makeTrack (TrackSnapshot is literal-constructable —
 *  a NaN turn n would freeze into storage and neuter the feedback join). */
export function makeRun(
  input: MakeRunInput,
  now: IsoDateTime,
  rand?: () => number,
): { ok: true; run: RunEntry } | { ok: false; reason: RunRejectReason } {
  if (input.setup_version_id.trim() === "") return { ok: false, reason: "empty_setup_version" };

  if (input.track.turns !== undefined) {
    const turnsBad = turnsReject(input.track.turns);
    if (turnsBad !== null) return { ok: false, reason: turnsBad };
  }

  const condBad = conditionsReject(input.conditions);
  if (condBad !== null) return { ok: false, reason: condBad };

  if (input.tyres?.run_count !== undefined) {
    if (!isFiniteNum(input.tyres.run_count)) return { ok: false, reason: "non_finite_numeric" };
    if (!Number.isInteger(input.tyres.run_count) || input.tyres.run_count < 0) {
      return { ok: false, reason: "out_of_range" };
    }
  }

  if (input.fuel !== undefined) {
    const bad = fuelReject(input.fuel);
    if (bad !== null) return { ok: false, reason: bad };
  }

  // Weather goes through THE one weather constructor — one validity envelope
  // per fact (NaN reject, documented clamps, offset-carrying timestamp), no
  // hand-copied field list to drift.
  let weather: WeatherObservation | undefined;
  if (input.weather !== undefined) {
    const w = makeWeatherObservation(input.weather);
    if (!w.ok) return { ok: false, reason: w.reason };
    weather = w.observation;
  }

  // Per-turn feedback: at least one of tags/text, and the turn must exist when
  // the snapshot carries a turn map (no map → any positive integer accepted).
  if (input.feedback.turns !== undefined) {
    const known = input.track.turns?.map((t) => t.n);
    for (const tf of input.feedback.turns) {
      if (!isFiniteNum(tf.turn_n)) return { ok: false, reason: "non_finite_numeric" };
      if (!Number.isInteger(tf.turn_n) || tf.turn_n < 1) return { ok: false, reason: "out_of_range" };
      const hasTags = tf.tags !== undefined && tf.tags.length > 0;
      const hasText = tf.text !== undefined && tf.text.trim() !== "";
      if (!hasTags && !hasText) return { ok: false, reason: "empty_turn_feedback" };
      if (known !== undefined && known.length > 0 && !known.includes(tf.turn_n)) {
        return { ok: false, reason: "unknown_turn" };
      }
    }
  }

  // Driver state: NaN rejects, ranges CLAMP (documented ranges, e.g. feeling 1–10).
  let driver: DriverState | undefined;
  if (input.driver !== undefined) {
    for (const v of [input.driver.feeling_1to10, input.driver.fatigue_1to5, input.driver.confidence_1to5]) {
      if (v !== undefined && !isFiniteNum(v)) return { ok: false, reason: "non_finite_numeric" };
    }
    driver = {
      ...(input.driver.feeling_1to10 !== undefined
        ? { feeling_1to10: clampRating10(input.driver.feeling_1to10) }
        : {}),
      ...(input.driver.fatigue_1to5 !== undefined
        ? { fatigue_1to5: clampRating5(input.driver.fatigue_1to5) }
        : {}),
      ...(input.driver.confidence_1to5 !== undefined
        ? { confidence_1to5: clampRating5(input.driver.confidence_1to5) }
        : {}),
    };
  }

  // Timing: structural union + numeric guards. Theo's driver_confidence is
  // normalized into DriverState (one home per fact) and never stored on result.
  let timing: RunTiming | undefined;
  if (input.timing !== undefined) {
    if (input.timing.kind === "summary") {
      const r = input.timing.result;
      const bad = summaryResultReject(r);
      if (bad !== null) return { ok: false, reason: bad };
      if (r.driver_confidence !== undefined) {
        if (!isFiniteNum(r.driver_confidence)) return { ok: false, reason: "non_finite_numeric" };
        const conf = clampRating5(r.driver_confidence);
        driver = { ...(driver ?? {}), confidence_1to5: driver?.confidence_1to5 ?? conf };
      }
      timing = { kind: "summary", result: copyNonTiming(r, true) };
    } else {
      const lapBad = lapsReject(input.timing.laps);
      if (lapBad !== null) return { ok: false, reason: lapBad };
      const resBad = input.timing.result !== undefined ? nonTimingReject(input.timing.result) : null;
      if (resBad !== null) return { ok: false, reason: resBad };
      timing = {
        kind: "laps",
        laps: input.timing.laps.map((l) => ({ ...l })),
        ...(input.timing.import !== undefined ? { import: { ...input.timing.import } } : {}),
        ...(input.timing.result !== undefined ? { result: copyNonTiming(input.timing.result, false) } : {}),
      };
    }
  }

  const run: RunEntry = deepFreeze({
    id: makeId("run", isoToMs(now), rand),
    created_at: now,
    type: input.type,
    session_id: input.session_id,
    car_id: input.car_id,
    ...(input.car_name !== undefined ? { car_name: input.car_name } : {}),
    car_template_id: input.car_template_id,
    setup_version_id: input.setup_version_id,
    setup_name: input.setup_name,
    track_id: input.track.track_id,
    track: copySnapshot(input.track),
    conditions: copyConditions(input.conditions),
    ...(input.conditions_provenance !== undefined
      ? {
          conditions_provenance: {
            auto_filled: [...input.conditions_provenance.auto_filled],
            overridden: [...input.conditions_provenance.overridden],
          },
        }
      : {}),
    ...(weather !== undefined ? { weather } : {}), // already frozen + clamped by makeWeatherObservation
    ...(input.tyres !== undefined ? { tyres: { ...input.tyres } } : {}),
    ...(input.fuel !== undefined ? { fuel: { ...input.fuel } } : {}),
    ...(timing !== undefined ? { timing } : {}),
    feedback: copyFeedback(input.feedback),
    ...(driver !== undefined ? { driver } : {}),
    ...(input.outcome !== undefined ? { outcome: input.outcome } : {}),
    ...(input.note !== undefined ? { note: input.note } : {}),
  });
  return { ok: true, run };
}

/** Computed view, never stored: laps-branch stats from lapStats(), summary-branch echo. */
export function effectiveTiming(run: RunEntry): TimingStats | null {
  if (run.timing === undefined) return null;
  if (run.timing.kind === "laps") return lapStats(run.timing.laps);
  const r = run.timing.result;
  return Object.freeze({
    ...(r.laps !== undefined ? { lap_count: r.laps } : {}),
    ...(r.best_lap_s !== undefined ? { best_lap_s: r.best_lap_s } : {}),
    ...(r.avg_lap_s !== undefined ? { avg_lap_s: r.avg_lap_s } : {}),
    ...(r.consistency_pct !== undefined ? { consistency_pct: r.consistency_pct } : {}),
  });
}

export interface MakeOutcomeInput {
  session_id: SessionId;
  car_id: CarId;
  car_name: string; // required — see OutcomeRecord.car_name
  setting: string;
  change: string;
  citations: readonly string[];
  outcome: Outcome;
  setup_version_id: string;
  setup_name: string;
  track: TrackSnapshot;
  conditions: RunConditions;
  run_id?: RunId;
  note?: string;
}

export type OutcomeRejectReason =
  | "empty_setup_version"
  | "empty_setting"
  | "empty_change"
  | "empty_car_name"
  | "non_finite_numeric"
  | "out_of_range"
  | "duplicate_turn_n";

/** Build a frozen OutcomeRecord — the guaranteed learning datapoint. The track
 *  snapshot's turns clear the same bar as makeTrack (see makeRun). */
export function makeOutcomeRecord(
  input: MakeOutcomeInput,
  now: IsoDateTime,
  rand?: () => number,
): { ok: true; record: OutcomeRecord } | { ok: false; reason: OutcomeRejectReason } {
  if (input.setup_version_id.trim() === "") return { ok: false, reason: "empty_setup_version" };
  if (input.setting.trim() === "") return { ok: false, reason: "empty_setting" };
  if (input.change.trim() === "") return { ok: false, reason: "empty_change" };
  if (input.car_name.trim() === "") return { ok: false, reason: "empty_car_name" };
  if (input.track.turns !== undefined) {
    const turnsBad = turnsReject(input.track.turns);
    if (turnsBad !== null) return { ok: false, reason: turnsBad };
  }
  const condBad = conditionsReject(input.conditions);
  if (condBad !== null) return { ok: false, reason: condBad };

  const record: OutcomeRecord = deepFreeze({
    id: makeId("oc", isoToMs(now), rand),
    created_at: now,
    session_id: input.session_id,
    car_id: input.car_id,
    car_name: input.car_name,
    setting: input.setting,
    change: input.change,
    citations: [...input.citations],
    outcome: input.outcome,
    setup_version_id: input.setup_version_id,
    setup_name: input.setup_name,
    track_id: input.track.track_id,
    track: copySnapshot(input.track),
    conditions: copyConditions(input.conditions),
    ...(input.run_id !== undefined ? { run_id: input.run_id } : {}),
    ...(input.note !== undefined ? { note: input.note } : {}),
  });
  return { ok: true, record };
}

// ── Learning loop (engine bridge) ────────────────────────────────────────────

/** The guaranteed datapoint of docs/04 §6: (track, conditions, setup version,
 *  change?, outcome). Built from OutcomeRecords (advised changes) and rated
 *  RunEntries (driver self-ratings). */
export interface LearningTuple {
  at: IsoDateTime;
  car_id: CarId;
  track: TrackSnapshot;
  conditions: RunConditions;
  setup_version_id: string;
  change?: { setting: string; change: string; citations: readonly string[] }; // absent for bare run ratings
  outcome: Outcome;
  source: { kind: "outcome_record"; id: OutcomeId } | { kind: "run_rating"; id: RunId };
}

/** Matches packages/engine ContextBundle["history"][number] exactly. */
export interface ContextHistoryEntry {
  change: string;
  conditions: string;
  outcome: Outcome;
}

/** Dedup rule: a rated run that is the TRIAL run of an OutcomeRecord (run_id
 *  linkage) is excluded — the OutcomeRecord wins, no double-counting. */
export function learningTuples(
  runs: readonly RunEntry[],
  outcomes: readonly OutcomeRecord[],
): readonly LearningTuple[] {
  const claimed = new Set<string>();
  for (const o of outcomes) if (o.run_id !== undefined) claimed.add(o.run_id);

  const tuples: LearningTuple[] = [];
  for (const o of outcomes) {
    tuples.push({
      at: o.created_at,
      car_id: o.car_id,
      track: o.track,
      conditions: o.conditions,
      setup_version_id: o.setup_version_id,
      change: { setting: o.setting, change: o.change, citations: o.citations },
      outcome: o.outcome,
      source: { kind: "outcome_record", id: o.id },
    });
  }
  for (const r of runs) {
    if (r.outcome === undefined || claimed.has(r.id)) continue;
    tuples.push({
      at: r.created_at,
      car_id: r.car_id,
      track: r.track,
      conditions: r.conditions,
      setup_version_id: r.setup_version_id,
      outcome: r.outcome,
      source: { kind: "run_rating", id: r.id },
    });
  }
  tuples.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.source.id < b.source.id ? -1 : 1));
  return deepFreeze(tuples);
}

/** Deterministic single-line rendering of conditions (engine history `conditions` string). */
export function renderConditions(c: RunConditions): string {
  const parts: string[] = [`grip ${c.grip}`];
  if (c.bumpiness !== undefined) parts.push(`bumps ${c.bumpiness}`);
  if (c.dusty === true) parts.push("dusty");
  if (c.sky !== undefined) parts.push(`sky ${c.sky}`);
  if (c.evolution !== undefined) parts.push(`evol ${c.evolution}`);
  if (c.air_temp_c !== undefined) parts.push(`air ${c.air_temp_c}C`);
  if (c.track_temp_c !== undefined) parts.push(`track ${c.track_temp_c}C`);
  if (c.humidity_pct !== undefined) parts.push(`hum ${c.humidity_pct}%`);
  return parts.join(", ");
}

/** Maps RunConditions onto engine taxonomy condition tags (taxonomy.yaml
 *  `conditions`: low_grip/high_grip/blue_groove/dusty/wet/bumpy/rough/smooth/hot/cold).
 *  Thresholds: hot = air >= 30C or track >= 40C; cold = air <= 10C. */
export function conditionsToTags(c: RunConditions): readonly string[] {
  const tags: string[] = [];
  if (c.grip === "green") tags.push("low_grip");
  else if (c.grip === "high") tags.push("high_grip");
  else if (c.grip === "blue_groove") tags.push("blue_groove");
  if (c.bumpiness === "smooth") tags.push("smooth");
  else if (c.bumpiness === "medium") tags.push("bumpy");
  else if (c.bumpiness === "rough") tags.push("rough");
  if (c.dusty === true) tags.push("dusty");
  if (c.sky === "raining") tags.push("wet");
  const hot =
    (c.air_temp_c !== undefined && c.air_temp_c >= 30) ||
    (c.track_temp_c !== undefined && c.track_temp_c >= 40);
  if (hot) tags.push("hot");
  // Cold is symmetric with hot: a frigid track (IR gun, no air reading — e.g. an
  // indoor refrigerated or winter outdoor circuit) is cold even without air_temp.
  const cold =
    (c.air_temp_c !== undefined && c.air_temp_c <= 10) ||
    (c.track_temp_c !== undefined && c.track_temp_c <= 10);
  if (cold) tags.push("cold");
  return Object.freeze(tags);
}

/** Maps a track SURFACE id (the app's `rcdata.json` surfaces, e.g. "loose_dirt_loam",
 *  "astroturf", "carpet_onroad", "asphalt_high_grip", "blue_groove") onto the engine's
 *  surface-FAMILY condition tags (taxonomy.yaml: clay/loose_dirt/astroturf/carpet/
 *  asphalt/blue_groove/wet). This is the reconciliation conditionsToTags can't do:
 *  conditionsToTags derives grip/bumps/temp from RunConditions; surfaceToTags derives
 *  the surface TYPE from the picked surface, so a rule's `amplified_on:[astroturf]` /
 *  `forbidden_on:[loose_dirt]` actually fires. Caller unions both into track.conditions.
 *  Grip LEVEL stays with conditionsToTags (the surface says the type, the grip field
 *  says the level) — surfaceToTags never emits grip tags, only the family (+ wet for
 *  genuinely-wet surfaces). Unknown/edge surfaces map to [] (grip carries them). */
export function surfaceToTags(surface: string): readonly string[] {
  const s = surface.toLowerCase();
  const tags: string[] = [];
  if (/clay/.test(s)) tags.push("clay");
  if (/blue_groove/.test(s)) tags.push("blue_groove");
  // NB: decomposed_granite + fire_road are hard-packed/high-grip dirt, NOT loose —
  // they intentionally fall through to [] so the grip field (not a loose_dirt tag)
  // carries them, rather than firing loose-surface rules that would mislead.
  if (/(loose|loam|sugar_dirt|sand|gravel|rally_mix)/.test(s)) tags.push("loose_dirt");
  if (/(astro|hockey_turf)/.test(s)) tags.push("astroturf");
  if (/carpet/.test(s)) tags.push("carpet");
  if (/(asphalt|tarmac|concrete|parking)/.test(s)) tags.push("asphalt");
  if (/(mud|water_crossing|wet_drift|snow|ice)/.test(s)) tags.push("wet");
  return Object.freeze([...new Set(tags)]);
}

/** Maps a car's PowerType onto the engine's power sub-class condition tags
 *  (taxonomy.yaml: stock_blinky / modified_power / nitro_power) that the KB's
 *  `legal_in_power` gate keys off (e.g. the 2WD/4WD gearing rules are legal in
 *  stock_blinky OR modified_power). Without this, no producer ever emits a power
 *  tag into track.conditions, so the gate's `some(...)` is always false and every
 *  power-gated rule is silently dropped (P1-E1). nitro → nitro_power; brushless
 *  DEFAULTS to stock_blinky — the D13-safe choice so a modified-only rule
 *  (boost/turbo timing) never auto-fires for a car whose spec/mod class is unknown.
 *  The app injects "modified_power" instead when the entrant declares a mod class.
 *  Caller unions this into track.conditions alongside conditionsToTags/surfaceToTags. */
export function powerTypeToTags(power: PowerType): readonly string[] {
  return power === "nitro" ? Object.freeze(["nitro_power"]) : Object.freeze(["stock_blinky"]);
}

/** THE single assembler for an engine ContextBundle's `track.conditions`. Unions
 *  all three tag producers — grip/bumps/dust/wet/temp from RunConditions, the
 *  surface FAMILY from the picked surface id, and the power sub-class from the
 *  car — into one deduped, frozen tag set. The app assigns the result straight
 *  to `bundle.track.conditions`.
 *
 *  WHY this exists: the producers are independent, and a caller that wires only
 *  conditionsToTags (the obvious one) silently leaves every surface-family rule
 *  (`amplified_on:[astroturf]`, `forbidden_on:[loose_dirt]`) and every
 *  power-gated rule (`legal_in_power`) DARK — the engine still answers, just
 *  without the surface/power signal, which is the quiet failure mode that makes
 *  the advisor feel generic. One call here removes that whole class of bug: you
 *  cannot forget a producer you don't have to name.
 *
 *  Every input is OPTIONAL — partial context still yields every tag it can
 *  (surface known but power unknown → surface + condition tags, no power tag),
 *  so the engine degrades gracefully instead of refusing. Deterministic, no I/O,
 *  off the advice path's network/clock concerns (pure tag math). */
export interface ConditionTagInputs {
  conditions?: RunConditions;
  surface?: string;
  power?: PowerType;
}
export function buildConditionTags(input: ConditionTagInputs): readonly string[] {
  const tags = new Set<string>();
  if (input.conditions) for (const t of conditionsToTags(input.conditions)) tags.add(t);
  if (input.surface) for (const t of surfaceToTags(input.surface)) tags.add(t);
  if (input.power) for (const t of powerTypeToTags(input.power)) tags.add(t);
  return Object.freeze([...tags]);
}

/** Render change-bearing tuples into the engine's history shape. Bare run
 *  ratings are EXCLUDED (history rows describe a change tried). `limit` keeps
 *  the most recent N.
 *
 *  Returns MUTABLE, UNFROZEN copies on purpose — engine ContextBundle.history
 *  is declared as a mutable array, so a readonly/frozen return would fail to
 *  compile (TS4104) at exactly the seam this bridge exists for. Every row is
 *  a fresh render of frozen sources; handing it over loses nothing. */
export function toEngineHistory(
  tuples: readonly LearningTuple[],
  filter?: { track_id?: TrackId; car_id?: CarId; limit?: number },
): ContextHistoryEntry[] {
  let rows = tuples.filter((t) => t.change !== undefined);
  if (filter?.track_id !== undefined) rows = rows.filter((t) => t.track.track_id === filter.track_id);
  if (filter?.car_id !== undefined) rows = rows.filter((t) => t.car_id === filter.car_id);
  if (filter?.limit !== undefined && filter.limit >= 0 && rows.length > filter.limit) {
    rows = rows.slice(rows.length - filter.limit);
  }
  return rows.map((t) => ({
    change: `${t.change!.setting}: ${t.change!.change}`,
    conditions: renderConditions(t.conditions),
    outcome: t.outcome,
  }));
}

// ── Internal guards / copiers ────────────────────────────────────────────────

function conditionsReject(c: RunConditions): "non_finite_numeric" | null {
  for (const v of [c.air_temp_c, c.track_temp_c, c.humidity_pct]) {
    if (v !== undefined && !isFiniteNum(v)) return "non_finite_numeric";
  }
  return null;
}

function fuelReject(f: FuelLog): RunRejectReason | null {
  for (const v of [f.tank_cc, f.consumed_cc]) {
    if (v !== undefined && !isFiniteNum(v)) return "non_finite_numeric";
  }
  if (f.tank_cc !== undefined && f.tank_cc <= 0) return "out_of_range";
  if (f.consumed_cc !== undefined && f.consumed_cc < 0) return "out_of_range";
  if (f.tank_cc !== undefined && f.consumed_cc !== undefined && f.consumed_cc > f.tank_cc) {
    return "out_of_range";
  }
  return null;
}

function lapsReject(laps: readonly LapTime[]): RunRejectReason | null {
  if (laps.length === 0) return "bad_lap_sequence";
  let prev = 0;
  for (const l of laps) {
    if (!isFiniteNum(l.n) || !isFiniteNum(l.t_s)) return "non_finite_numeric";
    if (!Number.isInteger(l.n) || l.n <= prev) return "bad_lap_sequence";
    if (l.t_s <= 0) return "bad_lap_sequence";
    prev = l.n;
  }
  return null;
}

function nonTimingReject(r: NonTimingResult): RunRejectReason | null {
  if (r.position !== undefined) {
    if (!isFiniteNum(r.position)) return "non_finite_numeric";
    if (!Number.isInteger(r.position) || r.position < 1) return "out_of_range";
  }
  if (r.mistakes !== undefined) {
    if (!isFiniteNum(r.mistakes)) return "non_finite_numeric";
    if (!Number.isInteger(r.mistakes) || r.mistakes < 0) return "out_of_range";
  }
  return null;
}

function summaryResultReject(
  r: Omit<RunResult, "driver_confidence"> & { driver_confidence?: number },
): RunRejectReason | null {
  for (const v of [r.best_lap_s, r.avg_lap_s, r.consistency_pct]) {
    if (v !== undefined && !isFiniteNum(v)) return "non_finite_numeric";
  }
  if (r.best_lap_s !== undefined && r.best_lap_s <= 0) return "out_of_range";
  if (r.avg_lap_s !== undefined && r.avg_lap_s <= 0) return "out_of_range";
  if (r.consistency_pct !== undefined && (r.consistency_pct < 0 || r.consistency_pct > 100)) {
    return "out_of_range";
  }
  if (r.laps !== undefined) {
    if (!isFiniteNum(r.laps)) return "non_finite_numeric";
    if (!Number.isInteger(r.laps) || r.laps <= 0) return "out_of_range";
  }
  return nonTimingReject(r);
}

/** Copy a result, optionally keeping the derivable timing fields (summary
 *  branch). driver_confidence is ALWAYS stripped — its home is DriverState. */
function copyNonTiming(
  r: Omit<RunResult, "driver_confidence"> & { driver_confidence?: number },
  keepTiming: boolean,
): RunResult {
  return {
    ...(keepTiming && r.best_lap_s !== undefined ? { best_lap_s: r.best_lap_s } : {}),
    ...(keepTiming && r.avg_lap_s !== undefined ? { avg_lap_s: r.avg_lap_s } : {}),
    ...(keepTiming && r.consistency_pct !== undefined ? { consistency_pct: r.consistency_pct } : {}),
    ...(keepTiming && r.laps !== undefined ? { laps: r.laps } : {}),
    ...(r.position !== undefined ? { position: r.position } : {}),
    ...(r.mistakes !== undefined ? { mistakes: r.mistakes } : {}),
    ...(r.traffic !== undefined ? { traffic: r.traffic } : {}),
    ...(r.tyre_state_after !== undefined ? { tyre_state_after: r.tyre_state_after } : {}),
  };
}

function copySnapshot(t: TrackSnapshot): TrackSnapshot {
  return {
    track_id: t.track_id,
    name: t.name,
    surface: t.surface,
    indoor: t.indoor,
    ...(t.layout !== undefined ? { layout: t.layout } : {}),
    ...(t.turns !== undefined ? { turns: t.turns.map((x) => ({ ...x })) } : {}),
  };
}

function copyConditions(c: RunConditions): RunConditions {
  const copy: RunConditions = { ...c };
  if (copy.humidity_pct !== undefined) copy.humidity_pct = clampNum(copy.humidity_pct, 0, 100);
  return copy;
}

function copyFeedback(f: RunFeedback): RunFeedback {
  return {
    tags: f.tags.map((t) => ({ ...t })),
    ...(f.text !== undefined ? { text: f.text } : {}),
    ...(f.turns !== undefined
      ? {
          turns: f.turns.map((tf) => ({
            turn_n: tf.turn_n,
            ...(tf.tags !== undefined ? { tags: tf.tags.map((t) => ({ ...t })) } : {}),
            ...(tf.text !== undefined ? { text: tf.text } : {}),
          })),
        }
      : {}),
  };
}
