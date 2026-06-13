/**
 * Session log data model: a session is one track day (track + conditions),
 * holding append-only `runs` (laps driven on a setup version) and `outcomes`
 * (did an advised change make the car better/same/worse). At most one session
 * is active at a time; runs and outcomes can only be logged into the active
 * session. Every operation returns a new state — safe for React reducers.
 *
 * Review-hardened (see docs/00 D22):
 * - every Run/OutcomeRecord carries a FROZEN `track` snapshot taken at log
 *   time — `updateTrack` can never retroactively falsify the conditions a
 *   datapoint was recorded under (the learning-loop tuple of docs/04 §6)
 * - `setup_name` is denormalized at log time so history stays renderable
 *   even if the sheets store is reset (referential-integrity fallback)
 * - addRun/recordOutcome return a discriminated result ({logged|recorded}:
 *   Run|null) so silently-dropped data is impossible to miss
 * - non-finite numerics are rejected at write time (NaN survives serialize
 *   but poisons deserialize — the never-wipe guarantee depends on this)
 * - sessions, their arrays and track objects are deep-frozen
 */

export type RunType = "practice" | "qualifier" | "main";
export type Outcome = "better" | "same" | "worse";
export type Surface = "clay" | "hard-packed" | "loam" | "astro" | "carpet" | "grass";
export type Grip = "green" | "medium" | "high" | "blue_groove";

export interface TrackInfo {
  name: string;
  surface: Surface;
  grip: Grip;
  conditions: string[];
}

export interface Run {
  id: string;
  at: string; // ISO
  type: RunType;
  setup_version_id: string;
  setup_name: string; // denormalized label — survives a sheets-store reset
  track: TrackInfo; // frozen snapshot at log time
  best_lap_s?: number;
  lap_count?: number;
  feedback_text?: string;
}

export interface OutcomeRecord {
  id: string;
  at: string; // ISO
  setting: string;
  change: string;
  citations: string[];
  outcome: Outcome;
  setup_version_id: string;
  setup_name: string; // denormalized label
  track: TrackInfo; // frozen snapshot at log time — the conditions the change was judged under
  note?: string;
}

export interface Session {
  id: string;
  started_at: string; // ISO
  ended_at?: string; // ISO; absent while the session is live
  track: TrackInfo;
  runs: Run[];
  outcomes: OutcomeRecord[];
}

export interface SessionsState {
  sessions: Session[];
  active_session_id: string | null;
}

export function initSessions(): SessionsState {
  return { sessions: [], active_session_id: null };
}

/** Start a new session. No-op (same reference) if one is already active. */
export function startSession(state: SessionsState, track: TrackInfo, now: string): SessionsState {
  if (state.active_session_id !== null) return state;
  const session = freezeSession({
    id: nextId("ss", now),
    started_at: now,
    track: copyTrack(track),
    runs: [],
    outcomes: [],
  });
  return { sessions: [...state.sessions, session], active_session_id: session.id };
}

/** Close the active session (sets `ended_at`). No-op if none is active. */
export function endSession(state: SessionsState, now: string): SessionsState {
  const active = getActiveSession(state);
  if (!active) return state;
  return {
    sessions: state.sessions.map((s) =>
      s.id === active.id ? freezeSession({ ...s, ended_at: now }) : s,
    ),
    active_session_id: null,
  };
}

/** Patch the active session's track info (conditions changed, regripped…).
 *  No-op if no session is active. Past runs/outcomes keep their snapshots. */
export function updateTrack(state: SessionsState, patch: Partial<TrackInfo>): SessionsState {
  return withActive(state, (session) => ({
    ...session,
    track: { ...session.track, ...cleanTrackPatch(patch) },
  }));
}

/** Log a run into the active session. Returns logged: null (state unchanged)
 *  when no session is active or the payload is invalid — callers MUST surface
 *  that, never swallow it. */
