import {
  buildSetupPayload,
  serializePayload,
  deserializePayload,
  payloadToLink,
  linkToPayload,
  IMPORT_LINK_BASE,
} from "./share";
import type { BuildPayloadInput } from "./share";
import {
  initCandidacy,
  submitCandidacy,
  setCandidacyState,
  getCandidacy,
  serializeCandidacy,
  deserializeCandidacy,
  CANDIDACY_FORMAT_VERSION,
} from "./candidacy";
import {
  initFollows,
  follow,
  unfollow,
  isFollowing,
  serializeFollows,
  deserializeFollows,
  FOLLOWS_FORMAT_VERSION,
} from "./follow";
import { forkProvenanceLine } from "./lineage";

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

function inputFixture(over: Partial<BuildPayloadInput> = {}): BuildPayloadInput {
  return {
    setup: {
      name: "Softer front",
      template_id: "kyosho-inferno-mp11",
      values: { front_diff_oil: 7000, front_sway_bar: 2.3, comment: "low grip" },
    },
    car: { brand: "Kyosho", model: "Inferno MP11", category: "buggy", scale: "1/8", power: "nitro" },
    context: {
      track_name: "MRT",
      surface: "clay",
      grip: "green",
      date: "2026-06-11",
      weather: { air_temp_c: 32, humidity_pct: 40, wind_kmh: 18 },
      result: { position: 2, entrants: 12, best_lap_s: 33.8 },
    },
    comment: "loosened it up for the dust",
    author: { handle: "theo" },
    ...over,
  };
}

// — buildSetupPayload: stamps v/kind/id/created_at, carries fields
{
  const p = buildSetupPayload(inputFixture(), T0);
  check("buildSetupPayload sets v:1 + kind:setup", p.v === 1 && p.kind === "setup");
  check("buildSetupPayload created_at is the passed now", p.created_at === T0);
  check("buildSetupPayload id derives from now (deterministic prefix)", p.id.startsWith(`share-${Date.parse(T0).toString(36)}-`));
  check("buildSetupPayload carries setup + car", p.setup.name === "Softer front" && p.car.brand === "Kyosho" && p.car.power === "nitro");
  check("buildSetupPayload carries optional context/comment/author", p.context?.track_name === "MRT" && p.comment === "loosened it up for the dust" && p.author?.handle === "theo");
  const p2 = buildSetupPayload(inputFixture(), T0);
  check("buildSetupPayload ids are unique (random suffix)", p.id !== p2.id);
}
{
  const lean = buildSetupPayload({ setup: inputFixture().setup, car: inputFixture().car }, T0);
  check("buildSetupPayload omits absent optionals (no context/comment/author keys)", !("context" in lean) && !("comment" in lean) && !("author" in lean) && !("forked_from" in lean));
  const forked = buildSetupPayload(inputFixture({ forked_from: "share-abc" }), T0);
  check("buildSetupPayload carries forked_from when given", forked.forked_from === "share-abc");
}

// — serialize / deserialize round-trip
{
  const p = buildSetupPayload(inputFixture(), T0);
  const raw = serializePayload(p);
  const r = deserializePayload(raw);
  check("serialize/deserialize round-trips byte-for-byte", r.ok && JSON.stringify(r.payload) === JSON.stringify(p));
}

