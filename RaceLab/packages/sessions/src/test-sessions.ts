import {
  addRun,
  endSession,
  getActiveSession,
  initSessions,
  recordOutcome,
  startSession,
  updateTrack,
} from "./sessions";
import type { TrackInfo } from "./sessions";
import { deserialize, serialize } from "./persist";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`✓ ${label}`);
  } else {
    failures++;
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const T0 = "2026-06-11T09:00:00.000Z";
const T1 = "2026-06-11T09:20:00.000Z";
const T2 = "2026-06-11T10:05:00.000Z";
const T3 = "2026-06-11T11:30:00.000Z";
const T4 = "2026-06-11T14:00:00.000Z";

const TRACK: TrackInfo = {
  name: "MCD Raceway",
  surface: "clay",
  grip: "medium",
  conditions: ["dry", "dusty"],
};

const RUN_BASE = { type: "practice" as const, setup_version_id: "sv-x", setup_name: "My setup" };
const OC_BASE = {
  setting: "front_sway_bar",
  change: "2.3 → 2.2",
  citations: ["kb:sway"],
  outcome: "better" as const,
  setup_version_id: "sv-x",
  setup_name: "My setup",
};

// init
let s = initSessions();
check("init: no sessions, none active", s.sessions.length === 0 && s.active_session_id === null);
check("getActiveSession is null on init", getActiveSession(s) === null);

// ops on an empty state are explicit no-ops (discriminated, same reference)
{
  const r = addRun(s, RUN_BASE, T0);
  check("addRun with no active session: logged null + same reference", r.logged === null && r.state === s);
  const o = recordOutcome(s, OC_BASE, T0);
  check("recordOutcome with no active session: recorded null + same reference", o.recorded === null && o.state === s);
  check("updateTrack with no active session is a no-op (same reference)", updateTrack(s, { grip: "high" }) === s);
  check("endSession with no active session is a no-op (same reference)", endSession(s, T0) === s);
}

// startSession
const init = s;
s = startSession(s, TRACK, T0);
const ss1 = getActiveSession(s)!;
check("startSession activates a new session", s.sessions.length === 1 && s.active_session_id === ss1.id && ss1.started_at === T0 && ss1.ended_at === undefined);
check("session ids use the ss- prefix + timestamp36", ss1.id.startsWith(`ss-${Date.parse(T0).toString(36)}-`));
check("startSession returns a NEW state (init unchanged)", s !== init && init.sessions.length === 0);
check("startSession copies the track (caller's object detached)", ss1.track !== TRACK && ss1.track.conditions !== TRACK.conditions && JSON.stringify(ss1.track) === JSON.stringify(TRACK));
check("double-start is a no-op (same reference)", startSession(s, { ...TRACK, name: "Elsewhere" }, T1) === s);
check("live session is frozen (push into runs throws)", (() => { try { (ss1.runs as unknown as { push: (x: unknown) => void }).push({}); return false; } catch { return true; } })());
check("live track is frozen (grip assignment throws)", (() => { try { (ss1.track as { grip: string }).grip = "high"; return false; } catch { return true; } })());

// addRun on the active session
const beforeRun = s;
const r1 = addRun(s, { type: "qualifier", setup_version_id: "sv-aaa", setup_name: "Softer front bar", best_lap_s: 34.21, lap_count: 12, feedback_text: "pushy entry" }, T1);
s = r1.state;
const run1 = getActiveSession(s)!.runs[0];
check("addRun appends and returns the logged run", r1.logged === run1 && run1.at === T1 && run1.type === "qualifier" && run1.best_lap_s === 34.21 && run1.lap_count === 12);
check("run carries the denormalized setup name", run1.setup_name === "Softer front bar");
check("run carries a track snapshot taken at log time", run1.track.grip === "medium" && run1.track.name === "MCD Raceway" && run1.track !== getActiveSession(s)!.track);
check("run ids use the run- prefix", run1.id.startsWith(`run-${Date.parse(T1).toString(36)}-`));
check("addRun never mutates (previous state's runs untouched)", getActiveSession(beforeRun)!.runs.length === 0);
check("logged runs are frozen (mutation throws)", (() => { try { (run1 as { best_lap_s?: number }).best_lap_s = 1; return false; } catch { return true; } })());
s = addRun(s, { type: "practice", setup_version_id: "sv-aaa", setup_name: "Softer front bar" }, T1).state;
check("optional run fields stay absent", getActiveSession(s)!.runs[1].best_lap_s === undefined && getActiveSession(s)!.runs[1].feedback_text === undefined);

// write-time numeric/ref guards (NaN survives serialize but poisons deserialize)
check("addRun rejects NaN best_lap_s (logged null, same reference)", (() => { const r = addRun(s, { ...RUN_BASE, best_lap_s: NaN }, T1); return r.logged === null && r.state === s; })());
check("addRun rejects Infinity best_lap_s", addRun(s, { ...RUN_BASE, best_lap_s: Infinity }, T1).logged === null);
check("addRun rejects negative best_lap_s", addRun(s, { ...RUN_BASE, best_lap_s: -3 }, T1).logged === null);
check("addRun rejects non-integer lap_count", addRun(s, { ...RUN_BASE, lap_count: 3.7 }, T1).logged === null);
check("addRun rejects an empty setup_version_id", addRun(s, { ...RUN_BASE, setup_version_id: " " }, T1).logged === null);

// recordOutcome on the active session
const beforeOutcome = s;
const citations = ["kb:diff-oil", "kb:track-grip"];
const o1 = recordOutcome(s, { setting: "rear_diff_oil", change: "3000 → 4000", citations, outcome: "better", setup_version_id: "sv-aaa", setup_name: "Softer front bar", note: "calmer exit" }, T2);
s = o1.state;
const oc1 = getActiveSession(s)!.outcomes[0];
check("recordOutcome appends and returns the record", o1.recorded === oc1 && oc1.at === T2 && oc1.outcome === "better" && oc1.setting === "rear_diff_oil" && oc1.note === "calmer exit");
check("outcome carries a track snapshot + setup name", oc1.track.grip === "medium" && oc1.setup_name === "Softer front bar");
check("outcome ids use the oc- prefix", oc1.id.startsWith(`oc-${Date.parse(T2).toString(36)}-`));
check("citations are copied, not shared with the caller", oc1.citations !== citations && JSON.stringify(oc1.citations) === JSON.stringify(citations));
check("recordOutcome never mutates (previous state untouched)", getActiveSession(beforeOutcome)!.outcomes.length === 0);

// updateTrack — and the learning-loop guarantee: snapshots are immune
const beforeTrack = s;
s = updateTrack(s, { grip: "blue_groove", conditions: ["dry", "grooved"] });
check("updateTrack patches only the given fields", getActiveSession(s)!.track.grip === "blue_groove" && getActiveSession(s)!.track.name === "MCD Raceway");
check("updateTrack never mutates (previous track untouched)", getActiveSession(beforeTrack)!.track.grip === "medium");
check("updateTrack ignores explicit undefined in the patch", getActiveSession(updateTrack(s, { name: undefined, grip: "high" }))!.track.name === "MCD Raceway");
check("LEARNING LOOP: past run/outcome snapshots survive updateTrack unfalsified", getActiveSession(s)!.runs[0].track.grip === "medium" && getActiveSession(s)!.outcomes[0].track.grip === "medium");

// endSession lifecycle
const beforeEnd = s;
s = endSession(s, T3);
check("endSession stamps ended_at and clears the active pointer", s.active_session_id === null && s.sessions[0].ended_at === T3);
check("endSession never mutates (previous state still active)", beforeEnd.active_session_id === ss1.id && getActiveSession(beforeEnd)!.ended_at === undefined);
check("runs/outcomes refuse again after ending", addRun(s, RUN_BASE, T3).logged === null && recordOutcome(s, OC_BASE, T3).recorded === null);

// a second session can start after the first ends
s = startSession(s, { name: "Indoor astro", surface: "astro", grip: "high", conditions: ["indoor"] }, T4);
check("a new session starts after the previous ended", s.sessions.length === 2 && s.active_session_id === s.sessions[1].id && s.sessions[0].ended_at === T3);
s = addRun(s, { type: "main", setup_version_id: "sv-ccc", setup_name: "Race sheet", best_lap_s: 29.8 }, T4).state;
check("runs land in the new active session only", s.sessions[1].runs.length === 1 && s.sessions[0].runs.length === 2);

// id uniqueness across many ops at the SAME timestamp (D21: never sequential)
let bulk = s;
for (let i = 0; i < 60; i++) {
  bulk = addRun(bulk, { type: "practice", setup_version_id: "sv-ccc", setup_name: "Race sheet" }, T4).state;
  bulk = recordOutcome(bulk, { setting: "camber", change: "-1 → -2", citations: [], outcome: "same", setup_version_id: "sv-ccc", setup_name: "Race sheet" }, T4).state;
}
const allIds = bulk.sessions.flatMap((x) => [x.id, ...x.runs.map((r) => r.id), ...x.outcomes.map((o) => o.id)]);
check("ids are globally unique across 120+ same-timestamp ops", new Set(allIds).size === allIds.length, `${allIds.length} ids, ${new Set(allIds).size} unique`);
check("nextId rejects an invalid timestamp (no run-NaN ids)", (() => { try { startSession(endSession(s, T4), TRACK, "not-a-date"); return false; } catch { return true; } })());

// serialization roundtrip + failure discrimination
const raw = serialize(s);
const back = deserialize(raw);
check("serialize/deserialize roundtrip", back.ok && JSON.stringify(back.state) === JSON.stringify(s));
check("deserialized records are re-frozen", (() => { if (!back.ok) return false; const r = back.state.sessions[1].runs[0]; try { (r as { best_lap_s?: number }).best_lap_s = 1; return false; } catch { return true; } })());
check("deserialize discriminates garbage as corrupt", (deserialize("{not json") as { reason: string }).reason === "corrupt");
check("deserialize discriminates non-envelope JSON as corrupt", (deserialize('{"hello":1}') as { reason: string }).reason === "corrupt");
check("deserialize discriminates future formats (no silent wipe)", (deserialize(raw.replace('"format":1', '"format":99')) as { reason: string }).reason === "unknown_format");
check("deserialize rejects a dangling active_session_id", (deserialize(raw.replace(new RegExp(`"active_session_id":"[^"]+"`), '"active_session_id":"ss-ghost"')) as { reason: string }).reason === "corrupt");
check("deserialize rejects an active pointer at an ENDED session", (deserialize(serialize({ ...endSession(s, T4), active_session_id: s.sessions[0].id })) as { reason: string }).reason === "corrupt");
check("deserialize rejects duplicate session ids", (() => { const ended = endSession(s, T4); const dup = { ...ended, sessions: [...ended.sessions, ended.sessions[0]] }; return (deserialize(serialize(dup)) as { reason?: string }).reason === "corrupt"; })());
check("deserialize rejects an orphaned still-open session", (() => { const orphanRaw = serialize(s).replace(new RegExp(`"active_session_id":"[^"]+"`), '"active_session_id":null'); return (deserialize(orphanRaw) as { reason?: string }).reason === "corrupt"; })());
check("deserialize accepts a null active pointer with closed history", deserialize(serialize(endSession(s, T4))).ok);
check("deserialize rejects an invalid run type", (deserialize(raw.replace('"type":"qualifier"', '"type":"sunday"')) as { reason: string }).reason === "corrupt");
check("deserialize rejects an invalid outcome", (deserialize(raw.replace('"outcome":"better"', '"outcome":"meh"')) as { reason: string }).reason === "corrupt");
check("deserialize rejects an invalid surface", (deserialize(raw.replace('"surface":"clay"', '"surface":"lava"')) as { reason: string }).reason === "corrupt");
check("deserialize rejects a session missing started_at", (deserialize(raw.replace('"started_at"', '"startedat"')) as { reason: string }).reason === "corrupt");
check("deserialize rejects a run missing its track snapshot", (() => { const mangled = raw.replace(new RegExp(`("id":"run-[^"]+","at":"[^"]+","type":"[^"]+","setup_version_id":"[^"]+","setup_name":"[^"]+"),"track"`), '$1,"trackk"'); return mangled !== raw && (deserialize(mangled) as { reason?: string }).reason === "corrupt"; })());
check("deserialize rejects a non-number best_lap_s", (deserialize(raw.replace('"best_lap_s":29.8', '"best_lap_s":"29.8"')) as { reason: string }).reason === "corrupt");

console.log(failures === 0 ? `\nSESSIONS: all checks passed (${failures === 0 ? "" : ""}hardened per review)` : `\nSESSIONS: ${failures} failures`);
if (failures > 0) process.exit(1);
