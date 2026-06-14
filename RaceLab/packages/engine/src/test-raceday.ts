import { loadKBData } from "./node-kb";
import { planRaceDay } from "./raceday";
import type { RaceDayInput } from "./raceday";
import { makeOutcomeRecord, learningTuples } from "../../schema/src/runs";
import type { OutcomeRecord } from "../../schema/src/runs";
import { makeWeatherObservation } from "../../schema/src/weather";
import type { WeatherObservation } from "../../schema/src/weather";
import { makeId } from "../../schema/src/ids";
import type { TrackSnapshot } from "../../schema/src/tracks";

/** planRaceDay — practice + forecast → KB-grounded adjustments (D18: pure). */

const data = loadKBData();

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`✓ ${label}`);
  } else {
    failures++;
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

let seed = 7;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const T0 = "2026-06-13T08:00:00.000Z";
const session_id = makeId("ss", Date.parse(T0), rand);
const car_id = makeId("car", Date.parse(T0), rand);
const track: TrackSnapshot = {
  track_id: makeId("trk", Date.parse(T0), rand),
  name: "Nationals Track",
  surface: "clay",
  indoor: false,
};
const otherTrack: TrackSnapshot = {
  track_id: makeId("trk", Date.parse(T0) + 1, rand),
  name: "Somewhere Else",
  surface: "astro",
  indoor: false,
};

function obs(input: WeatherObservation): WeatherObservation {
  const r = makeWeatherObservation(input);
  if (!r.ok) {
    console.log(`✗ FATAL: fixture weather rejected: ${r.reason}`);
    process.exit(1);
  }
  return r.observation;
}

function oc(
  trackSnap: TrackSnapshot,
  setting: string,
  change: string,
  citations: string[],
  outcome: "better" | "same" | "worse",
  at: string,
): OutcomeRecord {
  const r = makeOutcomeRecord(
    {
      session_id,
      car_id,
      car_name: "MP11 #1",
      setting,
      change,
      citations,
      outcome,
      setup_version_id: "sv-1",
      setup_name: "Practice base",
      track: trackSnap,
      conditions: { grip: "medium" },
    },
    at,
    rand,
  );
  if (!r.ok) {
    console.log(`✗ FATAL: fixture outcome rejected: ${r.reason}`);
    process.exit(1);
  }
  return r.record;
}

const practice = learningTuples(
  [],
  [
    oc(track, "rear_diff_oil", "thinner 4000 → 3000", ["kb-diff-rear-thinner-005"], "better", "2026-06-13T09:00:00.000Z"),
    oc(track, "clutch_spring", "stiffer 0.95 → 1.00", ["kb-clutch-springs-stiffer-010"], "worse", "2026-06-13T09:30:00.000Z"),
    // different track — must NOT bleed into this plan
    oc(otherTrack, "wing_angle", "steeper", ["kb-wing-steeper-307"], "worse", "2026-06-13T09:45:00.000Z"),
  ],
);

const RAIN_FORECAST = [
  obs({ observed_at: "2026-06-13T10:00:00.000Z", source: "auto", air_temp_c: 22, cloud_cover_pct: 40, wind_speed_kmh: 10 }),
  obs({ observed_at: "2026-06-13T14:00:00.000Z", source: "auto", air_temp_c: 20, precipitation_probability_pct: 70, wind_speed_kmh: 12 }),
];

const baseInput: RaceDayInput = {
  practice,
  forecast: RAIN_FORECAST,
  track,
  chassis_template_id: "kyosho-inferno-mp11",
  current_setup: { clutch_spring: 1.0 },
};

// ── Rain-incoming plan ────────────────────────────────────────────────────────
{
  const r = planRaceDay(baseInput, data);
  check("rain forecast → ok plan", r.ok);
  if (r.ok) {
    const plan = r.plan;
    check("kind/source stamped", plan.kind === "race_day_plan" && plan.source === "offline_deterministic");
    check(
      "forecast read predicts wet from rain probability",
      plan.forecast_read.some((l) => l.startsWith("wet expected") && l.includes("rain risk 70%")),
      JSON.stringify(plan.forecast_read),
    );
    const wet = plan.adjustments.filter((a) => a.condition_tag === "wet");
    check("wet adjustment proposed", wet.length >= 1, JSON.stringify(plan.adjustments));
    check(
      "wet adjustment cites the clutch-softer rule (amplified_on wet)",
      wet.some((a) => a.citations.includes("kb-clutch-springs-softer-009")),
      JSON.stringify(wet),
    );
    check(
      "every adjustment is cited + race-day safe",
      plan.adjustments.every((a) => a.citations.length > 0 && a.confidence === "high"),
    );
    check(
      "adjustment echoes the current setup value",
      wet.some((a) => a.change.includes("(currently 1)")),
      JSON.stringify(wet.map((a) => a.change)),
    );
    check(
      "practice read keeps the better-rated change",
      plan.practice_read.some((l) => l.startsWith("keep: rear_diff_oil") && l.includes("kb-diff-rear-thinner-005")),
      JSON.stringify(plan.practice_read),
    );
    check(
      "practice read flags the worse-rated change as avoid",
      plan.practice_read.some((l) => l.startsWith("avoid: clutch_spring")),
    );
    check(
      "other-track practice never bleeds in",
      !plan.practice_read.some((l) => l.includes("wing_angle")),
    );
    check("assumptions echo the inputs", plan.assumptions.some((l) => l.includes("Nationals Track")));
    const again = planRaceDay(baseInput, data);
    check(
      "deterministic: same input → identical plan",
      again.ok && JSON.stringify(again.plan) === JSON.stringify(plan),
    );
  }
}

// ── Practice-worse excludes a rule. Wet now has 3 grounded rules (clutch-softer
//    + thinner front/rear shock oil), so excluding ONE degrades gracefully;
//    excluding ALL → explicit refusal, never a guess. ─────────────────────────
{
  // (a) exclude only the clutch rule → the shock-oil rules still ground wet
  const oneAvoided = {
    ...baseInput,
    practice: learningTuples(
      [],
      [oc(track, "clutch_spring", "softer 1.00 → 0.95", ["kb-clutch-springs-softer-009"], "worse", "2026-06-13T09:00:00.000Z")],
    ),
  };
  const r1 = planRaceDay(oneAvoided, data);
  check("avoid-rated wet rule → plan still ok", r1.ok);
  if (r1.ok) {
    check(
      "rule rated worse here is excluded from adjustments",
      !r1.plan.adjustments.some((a) => a.citations.includes("kb-clutch-springs-softer-009")),
    );
    check(
      "one excluded wet rule still leaves wet grounded (shock-oil) → adjustment, no refusal",
      r1.plan.adjustments.some((a) => a.condition_tag.includes("wet")) &&
        !r1.plan.refusals.some((x) => x.aspect === "wet"),
      JSON.stringify({ tags: r1.plan.adjustments.map((a) => a.condition_tag), refusals: r1.plan.refusals }),
    );
  }
  // (b) exclude EVERY wet-amplified rule → wet ungrounded → explicit refusal
  const allAvoided = {
    ...baseInput,
    practice: learningTuples(
      [],
      [
        oc(track, "clutch_spring", "softer", ["kb-clutch-springs-softer-009"], "worse", "2026-06-13T09:00:00.000Z"),
        oc(track, "front_shock_oil", "thinner", ["kb-weather-wet-front-shock-thinner-304"], "worse", "2026-06-13T09:10:00.000Z"),
        oc(track, "rear_shock_oil", "thinner", ["kb-weather-wet-rear-shock-thinner-305"], "worse", "2026-06-13T09:20:00.000Z"),
      ],
    ),
  };
  const r2 = planRaceDay(allAvoided, data);
  if (r2.ok) {
    check(
      "ALL wet rules excluded → wet ungrounded → explicit refusal (grounded or silent)",
      r2.plan.refusals.some((x) => x.aspect === "wet" && x.message.includes("grounded or silent")),
      JSON.stringify(r2.plan.refusals),
    );
  }
}

// ── Cross-condition resolution: same setting + same direction → ONE merged
//    change (never two steps); opposite directions → refuse the setting. ──────
{
  // cold + wet both call for THINNER front shock oil → one merged adjustment
  const COLD_WET = [
    obs({ observed_at: "2026-06-14T09:00:00.000Z", source: "auto", air_temp_c: 8, precipitation_probability_pct: 70, wind_speed_kmh: 10 }),
  ];
  const r = planRaceDay({ ...baseInput, practice: [], forecast: COLD_WET }, data);
  check("cold+wet → ok plan", r.ok);
  if (r.ok) {
    const front = r.plan.adjustments.filter((a) => a.setting === "front_shock_oil");
    check("cold+wet: front shock oil appears EXACTLY ONCE (no double-thinning)", front.length === 1, JSON.stringify(front.map((a) => a.condition_tag)));
    check(
      "cold+wet: the merged change cites BOTH the cold and wet rules",
      front.length === 1 &&
        front[0].citations.includes("kb-weather-cold-front-shock-thinner-302") &&
        front[0].citations.includes("kb-weather-wet-front-shock-thinner-304"),
      JSON.stringify(front[0]?.citations),
    );
    check("cold+wet: condition_tag records both conditions", front[0]?.condition_tag === "cold+wet", front[0]?.condition_tag);
    check("cold+wet: merged mechanism says make it once", /make it ONCE/i.test(front[0]?.mechanism ?? ""), front[0]?.mechanism);
    check("cold+wet: no contradictory refusal on front shock oil", !r.plan.refusals.some((x) => x.aspect === "front_shock_oil"));
  }

  // hot + wet DISAGREE on front shock oil (hot→thicker, wet→thinner) → refuse it
  const HOT_WET = [
    obs({ observed_at: "2026-06-14T13:00:00.000Z", source: "auto", air_temp_c: 32, precipitation_probability_pct: 70, wind_speed_kmh: 10 }),
  ];
  const h = planRaceDay({ ...baseInput, practice: [], forecast: HOT_WET }, data);
  check("hot+wet → ok plan", h.ok);
  if (h.ok) {
    check(
      "hot+wet: opposite front-oil directions → explicit refusal (grounded or silent)",
      h.plan.refusals.some((x) => x.aspect === "front_shock_oil" && /disagree/i.test(x.message) && x.message.includes("grounded or silent")),
      JSON.stringify(h.plan.refusals),
    );
    check("hot+wet: NO front shock oil adjustment emitted (we never pick a silent winner)", !h.plan.adjustments.some((a) => a.setting === "front_shock_oil"));
    check("hot+wet: the non-conflicting wet clutch change still surfaces", h.plan.adjustments.some((a) => a.setting === "clutch_spring"));
  }
}

// ── Ungrounded aspects refuse explicitly ──────────────────────────────────────
{
  const cold = {
    ...baseInput,
    practice: [],
    forecast: [
      obs({ observed_at: "2026-06-13T07:00:00.000Z", source: "auto", air_temp_c: 5, wind_speed_kmh: 35 }),
    ],
  };
  const r = planRaceDay(cold, data);
  check("cold+wind forecast → ok plan", r.ok);
  if (r.ok) {
    const coldAdj = r.plan.adjustments.filter((a) => a.condition_tag === "cold");
    check(
      "cold now produces cited shock-oil adjustments (weather pack — was a refusal)",
      coldAdj.length >= 1 && coldAdj.every((a) => a.citations.some((c) => c.startsWith("kb-weather-cold-"))),
      JSON.stringify(coldAdj),
    );
    check("cold adjustments are race-day safe (high confidence)", coldAdj.length >= 1 && coldAdj.every((a) => a.confidence === "high"));
    check("cold is no longer refused (now grounded by the weather pack)", !r.plan.refusals.some((x) => x.aspect === "cold"));
    check(
      "wind STILL has no taxonomy tag → explicit refusal, never an adjustment",
      r.plan.refusals.some((x) => x.aspect === "wind") &&
        !r.plan.adjustments.some((a) => a.condition_tag === "wind"),
    );
    check(
      "no practice at this track is said out loud",
      r.plan.practice_read.some((l) => l.includes("no practice history at this track")),
    );
  }
}

// ── HOT forecast → thicker-shock adjustment (weather pack, was a refusal) ──────
{
  const hot = {
    ...baseInput,
    practice: [],
    forecast: [obs({ observed_at: "2026-06-13T13:00:00.000Z", source: "auto", air_temp_c: 34, wind_speed_kmh: 8 })],
  };
  const r = planRaceDay(hot, data);
  check("hot forecast → ok plan", r.ok);
  if (r.ok) {
    check("forecast read predicts hot", r.plan.forecast_read.some((l) => l.startsWith("hot expected") && l.includes("34")));
    const hotAdj = r.plan.adjustments.filter((a) => a.condition_tag === "hot");
    check(
      "hot produces a cited shock-oil adjustment (front_shock_oil thicker)",
      hotAdj.some((a) => a.setting === "front_shock_oil" && a.citations.some((c) => c.startsWith("kb-weather-hot-"))),
      JSON.stringify(hotAdj),
    );
    check("hot adjustment is race-day safe (high confidence + cited)", hotAdj.length >= 1 && hotAdj.every((a) => a.confidence === "high" && a.citations.length > 0));
    check("hot is no longer in the refusals (now grounded)", !r.plan.refusals.some((x) => x.aspect === "hot"));
  }
}

// ── WEATHER REGRESSION TIER (D40 hot/cold pack trap coverage) ─────────────────
// Each forecast is isolated to ONE actionable condition so the grounding (or
// the refusal) is asserted on its own, never tangled with another tag.
{
  // (a1) HOT in isolation (calm wind) → front shock THICKER, cited + race-day
  // safe, and nothing else fires.
  const hotOnly = planRaceDay(
    {
      ...baseInput,
      practice: [],
      forecast: [obs({ observed_at: "2026-06-13T13:00:00.000Z", source: "auto", air_temp_c: 34, wind_speed_kmh: 8 })],
    },
    data,
  );
  check("hot-only forecast → ok plan", hotOnly.ok);
  if (hotOnly.ok) {
    const hot = hotOnly.plan.adjustments.filter((a) => a.condition_tag === "hot");
    check(
      "hot → CITED race-day-safe front-shock-THICKER adjustment",
      hot.length === 1 &&
        hot[0].setting === "front_shock_oil" &&
        hot[0].citations.includes("kb-weather-hot-front-shock-thicker-301") &&
        hot[0].confidence === "high",
      JSON.stringify(hot),
    );
    check("hot-only → no cold adjustment leaks in", !hotOnly.plan.adjustments.some((a) => a.condition_tag === "cold"));
    check("hot-only (calm wind) → no wind refusal", !hotOnly.plan.refusals.some((x) => x.aspect === "wind"));
  }

  // (a2) COLD in isolation (calm wind) → front AND rear shock THINNER, both
  // cited + race-day safe; cold is not refused.
  const coldOnly = planRaceDay(
    {
      ...baseInput,
      practice: [],
      forecast: [obs({ observed_at: "2026-06-13T07:00:00.000Z", source: "auto", air_temp_c: 4, wind_speed_kmh: 8 })],
    },
    data,
  );
  check("cold-only forecast → ok plan", coldOnly.ok);
  if (coldOnly.ok) {
    const cold = coldOnly.plan.adjustments.filter((a) => a.condition_tag === "cold");
    const settings = new Set(cold.map((a) => a.setting));
    check(
      "cold → CITED front-shock-THINNER adjustment",
      cold.some((a) => a.setting === "front_shock_oil" && a.citations.includes("kb-weather-cold-front-shock-thinner-302")),
      JSON.stringify(cold),
    );
    check(
      "cold → CITED rear-shock-THINNER adjustment (front AND rear move)",
      cold.some((a) => a.setting === "rear_shock_oil" && a.citations.includes("kb-weather-cold-rear-shock-thinner-303")),
      JSON.stringify(cold),
    );
    check("cold → both shock adjustments on DISTINCT settings (no contradictory pair)", settings.size === cold.length && settings.size >= 2);
    check("cold → every adjustment is race-day safe (high confidence + cited)", cold.length >= 2 && cold.every((a) => a.confidence === "high" && a.citations.length > 0));
    check("cold-only (calm wind) → cold is NOT refused", !coldOnly.plan.refusals.some((x) => x.aspect === "cold"));
  }

  // (a3) WIND with an otherwise-uncovered forecast (mild temp, no rain) →
  // wind REFUSES explicitly and produces ZERO adjustments (uncovered tag, never
  // a guess). This is the standalone wind-refusal trap.
  const windOnly = planRaceDay(
    {
      ...baseInput,
      practice: [],
      forecast: [obs({ observed_at: "2026-06-13T12:00:00.000Z", source: "auto", air_temp_c: 20, cloud_cover_pct: 30, wind_speed_kmh: 40 })],
    },
    data,
  );
  check("wind-only forecast → ok plan", windOnly.ok);
  if (windOnly.ok) {
    check(
      "uncovered wind tag → EXPLICIT refusal (grounded or silent)",
      windOnly.plan.refusals.some((x) => x.aspect === "wind" && x.message.includes("no wind condition tag")),
      JSON.stringify(windOnly.plan.refusals),
    );
    check("uncovered wind tag → ZERO adjustments (never a guess)", windOnly.plan.adjustments.length === 0);
  }

  // (a4) WET (actual rain in the sky) still grounds → a cited clutch-softer
  // adjustment, race-day safe.
  const wetOnly = planRaceDay(
    {
      ...baseInput,
      practice: [],
      forecast: [obs({ observed_at: "2026-06-13T14:00:00.000Z", source: "auto", air_temp_c: 18, precipitation_probability_pct: 90, wind_speed_kmh: 10 })],
      current_setup: { clutch_spring: 1.0 },
    },
    data,
  );
  check("wet forecast → ok plan", wetOnly.ok);
  if (wetOnly.ok) {
    const wet = wetOnly.plan.adjustments.filter((a) => a.condition_tag === "wet");
    check(
      "wet → CITED race-day-safe clutch-softer adjustment (still grounds)",
      wet.some((a) => a.citations.includes("kb-clutch-springs-softer-009") && a.confidence === "high"),
      JSON.stringify(wet),
    );
    check("wet → no spurious wind refusal at calm wind", !wetOnly.plan.refusals.some((x) => x.aspect === "wind"));
  }

  // (a5) A forecast with NO actionable condition (mild temp, no rain, calm
  // wind) → an HONEST 'no change' read: zero adjustments, zero refusals, and the
  // forecast_read says so out loud. The planner must not invent a change.
  const mild = planRaceDay(
    {
      ...baseInput,
      practice: [],
      forecast: [obs({ observed_at: "2026-06-13T12:00:00.000Z", source: "auto", air_temp_c: 20, cloud_cover_pct: 30, wind_speed_kmh: 5 })],
    },
    data,
  );
  check("no-actionable-condition forecast → ok plan", mild.ok);
  if (mild.ok) {
    check(
      "no actionable condition → honest 'no change the KB reasons about' read",
      mild.plan.forecast_read.some((l) => l.includes("no condition change the KB reasons about")),
      JSON.stringify(mild.plan.forecast_read),
    );
    check("no actionable condition → ZERO invented adjustments", mild.plan.adjustments.length === 0);
    check("no actionable condition → ZERO refusals (nothing to refuse)", mild.plan.refusals.length === 0);
  }
}

// ── Edge cases ────────────────────────────────────────────────────────────────
{
  const r = planRaceDay({ ...baseInput, practice: [], forecast: [] }, data);
  check("empty practice + forecast → still a plan (offline-first)", r.ok);
  if (r.ok) {
    check(
      "empty forecast is echoed honestly",
      r.plan.forecast_read.some((l) => l.includes("no forecast provided")),
    );
  }
  const bad = planRaceDay({ ...baseInput, chassis_template_id: "nope" }, data);
  check(
    "unknown template → discriminated failure, never a throw",
    !bad.ok && bad.reason === "unknown_template",
  );
}

console.log(failures === 0 ? "\nPLANNER: all planRaceDay tests passed" : `\nPLANNER: ${failures} failures`);
if (failures > 0) process.exit(1);