// — deserialize: corruption + bad shape + version handling
check("deserialize: bad JSON → bad_json", (() => { const r = deserializePayload("{nope"); return !r.ok && r.reason === "bad_json"; })());
check("deserialize: JSON but not an object → not_a_payload", (() => { const r = deserializePayload("42"); return !r.ok && r.reason === "not_a_payload"; })());
check("deserialize: null → not_a_payload", (() => { const r = deserializePayload("null"); return !r.ok && r.reason === "not_a_payload"; })());
check("deserialize: wrong version → unknown_version (NOT corruption)", (() => {
  const p = buildSetupPayload(inputFixture(), T0);
  const bad = JSON.stringify({ ...p, v: 2 });
  const r = deserializePayload(bad);
  return !r.ok && r.reason === "unknown_version";
})());
check("deserialize: right version but wrong kind → not_a_payload", (() => {
  const p = buildSetupPayload(inputFixture(), T0);
  const bad = JSON.stringify({ ...p, kind: "lap" });
  const r = deserializePayload(bad);
  return !r.ok && r.reason === "not_a_payload";
})());
check("deserialize: missing required car field → not_a_payload", (() => {
  const p = buildSetupPayload(inputFixture(), T0);
  const broken: Record<string, unknown> = { ...p, car: { brand: "Kyosho", model: "Inferno MP11", category: "buggy", scale: "1/8" } };
  const r = deserializePayload(JSON.stringify(broken));
  return !r.ok && r.reason === "not_a_payload";
})());

// — payloadToLink / linkToPayload
{
  const p = buildSetupPayload(inputFixture(), T0);
  const link = payloadToLink(p);
  check("payloadToLink uses the import scheme + encoded d= param", link.startsWith(`${IMPORT_LINK_BASE}?d=`) && link.includes("%22"));
  check("IMPORT_LINK_BASE is the griplab import scheme", IMPORT_LINK_BASE === "griplab://import");
  const back = linkToPayload(link);
  check("linkToPayload round-trips a scheme link", back.ok && JSON.stringify(back.payload) === JSON.stringify(p));
  const plain = linkToPayload(`https://griplab.app/import?d=${encodeURIComponent(serializePayload(p))}`);
  check("linkToPayload handles a plain ?d= URL too", plain.ok && plain.payload.id === p.id);
  const multi = linkToPayload(`${IMPORT_LINK_BASE}?ref=mate&d=${encodeURIComponent(serializePayload(p))}`);
  check("linkToPayload finds d= among multiple params", multi.ok && multi.payload.id === p.id);
}
check("linkToPayload: no query at all → not_a_payload", (() => { const r = linkToPayload("griplab://import"); return !r.ok && r.reason === "not_a_payload"; })());
check("linkToPayload: missing d= param → not_a_payload", (() => { const r = linkToPayload("griplab://import?x=1"); return !r.ok && r.reason === "not_a_payload"; })());
check("linkToPayload: d= present but corrupt JSON → bad_json", (() => { const r = linkToPayload("griplab://import?d=%7Bnope"); return !r.ok && r.reason === "bad_json"; })());
check("linkToPayload: special chars in setup survive encode/decode", (() => {
  const p = buildSetupPayload(inputFixture({ comment: "tweaked &=? for fun #1" }), T0);
  const r = linkToPayload(payloadToLink(p));
  return r.ok && r.payload.comment === "tweaked &=? for fun #1";
})());

// — candidacy: init + submit + no-op rules
{
  let c = initCandidacy();
  check("initCandidacy is empty", c.items.length === 0);
  check("getCandidacy on empty → undefined", getCandidacy(c, "track-mrt") === undefined);

  const before = c;
  c = submitCandidacy(c, "track-mrt", T0);
  check("submitCandidacy upserts a candidate, new state", c !== before && c.items.length === 1);
  const entry = getCandidacy(c, "track-mrt");
  check("submitCandidacy sets state + submitted_at", entry?.state === "candidate" && entry.submitted_at === T0);

  const afterSubmit = c;
  c = submitCandidacy(c, "track-mrt", T1);
  check("submitCandidacy on a pending track is a no-op (same reference)", c === afterSubmit);

  c = setCandidacyState(c, "track-mrt", "official");
  check("setCandidacyState reflects the backend verdict", getCandidacy(c, "track-mrt")?.state === "official");
  check("setCandidacyState keeps submitted_at from the existing record", getCandidacy(c, "track-mrt")?.submitted_at === T0);

  const afterOfficial = c;
  c = submitCandidacy(c, "track-mrt", T1);
  check("submitCandidacy on an official track is a no-op (same reference)", c === afterOfficial);
}

