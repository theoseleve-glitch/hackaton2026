import { trackCharacterNotes, trackConditionTags } from "./conditions";
import { deserializeTracks, serializeTracks } from "./persist";
import {
  addTrack,
  deleteTrack,
  getTrack,
  initTracks,
  updateTrack,
  upsertRecord,
} from "./tracks";
import type { CornerSpec, TrackEntity } from "./types";

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
const T1 = "2026-06-11T10:00:00.000Z";

function trackFixture(over: Partial<Omit<TrackEntity, "id">> = {}): Omit<TrackEntity, "id"> {
  return {
    name: "MRT",
    surface: "clay",
    indoor: false,
    visibility: "private",
    gps: { lat: 48.5, lon: 4.3 },
    length_m: 320,
    traits: ["bumpy", "dusty"],
    corners: [
      { n: 1, direction: "left", shape: "hairpin", features: ["bump", "kerb"] },
      { n: 2, direction: "right", shape: "sweeper", features: [] },
      { n: 3, direction: "left", shape: "chicane", features: ["rut"], surface: "hard-packed" },
    ],
    records: [],
    created_at: T0,
    ...over,
  };
}

// — state ops
let s = initTracks();
check("initTracks starts empty", s.tracks.length === 0);
const a1 = addTrack(s, trackFixture(), T0);
s = a1.state;
const a2 = addTrack(s, trackFixture({ name: "Indoor Carpet", surface: "carpet", indoor: true, traits: ["smooth", "technical_tight"], corners: [], created_at: T1 }), T1);
s = a2.state;
check("addTrack appends chronologically with unique ids", s.tracks.length === 2 && s.tracks[0].id !== s.tracks[1].id);
check("addTrack returns the created entity", a2.track.name === "Indoor Carpet" && getTrack(s, a2.track.id) === s.tracks[1]);
check("getTrack unknown id is undefined", getTrack(s, "nope") === undefined);

const beforeUpdate = s;
s = updateTrack(s, a1.track.id, { notes: "watch the kicker after T3", visibility: "public" });
check("updateTrack patches in place, new state", s !== beforeUpdate && s.tracks[0].notes === "watch the kicker after T3" && s.tracks[0].visibility === "public");
check("updateTrack preserves id/created_at", s.tracks[0].id === a1.track.id && s.tracks[0].created_at === T0);
check("updateTrack unknown id is a no-op (same reference)", updateTrack(s, "nope", { notes: "x" }) === s);

// — records (auto-update from run results)
s = upsertRecord(s, a1.track.id, { category: "1/8 buggy", conditions: "dry", lap_s: 34.2, holder: "Théo", date: T0 });
check("upsertRecord adds when category+conditions absent", getTrack(s, a1.track.id)?.records.length === 1);
s = upsertRecord(s, a1.track.id, { category: "1/8 buggy", lap_s: 36.0 });
check("upsertRecord treats different conditions as a separate record", getTrack(s, a1.track.id)?.records.length === 2);
const beforeSlower = s;
check("upsertRecord slower lap is a no-op (same reference)", upsertRecord(s, a1.track.id, { category: "1/8 buggy", conditions: "dry", lap_s: 34.9 }) === beforeSlower);
check("upsertRecord equal lap is a no-op (same reference)", upsertRecord(s, a1.track.id, { category: "1/8 buggy", conditions: "dry", lap_s: 34.2 }) === beforeSlower);
s = upsertRecord(s, a1.track.id, { category: "1/8 buggy", conditions: "dry", lap_s: 33.8, holder: "William" });
{
  const rec = getTrack(s, a1.track.id)?.records.find((r) => r.conditions === "dry");
  check("upsertRecord faster lap replaces the record (holder too)", rec?.lap_s === 33.8 && rec?.holder === "William");
  check("upsertRecord keeps the record count when replacing", getTrack(s, a1.track.id)?.records.length === 2);
}
check("upsertRecord unknown track is a no-op (same reference)", upsertRecord(s, "nope", { category: "1/8 buggy", lap_s: 30 }) === s);

// — condition tags (bridge to the engine taxonomy)
{
  const tags = trackConditionTags(s.tracks[0]);
  check("tags: traits bumpy+dusty map through", tags.includes("bumpy") && tags.includes("dusty"), tags.join(","));
  check("tags: 2/3 corners with bump/rut → bumpy + rough", tags.includes("rough"), tags.join(","));
  const closed = ["low_grip", "high_grip", "blue_groove", "dusty", "wet", "bumpy", "rough", "smooth", "technical_tight", "fast_open", "big_jumps", "hot", "cold"];
  check("tags: only closed-vocabulary values, deduplicated", tags.every((t) => closed.includes(t)) && new Set(tags).size === tags.length);
}
check("tags: smooth + technical_tight traits map through", (() => { const t = trackConditionTags(s.tracks[1]); return t.includes("smooth") && t.includes("technical_tight"); })());
{
  const corners: CornerSpec[] = Array.from({ length: 10 }, (_, i) => ({ n: i + 1, direction: "left" as const, features: i < 3 ? (["bump"] as CornerSpec["features"]) : [] }));
  const exactly30 = { ...trackFixture({ traits: [], corners }), id: "t-x" };
  check("tags: exactly 30% bumpy corners hits the threshold", trackConditionTags(exactly30).includes("rough"));
  const under30 = { ...exactly30, corners: corners.map((c, i) => (i === 2 ? { ...c, features: [] } : c)) };
  check("tags: 20% bumpy corners stays below the threshold", !trackConditionTags(under30).includes("bumpy"));
}
{
  const jumpy = { ...trackFixture({ traits: ["fast_open", "big_jumps"], corners: [{ n: 1, direction: "right" as const, features: ["jump" as const] }] }), id: "t-j" };
  const tags = trackConditionTags(jumpy);
  check("tags: fast_open trait + jump corner → fast_open, big_jumps once", tags.includes("fast_open") && tags.filter((t) => t === "big_jumps").length === 1);
}
{
  const empty = { ...trackFixture({ traits: [], corners: [] }), id: "t-e" };
  check("tags: no traits, no corners → no tags", trackConditionTags(empty).length === 0);
}
{
  const banked = { ...trackFixture({ traits: ["banked", "off_camber", "high_kerbs", "slopes", "mixed_surface"], corners: [] }), id: "t-b" };
  check("non-taxonomy traits emit NO tags", trackConditionTags(banked).length === 0, trackConditionTags(banked).join(","));
  const notes = trackCharacterNotes(banked);
  check("characterNotes: human strings for every non-taxonomy trait", notes.length === 5 && notes.includes("banked corners") && notes.includes("off-camber sections") && notes.includes("kerbs in play"));
  check("characterNotes: empty when no such trait", trackCharacterNotes(s.tracks[0]).length === 0);
}

