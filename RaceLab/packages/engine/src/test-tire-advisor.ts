import {
  recommendTires,
  tireContextFromTags,
  loadTireSelectionKB,
  TireSelectionEntrySchema,
  type TireSelectionEntry,
  type TireContext,
} from "./tire-advisor";

/** Tire-selection advisor unit tests (D18: pure functions, no API). Fixture-based so they
 *  are deterministic regardless of how big the real grounded dataset is; a final block
 *  asserts the real dataset file is schema-valid + grounded. */

let passed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else failures.push(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

const FIXTURE: TireSelectionEntry[] = [
  {
    id: "tsel-loam-pin-001",
    scope: ["1-8-offroad", "1-10-2wd-offroad", "1-10-4wd-offroad"],
    match: { surface: "loose_dirt", grip: ["low", "medium"], temp: ["cold", "mild"] },
    tread: "pin",
    compound: "soft",
    examples: ["Pro-Line Hole Shot M3"],
    rationale: "Open pin clears loose loam and digs; soft for cool/low grip.",
    sources: ["FIXTURE guide p.1"],
    confidence: "high",
  },
  {
    id: "tsel-loam-block-002",
    scope: ["1-8-offroad"],
    match: { surface: "loose_dirt", grip: [], temp: [] }, // any grip/temp — less specific
    tread: "block",
    compound: "medium",
    examples: ["AKA Impact Medium"],
    rationale: "All-round block for mixed loam.",
    sources: ["FIXTURE guide p.2"],
    confidence: "medium",
  },
  {
    id: "tsel-loam-mini-003",
    scope: ["1-8-offroad"],
    match: { surface: "loose_dirt", grip: ["high"], temp: ["hot"] },
    tread: "mini-pin",
    compound: "hard",
    examples: ["JConcepts Gold"],
    rationale: "Low-profile mini-pin for baked, high-grip loam.",
    sources: ["FIXTURE guide p.3"],
    confidence: "high",
  },
  {
    id: "tsel-wet-spike-004",
    scope: ["1-8-offroad"],
    match: { surface: "wet", grip: [], temp: [], wet: true },
    tread: "spike",
    compound: "soft",
    examples: ["Pro-Line wet spike"],
    rationale: "Tall spaced spikes clear mud/water.",
    sources: ["FIXTURE guide p.4"],
    confidence: "high",
  },
];

const baseCtx: TireContext = { scope: ["1-8-offroad"], surface: "loose_dirt", grip: "low", temp: "cold", wet: false, dusty: false };

// ── ranking: most-specific grounded profile is the #1 pick ───────────────────
{
  const r = recommendTires(baseCtx, FIXTURE);
  check("loam/low/cold → recommendation", r.kind === "tire_selection", r.message);
  check("returns at most 2 picks", (r.picks?.length ?? 0) <= 2, String(r.picks?.length));
  check(
    "the grip+temp-specific pin is #1 (beats the any-grip block)",
    r.picks?.[0]?.tread === "pin" && r.picks?.[0]?.compound === "soft",
    JSON.stringify(r.picks?.map((p) => `${p.tread}/${p.compound}`)),
  );
  check("every pick is grounded (has citations)", (r.picks ?? []).every((p) => p.citations.length > 0));
  check("picks are distinct (tread,compound) profiles", new Set((r.picks ?? []).map((p) => `${p.tread}|${p.compound}`)).size === (r.picks?.length ?? 0));
}

// ── determinism: identical input → byte-identical output ─────────────────────
{
  const a = JSON.stringify(recommendTires(baseCtx, FIXTURE));
  const b = JSON.stringify(recommendTires({ ...baseCtx }, FIXTURE));
  check("deterministic: same context → identical result", a === b);
}

// ── grounded or silent: no matching grounded entry → refusal, never a guess ──
{
  const r = recommendTires({ ...baseCtx, surface: "carpet" }, FIXTURE);
  check("unknown-for-KB surface (carpet) → refusal, not a guess", r.kind === "refusal", JSON.stringify(r.picks));
}
{
  const r = recommendTires({ ...baseCtx, surface: "" }, FIXTURE);
  check("missing surface → asks for surface (refusal)", r.kind === "refusal" && /surface/.test(r.message ?? ""));
}

// ── scope gating: a 1/10-only context must not get a 1/8-only entry ──────────
{
  const r = recommendTires({ ...baseCtx, scope: ["1-10-2wd-offroad"], grip: "high", temp: "hot" }, FIXTURE);
  // only tsel-loam-pin-001 is in 1/10 scope; the high/hot mini-pin (003) is 1/8-only.
  check("scope gate: 1/10 context never gets a 1/8-only profile", (r.picks ?? []).every((p) => p.tread !== "mini-pin"), JSON.stringify(r.picks?.map((p) => p.tread)));
}

// ── wet gating: a dry context must not get a wet-only spike; a wet one must ──
{
  const dry = recommendTires(baseCtx, FIXTURE);
  check("dry context never gets the wet-only spike", (dry.picks ?? []).every((p) => p.tread !== "spike"));
  const wet = recommendTires({ ...baseCtx, surface: "wet", wet: true }, FIXTURE);
  check("wet context gets the wet spike", wet.kind === "tire_selection" && (wet.picks ?? []).some((p) => p.tread === "spike"));
}

// ── tireContextFromTags: maps the engine's existing condition tags correctly ─
{
  const ctx = tireContextFromTags(["loose_dirt", "low_grip", "cold", "dusty"], ["1-8-offroad"]);
  check("tags→ctx: surface family", ctx.surface === "loose_dirt");
  check("tags→ctx: low grip", ctx.grip === "low");
  check("tags→ctx: cold temp", ctx.temp === "cold");
  check("tags→ctx: dusty flag", ctx.dusty === true && ctx.wet === false);
  const ctx2 = tireContextFromTags(["blue_groove", "hot"], ["1-8-offroad"]);
  check("tags→ctx: blue_groove ⇒ high grip", ctx2.grip === "high");
  check("tags→ctx: no temp tag ⇒ mild", tireContextFromTags(["clay"], ["x"]).temp === "mild");
}

// ── the REAL dataset file is schema-valid + grounded (citation anchor) ───────
{
  let kb: TireSelectionEntry[] = [];
  let loadErr = "";
  try {
    kb = loadTireSelectionKB();
  } catch (e) {
    loadErr = (e as Error).message;
  }
  check("real selection KB loads without error", loadErr === "", loadErr);
  const ANCHORS = [
    // manufacturer guides / named books
    "JConcepts", "AKA", "Pro-Line", "Proline", "Schumacher", "Stevens", "HUDY",
    "Procircuit", "Hot Race", "JetKo", "Matrix", "Sweep", "Raw Speed",
    // race coverage / retailers (internal provenance, D53)
    "LiveRC", "RSRC", "Red RC", "redrc", "AMain", "Horizon", "BigSquid",
    "circusrc", "racing-cars", "IFMAR", "EFRA",
  ];
  for (const e of kb) {
    const r = TireSelectionEntrySchema.safeParse(e);
    check(`real entry ${e.id} is schema-valid`, r.success);
    check(
      `real entry ${e.id} is grounded (a recognized source)`,
      e.sources.length > 0 && e.sources.some((s) => ANCHORS.some((a) => s.includes(a))),
      JSON.stringify(e.sources),
    );
  }
  // smoke: the real dataset drives the engine end-to-end for a common case.
  if (kb.length > 0) {
    const r = recommendTires({ scope: ["1-8-offroad"], surface: "loose_dirt", grip: "low", temp: "cold", wet: false, dusty: false }, kb);
    check("real KB: loam/low/cold → grounded recommendation", r.kind === "tire_selection" && (r.picks?.length ?? 0) >= 1, JSON.stringify(r));
    check("real KB: every real pick is cited", (r.picks ?? []).every((p) => p.citations.length > 0));
    // high-bite clay is now grounded by race evidence (IFMAR 1/10 Worlds 2023) + manufacturer guides
    const clay = recommendTires({ scope: ["1-10-2wd-offroad"], surface: "clay", grip: "high", temp: "mild", wet: false, dusty: false }, kb);
    check("real KB: high-bite clay → grounded recommendation (race-evidence clay slick)", clay.kind === "tire_selection" && (clay.picks ?? []).some((p) => /slick/.test(p.tread)), JSON.stringify(clay.picks?.map((p) => p.tread)));
    // grounded-or-silent still holds for an unspecified surface
    const none = recommendTires({ scope: ["1-8-offroad"], surface: "", grip: "medium", temp: "mild", wet: false, dusty: false }, kb);
    check("real KB: missing surface → refusal (grounded or silent)", none.kind === "refusal");

    // ── 1/8 grip-STATE precision (D78): the tread changes with grip on dirt ──────
    const sc8 = ["1-8-offroad", "1-8-nitro-offroad", "1-8-e-offroad"];
    const loamy = recommendTires({ scope: sc8, surface: "loose_dirt", grip: "low", temp: "mild", wet: false, dusty: false }, kb);
    check("real KB 1/8: LOAMY (low grip) dirt → aggressive pin/spike", (loamy.picks ?? []).some((p) => /spike|pin/.test(p.tread)) && !(loamy.picks ?? []).some((p) => /web/.test(p.tread)), JSON.stringify(loamy.picks?.map((p) => p.tread)));
    const groomed = recommendTires({ scope: sc8, surface: "loose_dirt", grip: "high", temp: "mild", wet: false, dusty: false }, kb);
    check("real KB 1/8: GROOMED (high grip) dirt → web/pin-on-block, NOT the loamy spike", groomed.kind === "tire_selection" && (groomed.picks ?? []).some((p) => /web|pin-on-block/.test(p.tread)) && !(groomed.picks ?? []).some((p) => p.tread === "spike"), JSON.stringify(groomed.picks?.map((p) => p.tread)));
    check("real KB 1/8: groomed dirt runs a firmer (medium) compound, never super-soft", (groomed.picks ?? []).every((p) => p.compound !== "super-soft"), JSON.stringify(groomed.picks?.map((p) => p.compound)));
    const astro8 = recommendTires({ scope: sc8, surface: "astroturf", grip: "medium", temp: "mild", wet: false, dusty: false }, kb);
    check("real KB 1/8: astro now grounded (e-buggy) → clay-compound pin", astro8.kind === "tire_selection" && (astro8.picks ?? []).some((p) => /clay/.test(p.compound)), JSON.stringify(astro8.picks));
  }
}

console.log(`TIRE-ADVISOR: ${passed} checks passed${failures.length ? `, ${failures.length} FAILED` : ""}`);
for (const f of failures) console.log(`  ${f}`);
if (failures.length > 0) process.exit(1);
