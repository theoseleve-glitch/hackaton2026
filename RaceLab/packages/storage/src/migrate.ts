/**
 * Legacy-blob migration — lifts the pre-schema AsyncStorage blobs written by
 * apps/mobile/src/store.ts into canonical schema entities:
 *
 *   racelab:sheets:<chassis_id>  (packages/sheets serialize, format 1)
 *     → used ONLY to learn the chassis/template id for the synthesized Car
 *   racelab:sessions:v1          (packages/sessions persist, format 1)
 *     → Sessions → Track entities (deduped by name+surface) + RunEntry /
 *       OutcomeRecord via the schema bridge (liftSessionsRun/Outcome)
 *
 * NON-DESTRUCTIVE: `migrateLegacyBlobs` reads, lifts and reports — it writes
 * and deletes NOTHING (the caller decides; the legacy blobs stay where they
 * are). `applyMigration` writes the lifted entities through the repos (and
 * therefore the outbox) and is IDEMPOTENT: every id is minted from a PRNG
 * seeded by the legacy ids/keys, so lifting the same blobs twice yields
 * byte-identical entities, and applyMigration skips ids that already exist —
 * a second apply writes nothing and journals nothing.
 *
 * Defaults baked into the lift (single-car era facts, see report notes):
 *  - power_type "nitro" (the legacy store was MP11-only)
 *  - indoor false (outdoor dominates 1/8 offroad; sessions never recorded it)
 *  - all sessions share one synthesized Car; per-(name,surface) Tracks
 */

import type {
  Car,
  CarId,
  IsoDateTime,
  OutcomeRecord,
  RunEntry,
  SessionId,
  SessionsLiftContext,
  SessionsOutcomeRecord,
  SessionsRun,
  Track,
  TrackId,
} from "../../schema/src/index";
import {
  CUSTOM_CHASSIS_ID,
  GRIPS,
  OUTCOMES,
  RUN_TYPES,
  SURFACES,
  isId,
  liftSessionsOutcome,
  liftSessionsRun,
  makeCar,
  makeId,
  makeTrack,
} from "../../schema/src/index";
import type { KeyValueDriver } from "./interfaces";
import type { Repos } from "./repos";

export const LEGACY_SHEETS_PREFIX = "racelab:sheets:";
export const LEGACY_SESSIONS_PREFIX = "racelab:sessions";

