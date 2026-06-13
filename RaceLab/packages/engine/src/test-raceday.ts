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

// ── Practice-worse excludes a rule → explicit refusal, not a guess ───────────
{
  const withAvoid = {
    ...baseInput,
    practice: learningTuples(
      [],
      [oc(track, "clutch_spring", "softer 1.00 → 0.95", ["kb-clutch-springs-softer-009"], "worse", "2026-06-13T09:00:00.000Z")],
    ),
  };
  const r = planRaceDay(withAvoid, data);
  check("avoid-rated wet rule → plan still ok", r.ok);
  if (r.ok) {
    check(
      "rule rated worse here is excluded from adjustments",
      !r.plan.adjustments.some((a) => a.citations.includes("kb-clutch-springs-softer-009")),
    );
    check(
      "exclusion leaves wet ungrounded → explicit refusal",
      r.plan.refusals.some((x) => x.aspect === "wet" && x.message.includes("grounded or silent")),
      JSON.stringify(r.plan.refusals),
    );
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
    check(
      "no KB rule covers 'cold' → explicit refusal",
      r.plan.refusals.some((x) => x.aspect === "cold" && x.message.includes("No KB rule covers 'cold'")),
      JSON.stringify(r.plan.refusals),
    );
    check(
      "wind has no taxonomy tag → explicit refusal, never an adjustment",
      r.plan.refusals.some((x) => x.aspect === "wind") &&
        !r.plan.adjustments.some((a) => a.condition_tag === "wind"),
    );
    check("cold yields zero adjustments (grounded or silent)", r.plan.adjustments.length === 0);
    check(
      "no practice at this track is said out loud",
      r.plan.practice_read.some((l) => l.includes("no practice history at this track")),
    );
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