// — v2 fields: corner names + multi-surface tracks
{
  const named: CornerSpec[] = [
    { n: 1, direction: "left", shape: "hairpin", name: "hairpin du fond", features: [] },
    { n: 2, direction: "right", shape: "esses", name: "le triple", features: ["jump"] },
  ];
  const mixed = { ...trackFixture({ surfaces: ["clay", "astro"], corners: named }), id: "t-m" };
  check("v2: corner names carried", mixed.corners[0].name === "hairpin du fond" && mixed.corners[1].name === "le triple");
  check("v2: surface stays the primary = surfaces[0]", mixed.surface === "clay" && mixed.surfaces?.[0] === "clay");
  const tags = trackConditionTags(mixed);
  check("v2: multi-surface emits NO mixed_surface tag (not in the taxonomy)", !tags.includes("mixed_surface"), tags.join(","));
  const notes = trackCharacterNotes(mixed);
  check("v2: multi-surface lands in characterNotes instead", notes.includes("mixed surface track"), notes.join(" | "));
  const single = { ...trackFixture({ surfaces: ["clay"] }), id: "t-s" };
  check("v2: single-entry surfaces → no mixed-surface note", !trackCharacterNotes(single).includes("mixed surface track"));
  const both = { ...trackFixture({ traits: ["mixed_surface"], surfaces: ["clay", "grass"], corners: [] }), id: "t-2" };
  check(
    "v2: mixed_surface trait note and surfaces note coexist, trait notes first",
    JSON.stringify(trackCharacterNotes(both)) === JSON.stringify(["mixed surface", "mixed surface track"]),
    trackCharacterNotes(both).join(" | "),
  );
  const rt = deserializeTracks(serializeTracks({ tracks: [mixed] }));
  check(
    "v2: corner names + surfaces survive the round-trip",
    rt.ok && rt.state.tracks[0].corners[1].name === "le triple" && JSON.stringify(rt.state.tracks[0].surfaces) === '["clay","astro"]',
  );
}

// — format-1 migration: a stored v1 blob must read clean, never as corruption
{
  const v1raw =
    '{"format":1,"state":{"tracks":[{"id":"track-old","name":"MRT","surface":"clay","indoor":false,"visibility":"private","traits":["bumpy"],"corners":[{"n":1,"direction":"left","features":["bump"]}],"records":[],"created_at":"2026-05-01T10:00:00.000Z"}]}}';
  const m = deserializeTracks(v1raw);
  check(
    "format-1 envelope migrates: ok, track intact, surfaces defaulted to [surface]",
    m.ok && m.state.tracks[0].id === "track-old" && JSON.stringify(m.state.tracks[0].surfaces) === '["clay"]',
  );
  check("format-1 migration keeps surface the primary", m.ok && m.state.tracks[0].surface === "clay");
  check("format-1 migration adds no corner names out of thin air", m.ok && m.state.tracks[0].corners[0].name === undefined);
}

// — persistence
const raw = serializeTracks(s);
check("serialize writes format 2", raw.startsWith('{"format":2'));
const round = deserializeTracks(raw);
check("serialize/deserialize round-trips", round.ok && JSON.stringify(round.state) === JSON.stringify(s));
check("corrupt blob refused, not wiped", deserializeTracks("{nope").ok === false);
check("valid JSON, wrong shape → corrupt", (() => { const r = deserializeTracks(JSON.stringify({ format: 1, state: { tracks: [{ id: 7 }] } })); return !r.ok && r.reason === "corrupt"; })());
check("newer format preserved as unknown_format", (() => { const r = deserializeTracks(JSON.stringify({ format: 99, state: { tracks: [] } })); return !r.ok && r.reason === "unknown_format"; })());

// — delete
s = deleteTrack(s, a2.track.id);
check("deleteTrack removes the track", s.tracks.length === 1 && s.tracks[0].id === a1.track.id);
check("deleteTrack unknown id is a no-op (same reference)", deleteTrack(s, "nope") === s);

if (failures > 0) {
  console.error(`\n${failures} tracks test(s) failed`);
  process.exit(1);
}
console.log("\nAll tracks tests passed");