// — candidacy: rejected can be re-submitted; setState upserts when absent
{
  let c = initCandidacy();
  c = setCandidacyState(c, "track-x", "rejected");
  check("setCandidacyState upserts when the track is absent", getCandidacy(c, "track-x")?.state === "rejected" && c.items.length === 1);
  const beforeResubmit = c;
  c = submitCandidacy(c, "track-x", T1);
  check("submitCandidacy re-nominates a rejected track (new state, candidate again)", c !== beforeResubmit && getCandidacy(c, "track-x")?.state === "candidate" && getCandidacy(c, "track-x")?.submitted_at === T1);
}

// — candidacy: multiple tracks tracked independently
{
  let c = initCandidacy();
  c = submitCandidacy(c, "a", T0);
  c = submitCandidacy(c, "b", T1);
  c = setCandidacyState(c, "a", "rejected");
  check("candidacy tracks independent entries", c.items.length === 2 && getCandidacy(c, "a")?.state === "rejected" && getCandidacy(c, "b")?.state === "candidate");
}

// — candidacy persistence: round-trip + corruption + unknown format
{
  let c = initCandidacy();
  c = submitCandidacy(c, "track-mrt", T0);
  c = setCandidacyState(c, "track-ic", "official");
  const raw = serializeCandidacy(c);
  check("serializeCandidacy wraps in a {format,state} envelope", raw.startsWith(`{"format":${CANDIDACY_FORMAT_VERSION}`));
  const r = deserializeCandidacy(raw);
  check("candidacy serialize/deserialize round-trips", r.ok && JSON.stringify(r.state) === JSON.stringify(c));
}
check("deserializeCandidacy: bad JSON → bad_json", (() => { const r = deserializeCandidacy("{nope"); return !r.ok && r.reason === "bad_json"; })());
check("deserializeCandidacy: no envelope shape → corrupt", (() => { const r = deserializeCandidacy("42"); return !r.ok && r.reason === "corrupt"; })());
check("deserializeCandidacy: newer format preserved as unknown_format (not corrupt)", (() => {
  const r = deserializeCandidacy(JSON.stringify({ format: 99, state: { items: [] } }));
  return !r.ok && r.reason === "unknown_format";
})());
check("deserializeCandidacy: format ok but bad item shape → corrupt", (() => {
  const r = deserializeCandidacy(JSON.stringify({ format: 1, state: { items: [{ track_id: 5, state: "candidate" }] } }));
  return !r.ok && r.reason === "corrupt";
})());
check("deserializeCandidacy: format ok but invalid state value → corrupt", (() => {
  const r = deserializeCandidacy(JSON.stringify({ format: 1, state: { items: [{ track_id: "t", state: "maybe" }] } }));
  return !r.ok && r.reason === "corrupt";
})());

// — lineage
{
  const full = buildSetupPayload(inputFixture(), T0);
  check("forkProvenanceLine: handle + date + track", forkProvenanceLine(full) === "Forked from @theo's setup · 2026-06-11 · MRT");

  const noHandle = buildSetupPayload(inputFixture({ author: undefined }), T0);
  check("forkProvenanceLine: anonymous credit when no handle", forkProvenanceLine(noHandle) === "Forked setup · 2026-06-11 · MRT");

  const handleOnly = buildSetupPayload(inputFixture({ context: undefined }), T0);
  check("forkProvenanceLine: handle only, no suffixes", forkProvenanceLine(handleOnly) === "Forked from @theo's setup");

  const bare = buildSetupPayload({ setup: inputFixture().setup, car: inputFixture().car }, T0);
  check("forkProvenanceLine: bare payload → plain anonymous credit", forkProvenanceLine(bare) === "Forked setup");

  const dateOnly = buildSetupPayload(inputFixture({ author: { handle: "ana" }, context: { date: "2026-06-11" } }), T0);
  check("forkProvenanceLine: only date suffix", forkProvenanceLine(dateOnly) === "Forked from @ana's setup · 2026-06-11");

  const trackOnly = buildSetupPayload(inputFixture({ author: undefined, context: { track_name: "MRT" } }), T0);
  check("forkProvenanceLine: anonymous + only track suffix", forkProvenanceLine(trackOnly) === "Forked setup · MRT");

  const emptyHandle = buildSetupPayload(inputFixture({ author: { handle: "" }, context: undefined }), T0);
  check("forkProvenanceLine: empty handle falls back to anonymous", forkProvenanceLine(emptyHandle) === "Forked setup");
}