// ── deterministic entropy (idempotent re-lift depends on it) ────────────────

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 seeded from a string — same seed, same id, forever. */
export function seededRand(seed: string): () => number {
  let a = fnv1a(seed) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── report / result shapes ───────────────────────────────────────────────────

export interface LiftedEntities {
  cars: readonly Car[];
  tracks: readonly Track[];
  runs: readonly RunEntry[];
  outcomes: readonly OutcomeRecord[];
}

export interface MigrationSkip {
  kind: "blob" | "session" | "run" | "outcome";
  id: string; // blob key / legacy entity id
  reason: string;
}

export interface MigrationReport {
  sheets_keys: readonly string[];
  sessions_keys: readonly string[];
  sessions_found: number;
  lifted: { cars: number; tracks: number; runs: number; outcomes: number };
  skipped: readonly MigrationSkip[];
  notes: readonly string[];
}

export type MigrateResult =
  | { ok: true; lifted: LiftedEntities; report: MigrationReport }
  | { ok: false; reason: string };

// ── legacy shapes (structural, validated before casting) ────────────────────

interface LegacySession {
  id: string;
  started_at: string;
  track: { name: string; surface: string; grip: string; conditions: unknown[] };
  runs: unknown[];
  outcomes: unknown[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function isoOk(v: unknown): v is string {
  return typeof v === "string" && !Number.isNaN(Date.parse(v));
}
function inEnum(arr: readonly string[], v: unknown): v is string {
  return typeof v === "string" && arr.includes(v);
}
function strList(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function legacyTrackBad(t: unknown): string | null {
  if (!isRecord(t)) return "track";
  if (typeof t.name !== "string" || t.name.trim() === "") return "track.name";
  if (!inEnum(SURFACES, t.surface)) return "track.surface";
  if (!inEnum(GRIPS, t.grip)) return "track.grip";
  if (!strList(t.conditions)) return "track.conditions";
  return null;
}

function legacySessionBad(s: unknown): string | null {
  if (!isRecord(s)) return "session";
  if (typeof s.id !== "string" || s.id.trim() === "") return "id";
  if (!isoOk(s.started_at)) return "started_at";
  const t = legacyTrackBad(s.track);
  if (t !== null) return t;
  if (!Array.isArray(s.runs)) return "runs";
  if (!Array.isArray(s.outcomes)) return "outcomes";
  return null;
}

function legacyRunBad(r: unknown): string | null {
  if (!isRecord(r)) return "run";
  if (typeof r.id !== "string" || r.id.trim() === "") return "id";
  if (!isoOk(r.at)) return "at";
  if (!inEnum(RUN_TYPES, r.type)) return "type";
  if (typeof r.setup_version_id !== "string") return "setup_version_id";
  if (typeof r.setup_name !== "string") return "setup_name";
  const t = legacyTrackBad(r.track);
  if (t !== null) return t;
  if (r.best_lap_s !== undefined && !(typeof r.best_lap_s === "number" && Number.isFinite(r.best_lap_s))) {
    return "best_lap_s";
  }
  if (r.lap_count !== undefined && !(typeof r.lap_count === "number" && Number.isInteger(r.lap_count))) {
    return "lap_count";
  }
  if (r.feedback_text !== undefined && typeof r.feedback_text !== "string") return "feedback_text";
  return null;
}

function legacyOutcomeBad(o: unknown): string | null {
  if (!isRecord(o)) return "outcome";
  if (typeof o.id !== "string" || o.id.trim() === "") return "id";
  if (!isoOk(o.at)) return "at";
  if (typeof o.setting !== "string") return "setting";
  if (typeof o.change !== "string") return "change";
  if (!strList(o.citations)) return "citations";
  if (!inEnum(OUTCOMES, o.outcome)) return "outcome";
  if (typeof o.setup_version_id !== "string") return "setup_version_id";
  if (typeof o.setup_name !== "string") return "setup_name";
  const t = legacyTrackBad(o.track);
  if (t !== null) return t;
  if (o.note !== undefined && typeof o.note !== "string") return "note";
  return null;
}

// ── lift ─────────────────────────────────────────────────────────────────────

/** Read the legacy blobs and lift them into schema entities. Writes NOTHING,
 *  deletes NOTHING — corrupt blobs are reported and left exactly where they
 *  are (caller decides). Deterministic: same blobs → identical entities. */
export async function migrateLegacyBlobs(kv: KeyValueDriver): Promise<MigrateResult> {
  let keys: readonly string[];
  try {
    keys = await kv.getAllKeys();
  } catch {
    return { ok: false, reason: "driver_error" };
  }
  const sheetsKeys = keys
    .filter((k) => k.startsWith(LEGACY_SHEETS_PREFIX) && !k.includes(":backup:"))
    .sort();
  const sessionsKeys = keys
    .filter((k) => k.startsWith(LEGACY_SESSIONS_PREFIX) && !k.includes(":backup:"))
    .sort();

  const skipped: MigrationSkip[] = [];
  const notes: string[] = [];

  // ── chassis facts from the sheets blob (car synthesis only) ───────────────
  let chassisId: string | null = null;
  let templateId: string | null = null;
  for (const key of sheetsKeys) {
    let raw: string | null;
    try {
      raw = await kv.getItem(key);
    } catch {
      return { ok: false, reason: "driver_error" };
    }
    if (raw === null) continue;
    let env: unknown;
    try {
      env = JSON.parse(raw);
    } catch {
      skipped.push({ kind: "blob", id: key, reason: "corrupt_json" });
      continue;
    }
    if (!isRecord(env) || env.format !== 1 || !isRecord(env.state)) {
      skipped.push({ kind: "blob", id: key, reason: "unknown_format" });
      continue;
    }
    const suffix = key.slice(LEGACY_SHEETS_PREFIX.length);
    if (chassisId === null) {
      chassisId = suffix.trim() !== "" ? suffix : null;
      templateId = typeof env.state.template_id === "string" ? env.state.template_id : null;
    } else {
      notes.push(`multiple sheets blobs found; car synthesized from '${chassisId}' only (single-car era)`);
    }
  }

  // ── sessions ───────────────────────────────────────────────────────────────
  const sessions: LegacySession[] = [];
  for (const key of sessionsKeys) {
    let raw: string | null;
    try {
      raw = await kv.getItem(key);
    } catch {
      return { ok: false, reason: "driver_error" };
    }
    if (raw === null) continue;
    let env: unknown;
    try {
      env = JSON.parse(raw);
    } catch {
      skipped.push({ kind: "blob", id: key, reason: "corrupt_json" });
      continue;
    }
    if (!isRecord(env) || env.format !== 1 || !isRecord(env.state) || !Array.isArray(env.state.sessions)) {
      skipped.push({ kind: "blob", id: key, reason: "unknown_format" });
      continue;
    }
    for (const s of env.state.sessions) {
      const bad = legacySessionBad(s);
      if (bad !== null) {
        const id = isRecord(s) && typeof s.id === "string" ? s.id : "?";
        skipped.push({ kind: "session", id, reason: `invalid:${bad}` });
        continue;
      }
      sessions.push(s as unknown as LegacySession);
    }
  }
  sessions.sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));

  const empty: LiftedEntities = { cars: [], tracks: [], runs: [], outcomes: [] };
  const reportBase = {
    sheets_keys: sheetsKeys,
    sessions_keys: sessionsKeys,
    sessions_found: sessions.length,
  };
  if (sessions.length === 0) {
    notes.push("no liftable sessions found — nothing to migrate");
    return {
      ok: true,
      lifted: empty,
      report: { ...reportBase, lifted: { cars: 0, tracks: 0, runs: 0, outcomes: 0 }, skipped, notes },
    };
  }

  // ── synthesize the single-car-era Car (deterministic id) ──────────────────
  const firstMs = Date.parse(sessions[0].started_at);
  const chassis = chassisId ?? CUSTOM_CHASSIS_ID;
  const carTemplateId = templateId ?? chassisId ?? "legacy-unknown";
  if (chassisId === null) notes.push("no readable sheets blob — car synthesized as 'custom' chassis");
  notes.push("power_type defaulted to 'nitro' (legacy store was single-car MP11 era)");
  const carRes = makeCar(
    { name: `Legacy car (${chassis})`, chassis_id: chassis, power_type: "nitro" },
    sessions[0].started_at,
    undefined,
    seededRand(`car|${chassis}`),
  );
  if (!carRes.ok) return { ok: false, reason: `car_synthesis_failed:${carRes.reason}` };
  const car = carRes.car;

  // ── tracks, deduped by (name, surface), deterministic ids ──────────────────
  const trackIds = new Map<string, TrackId>();
  const tracks: Track[] = [];
  for (const s of sessions) {
    const key = `${s.track.name.trim().toLowerCase()}|${s.track.surface}`;
    if (trackIds.has(key)) continue;
    const tRes = makeTrack(
      {
        name: s.track.name,
        surface: s.track.surface as Track["surface"],
        indoor: false,
        is_public: false,
      },
      s.started_at,
      seededRand(`trk|${key}`),
    );
    if (!tRes.ok) {
      skipped.push({ kind: "session", id: s.id, reason: `track_synthesis_failed:${tRes.reason}` });
      continue;
    }
    trackIds.set(key, tRes.track.id);
    tracks.push(tRes.track);
  }

  // ── runs + outcomes via the schema bridge ──────────────────────────────────
  const runs: RunEntry[] = [];
  const outcomes: OutcomeRecord[] = [];
  for (const s of sessions) {
    const key = `${s.track.name.trim().toLowerCase()}|${s.track.surface}`;
    const track_id = trackIds.get(key);
    if (track_id === undefined) continue; // track synthesis failed, already reported
    const session_id: SessionId = isId("ss", s.id)
      ? (s.id as SessionId)
      : makeId("ss", Date.parse(s.started_at), seededRand(`ss|${s.id}`));
    const ctx: SessionsLiftContext = {
      track_id,
      session_id,
      car_id: car.id as CarId,
      car_name: car.name,
      car_template_id: carTemplateId,
      indoor: false,
    };
    for (const r of s.runs) {
      const bad = legacyRunBad(r);
      const id = isRecord(r) && typeof r.id === "string" ? r.id : "?";
      if (bad !== null) {
        skipped.push({ kind: "run", id, reason: `invalid:${bad}` });
        continue;
      }
      try {
        const lifted = liftSessionsRun(r as unknown as SessionsRun, ctx, seededRand(`run|${id}`));
        if (lifted.ok) runs.push(lifted.run);
        else skipped.push({ kind: "run", id, reason: lifted.reason });
      } catch (e) {
        skipped.push({ kind: "run", id, reason: `lift_threw:${String(e)}` });
      }
    }
    for (const o of s.outcomes) {
      const bad = legacyOutcomeBad(o);
      const id = isRecord(o) && typeof o.id === "string" ? o.id : "?";
      if (bad !== null) {
        skipped.push({ kind: "outcome", id, reason: `invalid:${bad}` });
        continue;
      }
      try {
        const lifted = liftSessionsOutcome(o as unknown as SessionsOutcomeRecord, ctx, seededRand(`oc|${id}`));
        if (lifted.ok) outcomes.push(lifted.record);
        else skipped.push({ kind: "outcome", id, reason: lifted.reason });
      } catch (e) {
        skipped.push({ kind: "outcome", id, reason: `lift_threw:${String(e)}` });
      }
    }
  }

  return {
    ok: true,
    lifted: { cars: [car], tracks, runs, outcomes },
    report: {
      ...reportBase,
      lifted: { cars: 1, tracks: tracks.length, runs: runs.length, outcomes: outcomes.length },
      skipped,
      notes,
    },
  };
}

// ── apply ────────────────────────────────────────────────────────────────────

export interface AppliedCounts {
  cars: number;
  tracks: number;
  runs: number;
  outcomes: number;
}

export type ApplyResult =
  | { ok: true; applied: AppliedCounts; skipped: number }
  | { ok: false; reason: string; applied: AppliedCounts; skipped: number };

/** Write the lifted entities through the repos (and therefore the outbox).
 *  IDEMPOTENT: ids that already exist are skipped — re-running after a crash
 *  or running twice duplicates nothing and journals nothing extra. Existing
 *  docs are NEVER overwritten (including unreadable ones — never-wipe). */
export async function applyMigration(
  repos: Repos,
  lifted: LiftedEntities,
  now: IsoDateTime,
): Promise<ApplyResult> {
  const applied: AppliedCounts = { cars: 0, tracks: 0, runs: 0, outcomes: 0 };
  let skipped = 0;

  async function apply<T extends { id: string }>(
    kind: keyof AppliedCounts,
    values: readonly T[],
    repo: {
      get(id: string): Promise<{ ok: true; value: T | null } | { ok: false; reason: string; quarantined: boolean }>;
      put(value: T, now: IsoDateTime): Promise<{ ok: true } | { ok: false; reason: string }>;
    },
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    for (const value of values) {
      const existing = await repo.get(value.id);
      if (!existing.ok || existing.value !== null) {
        skipped++; // present (or unreadable — never overwrite) ⇒ skip
        continue;
      }
      const res = await repo.put(value, now);
      if (!res.ok) return { ok: false, reason: `${kind}/${value.id}: ${res.reason}` };
      applied[kind]++;
    }
    return { ok: true };
  }

  const steps: (() => Promise<{ ok: true } | { ok: false; reason: string }>)[] = [
    () => apply("cars", lifted.cars, repos.cars),
    () => apply("tracks", lifted.tracks, repos.tracks),
    () => apply("runs", lifted.runs, repos.runs),
    () => apply("outcomes", lifted.outcomes, repos.outcomes),
  ];
  for (const step of steps) {
    const r = await step();
    if (!r.ok) return { ok: false, reason: r.reason, applied, skipped };
  }
  return { ok: true, applied, skipped };
}
