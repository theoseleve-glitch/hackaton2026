import {
  cornerFromTurn,
  cornersOf,
  toSchemaSurface,
  trackCharacterNotes,
  trackConditionTags,
  turnFromCorner,
} from "./conditions";
import { deserializeTracks, serializeTracks } from "./persist";
import {
  addTrack,
  deleteTrack,
  getTrack,
  initTracks,
  updateTrack,
  upsertRecord,
} from "./tracks";
import type { CornerSpec } from "./types";
import { makeTrack } from "../../schema/src/index";
import type { MakeTrackInput, Track, TrackTurn } from "../../schema/src/index";

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

/** Mint a schema Track the way the form does (turns from corners). */
function mintTrack(over: Partial<MakeTrackInput> = {}, now = T0): Track {
  const corners: CornerSpec[] = [
    { n: 1, direction: "left", shape: "hairpin", features: ["bump", "kerb"] },
    { n: 2, direction: "right", shape: "sweeper", features: [] },
    { n: 3, direction: "left", shape: "chicane", features: ["rut"], surface: "hard_packed_dirt" },
  ];
  const input: MakeTrackInput = {
    name: "MRT",
    surface: "clay",
    indoor: false,
    is_public: false,
    gps: { lat: 48.5, lon: 4.3 },
    traits: ["bumpy", "dusty"],
    turns: corners.map(turnFromCorner),
    records: [],
    ...over,
  };
  const r = makeTrack(input, now);
  if (!r.ok) throw new Error(`fixture makeTrack failed: ${r.reason}`);
  return r.track;
}

// — surface narrowing
check("toSchemaSurface: passthrough for a schema surface", toSchemaSurface("astro") === "astro");
check("toSchemaSurface: rich carpet → carpet", toSchemaSurface("carpet_offroad") === "carpet");
check("toSchemaSurface: rich hard id → hard-packed", toSchemaSurface("hard_packed_dirt") === "hard-packed");
check("toSchemaSurface: astroturf → astro", toSchemaSurface("astroturf") === "astro");
check("toSchemaSurface: unknown → clay default", toSchemaSurface("weird") === "clay");

// — corner ⇄ turn round-trip (form view)
{
  const c: CornerSpec = { n: 2, name: "le triple", direction: "right", shape: "esses", features: ["jump"], note: "lands long" };
  const tn = turnFromCorner(c);
  check("turnFromCorner: direction right → R, jump → jump_section", tn.direction === "R" && tn.corner_type === "jump_section");
  const back = cornerFromTurn(tn);
  check("cornerFromTurn: name + note round-trip through notes", back.name === "le triple" && back.note === "lands long");
  check("cornerFromTurn: jump feature reconstructed", back.features.includes("jump") && back.direction === "right");
}

// — state ops
let s = initTracks();
check("initTracks starts empty", s.tracks.length === 0);
const t1 = mintTrack({}, T0);
s = addTrack(s, t1).state;
const t2 = mintTrack({ name: "Indoor Carpet", surface: "carpet", indoor: true, traits: ["smooth", "technical_tight"], turns: [] }, T1);
s = addTrack(s, t2).state;
check("addTrack appends with unique ids", s.tracks.length === 2 && s.tracks[0].id !== s.tracks[1].id);
check("getTrack finds by id", getTrack(s, t2.id)?.name === "Indoor Carpet");
check("getTrack unknown id is undefined", getTrack(s, "nope") === undefined);

const beforeUpdate = s;
s = updateTrack(s, t1.id, { notes: "watch the kicker after T3", is_public: true });
check("updateTrack patches in place, new state", s !== beforeUpdate && s.tracks[0].notes === "watch the kicker after T3" && s.tracks[0].is_public === true);
check("updateTrack preserves id/created_at", s.tracks[0].id === t1.id && s.tracks[0].created_at === T0);
check("updateTrack unknown id is a no-op (same reference)", updateTrack(s, "nope", { notes: "x" }) === s);

// — records (schema TrackRecord: class + best_lap_s + conditions)
s = upsertRecord(s, t1.id, { class: "1/8 buggy", conditions: "dry", best_lap_s: 34.2, holder: "Théo", source: "manual" });
check("upsertRecord adds when class+conditions absent", getTrack(s, t1.id)?.records.length === 1);
s = upsertRecord(s, t1.id, { class: "1/8 buggy", best_lap_s: 36.0, source: "manual" });
check("upsertRecord treats different conditions as a separate record", getTrack(s, t1.id)?.records.length === 2);
const beforeSlower = s;
check("upsertRecord slower lap is a no-op (same reference)", upsertRecord(s, t1.id, { class: "1/8 buggy", conditions: "dry", best_lap_s: 34.9, source: "manual" }) === beforeSlower);
s = upsertRecord(s, t1.id, { class: "1/8 buggy", conditions: "dry", best_lap_s: 33.8, holder: "William", source: "manual" });
{
  const rec = getTrack(s, t1.id)?.records.find((r) => r.conditions === "dry");
  check("upsertRecord faster lap replaces the record (holder too)", rec?.best_lap_s === 33.8 && rec?.holder === "William");
  check("upsertRecord keeps the record count when replacing", getTrack(s, t1.id)?.records.length === 2);
}
check("upsertRecord unknown track is a no-op (same reference)", upsertRecord(s, "nope", { class: "1/8 buggy", best_lap_s: 30, source: "manual" }) === s);