export function addRun(
  state: SessionsState,
  run: {
    type: RunType;
    setup_version_id: string;
    setup_name: string;
    best_lap_s?: number;
    lap_count?: number;
    feedback_text?: string;
  },
  now: string,
): { state: SessionsState; logged: Run | null } {
  if (run.setup_version_id.trim() === "") return { state, logged: null };
  if (run.best_lap_s !== undefined && !(Number.isFinite(run.best_lap_s) && run.best_lap_s > 0)) {
    return { state, logged: null };
  }
  if (run.lap_count !== undefined && !(Number.isInteger(run.lap_count) && run.lap_count > 0)) {
    return { state, logged: null };
  }

  let logged: Run | null = null;
  const next = withActive(state, (session) => {
    const record: Run = Object.freeze({
      id: nextId("run", now),
      at: now,
      type: run.type,
      setup_version_id: run.setup_version_id,
      setup_name: run.setup_name,
      track: copyTrack(session.track),
      ...(run.best_lap_s !== undefined ? { best_lap_s: run.best_lap_s } : {}),
      ...(run.lap_count !== undefined ? { lap_count: run.lap_count } : {}),
      ...(run.feedback_text !== undefined ? { feedback_text: run.feedback_text } : {}),
    });
    logged = record;
    return { ...session, runs: [...session.runs, record] };
  });
  return { state: next, logged };
}

/** Record whether an advised change worked. Returns recorded: null (state
 *  unchanged) when no session is active — callers MUST surface that. */
export function recordOutcome(
  state: SessionsState,
  rec: {
    setting: string;
    change: string;
    citations: string[];
    outcome: Outcome;
    setup_version_id: string;
    setup_name: string;
    note?: string;
  },
  now: string,
): { state: SessionsState; recorded: OutcomeRecord | null } {
  let recorded: OutcomeRecord | null = null;
  const next = withActive(state, (session) => {
    const record: OutcomeRecord = Object.freeze({
      id: nextId("oc", now),
      at: now,
      setting: rec.setting,
      change: rec.change,
      citations: Object.freeze([...rec.citations]) as string[],
      outcome: rec.outcome,
      setup_version_id: rec.setup_version_id,
      setup_name: rec.setup_name,
      track: copyTrack(session.track),
      ...(rec.note !== undefined ? { note: rec.note } : {}),
    });
    recorded = record;
    return { ...session, outcomes: [...session.outcomes, record] };
  });
  return { state: next, recorded };
}

export function getActiveSession(state: SessionsState): Session | null {
  if (state.active_session_id === null) return null;
  return state.sessions.find((s) => s.id === state.active_session_id) ?? null;
}

/** Replace the active session via `update`; no-op (same reference) if none. */
function withActive(state: SessionsState, update: (session: Session) => Session): SessionsState {
  const active = getActiveSession(state);
  if (!active) return state;
  return {
    ...state,
    sessions: state.sessions.map((s) => (s.id === active.id ? freezeSession(update(s)) : s)),
  };
}

/** Deep-freeze a session: the object, its arrays, and its track snapshot.
 *  Updates always build a fresh session object, so freezing is safe. */
export function freezeSession(session: Session): Session {
  Object.freeze(session.track.conditions);
  Object.freeze(session.track);
  Object.freeze(session.runs);
  Object.freeze(session.outcomes);
  return Object.freeze(session);
}

function copyTrack(track: TrackInfo): TrackInfo {
  const copy = { ...track, conditions: Object.freeze([...track.conditions]) as string[] };
  return Object.freeze(copy);
}

/** Drop `undefined` entries so a partial patch never erases a field, and
 *  detach the caller's conditions array. */
function cleanTrackPatch(patch: Partial<TrackInfo>): Partial<TrackInfo> {
  const out: Partial<TrackInfo> = {};
  if (patch.name !== undefined) out.name = patch.name;
  if (patch.surface !== undefined) out.surface = patch.surface;
  if (patch.grip !== undefined) out.grip = patch.grip;
  if (patch.conditions !== undefined) out.conditions = [...patch.conditions];
  return out;
}

function nextId(prefix: "ss" | "run" | "oc", now: string): string {
  const ts = Date.parse(now);
  if (Number.isNaN(ts)) throw new Error(`nextId: invalid ISO timestamp '${now}'`);
  return `${prefix}-${ts.toString(36)}-${randomSuffix()}`;
}

/** Fixed-width 8-char base36 suffix (a bare Math.random().toString(36) can
 *  terminate early and collapse the collision space). */
function randomSuffix(): string {
  let s = "";
  while (s.length < 8) s += Math.random().toString(36).slice(2);
  return s.slice(0, 8);
}