// — follow: init + follow/unfollow no-op rules + isFollowing
{
  let f = initFollows();
  check("initFollows is empty", f.handles.length === 0);
  check("isFollowing on empty → false", isFollowing(f, "ana") === false);

  const before = f;
  f = follow(f, "ana");
  check("follow adds an absent handle (new ref)", f !== before && f.handles.length === 1 && f.handles[0] === "ana");
  check("isFollowing reflects a followed handle", isFollowing(f, "ana") === true);

  const afterFollow = f;
  f = follow(f, "ana");
  check("follow on an already-followed handle is a no-op (same reference)", f === afterFollow);

  f = follow(f, "theo");
  check("follow appends a second handle, order preserved", f.handles.length === 2 && f.handles[0] === "ana" && f.handles[1] === "theo");

  const beforeUnfollow = f;
  f = unfollow(f, "ana");
  check("unfollow removes a present handle (new ref)", f !== beforeUnfollow && f.handles.length === 1 && f.handles[0] === "theo");
  check("isFollowing false after unfollow", isFollowing(f, "ana") === false);

  const afterUnfollow = f;
  f = unfollow(f, "ana");
  check("unfollow on an absent handle is a no-op (same reference)", f === afterUnfollow);

  const empty = initFollows();
  check("unfollow on empty state is a no-op (same reference)", unfollow(empty, "ghost") === empty);
}

// — follow persistence: round-trip + corruption + unknown format
{
  let f = initFollows();
  f = follow(f, "ana");
  f = follow(f, "theo");
  const raw = serializeFollows(f);
  check("serializeFollows wraps in a {format,state} envelope", raw.startsWith(`{"format":${FOLLOWS_FORMAT_VERSION}`));
  const r = deserializeFollows(raw);
  check("follows serialize/deserialize round-trips", r.ok && JSON.stringify(r.state) === JSON.stringify(f));
}
check("deserializeFollows: bad JSON → bad_json", (() => { const r = deserializeFollows("{nope"); return !r.ok && r.reason === "bad_json"; })());
check("deserializeFollows: no envelope shape → corrupt", (() => { const r = deserializeFollows("42"); return !r.ok && r.reason === "corrupt"; })());
check("deserializeFollows: null → corrupt", (() => { const r = deserializeFollows("null"); return !r.ok && r.reason === "corrupt"; })());
check("deserializeFollows: newer format preserved as unknown_format (not corrupt)", (() => {
  const r = deserializeFollows(JSON.stringify({ format: 99, state: { handles: [] } }));
  return !r.ok && r.reason === "unknown_format";
})());
check("deserializeFollows: format ok but handles not an array → corrupt", (() => {
  const r = deserializeFollows(JSON.stringify({ format: 1, state: { handles: "ana" } }));
  return !r.ok && r.reason === "corrupt";
})());
check("deserializeFollows: format ok but non-string handle → corrupt", (() => {
  const r = deserializeFollows(JSON.stringify({ format: 1, state: { handles: ["ana", 7] } }));
  return !r.ok && r.reason === "corrupt";
})());

if (failures > 0) {
  console.error(`\n${failures} social test(s) failed`);
  process.exit(1);
}
console.log("\nAll social tests passed");