// — condition tags (bridge to the engine taxonomy)
{
  const tags = trackConditionTags(s.tracks[0]);
  check("tags: traits bumpy+dusty map through", tags.includes("bumpy") && tags.includes("dusty"), tags.join(","));
  check("tags: 2/3 corners bumpy → rough", tags.includes("rough"), tags.join(","));
  const closed = ["low_grip", "high_grip", "blue_groove", "dusty", "wet", "bumpy", "rough", "smooth", "technical_tight", "fast_open", "big_jumps", "hot", "cold"];
  check("tags: only closed-vocabulary values, deduplicated", tags.every((t) => closed.includes(t)) && new Set(tags).size === tags.length);
}
check("tags: smooth + technical_tight traits map through", (() => { const t = trackConditionTags(s.tracks[1]); return t.includes("smooth") && t.includes("technical_tight"); })());
{
  const turns: TrackTurn[] = Array.from({ length: 10 }, (_, i) => ({ n: i + 1, direction: "L" as const, corner_type: "other" as const, ...(i < 3 ? { bumps: "rough" as const } : {}) }));
  const exactly30 = mintTrack({ traits: [], turns });
  check("tags: exactly 30% bumpy corners hits the threshold", trackConditionTags(exactly30).includes("rough"));
  const turnsUnder = turns.map((tn, i) => (i === 2 ? { n: tn.n, direction: tn.direction, corner_type: tn.corner_type } : tn));
  const under30 = mintTrack({ traits: [], turns: turnsUnder });
  check("tags: 20% bumpy corners stays below the threshold", !trackConditionTags(under30).includes("bumpy"));
}
{
  const jumpy = mintTrack({ traits: ["fast_open", "big_jumps"], turns: [{ n: 1, direction: "R", corner_type: "jump_section" }] });
  const tags = trackConditionTags(jumpy);
  check("tags: fast_open trait + jump corner → fast_open, big_jumps once", tags.includes("fast_open") && tags.filter((t) => t === "big_jumps").length === 1);
}
{
  const empty = mintTrack({ traits: [], turns: [] });
  check("tags: no traits, no corners → no tags", trackConditionTags(empty).length === 0);
}
{
  const banked = mintTrack({ traits: ["banked", "off_camber", "high_kerbs", "slopes", "mixed_surface"], turns: [] });
  check("non-taxonomy traits emit NO tags", trackConditionTags(banked).length === 0, trackConditionTags(banked).join(","));
  const notes = trackCharacterNotes(banked);
  check("characterNotes: human strings for every non-taxonomy trait", notes.includes("banked corners") && notes.includes("off-camber sections") && notes.includes("kerbs in play"));
}

// — multi-surface lands in characterNotes via per-turn surface_override
{
  const mixed = mintTrack({ surface: "clay", turns: [{ n: 1, direction: "L", corner_type: "other", surface_override: "astro" }] });
  check("multi-surface (turn override) → mixed surface track note", trackCharacterNotes(mixed).includes("mixed surface track"));
  const single = mintTrack({ surface: "clay", turns: [] });
  check("single surface → no mixed-surface note", !trackCharacterNotes(single).includes("mixed surface track"));
}

// — cornersOf reconstructs the form view
{
  const cs = cornersOf(s.tracks[0]);
  check("cornersOf: reconstructs one CornerSpec per turn", cs.length === 3 && cs[0].direction === "left");
}

// — persistence (format 3 = schema Track)
const raw = serializeTracks(s);
check("serialize writes format 3", raw.startsWith('{"format":3'));
const round = deserializeTracks(raw);
check("serialize/deserialize round-trips", round.ok && JSON.stringify(round.state) === JSON.stringify(s));
check("corrupt blob refused, not wiped", deserializeTracks("{nope").ok === false);
check("valid JSON, wrong shape → corrupt", (() => { const r = deserializeTracks(JSON.stringify({ format: 3, state: { tracks: [{ id: 7 }] } })); return !r.ok && r.reason === "corrupt"; })());
check("legacy format-2 preserved as unknown_format (migrate path owns it)", (() => { const r = deserializeTracks(JSON.stringify({ format: 2, state: { tracks: [] } })); return !r.ok && r.reason === "unknown_format"; })());

// — delete
s = deleteTrack(s, t2.id);
check("deleteTrack removes the track", s.tracks.length === 1 && s.tracks[0].id === t1.id);
check("deleteTrack unknown id is a no-op (same reference)", deleteTrack(s, "nope") === s);

if (failures > 0) {
  console.error(`\n${failures} tracks test(s) failed`);
  process.exit(1);
}
console.log("\nAll tracks tests passed");
