import { detectTyreCliff } from "./cliff";
import { computePitPlan, stretchOptions } from "./strategy";
import type { PitPlan, StrategyInputs } from "./strategy";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`✓ ${label}`);
  } else {
    failures++;
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

function lapsOf(plan: PitPlan): string {
  return plan.stints.map((s) => s.laps).join(",");
}

function stripNotes(plan: PitPlan): Omit<PitPlan, "notes"> {
  const { notes: _notes, ...rest } = plan;
  return rest;
}

// — 30-min endurance nitro (hand-computed): avg 35s, tank burns 420s -> 12
//   laps/tank, margin 1 -> cap 11; pit 25s, start buffer 2s (default).
//   time(48) = 2 + 48*35 + 4*25 = 1782 < 1800; time(49) = 1817 >= 1800.
const enduro: StrategyInputs = {
  race_length_s: 1800,
  race_type: "endurance",
  avg_lap_s: 35,
  fuel: { tank_burn_s: 420 },
  pit_loss_s: 25,
  margin_laps: 1,
};
const ep = computePitPlan(enduro);
check("endurance: stint cap = 12 laps/tank - 1 margin = 11", ep.stint_max_laps === 11);
check("endurance: 49 laps (48 falls 18s short of the 30-min clock)", ep.total_laps === 49, `${ep.total_laps}`);
check("endurance: 4 stops = ceil(49/11) - 1", ep.stops === 4);
check("endurance: stints 10+10+10+10+9, even, none over cap", lapsOf(ep) === "10,10,10,10,9", lapsOf(ep));
check("endurance: pit_after on every stint but the last", ep.stints.slice(0, 4).every((s) => s.pit_after === true) && ep.stints[4].pit_after === undefined);
check("endurance: total time 2 + 49*35 + 4*25 = 1817s", ep.total_time_s === 1817, `${ep.total_time_s}`);
check("endurance: fuel decides, no cliff reported", ep.pit_driver === "fuel" && ep.cliff_lap === undefined);
check("endurance: notes explain fuel window, cap, laps, stops, stints", ep.notes.length >= 5 && ep.notes.some((n) => n.includes("12 laps per tank")) && ep.notes.some((n) => n.includes("ceil(49 laps / 11-lap stint cap)")), ep.notes.join(" | "));

// — sprint: 5-min, no stop needed; time(8) = 282 < 300, time(9) = 317 >= 300.
const sprint: StrategyInputs = {
  race_length_s: 300,
  race_type: "sprint",
  avg_lap_s: 35,
  fuel: { tank_burn_s: 420 },
  pit_loss_s: 25,
};
const sp = computePitPlan(sprint);
check("sprint: 9 laps, zero stops, one stint", sp.total_laps === 9 && sp.stops === 0 && lapsOf(sp) === "9");
check("sprint: single stint has no pit_after", sp.stints[0].pit_after === undefined);
check("sprint: total time 2 + 9*35 = 317s", sp.total_time_s === 317);
check("sprint: lap_times are ignored (no cliff path)", (() => {
  const cliffy = [36.8, 35, 35, 35, 35, 35, 35, 36.2, 37.2, 38.2, 39.2];
  const p = computePitPlan({ ...sprint, lap_times: cliffy });
  return p.pit_driver === "fuel" && p.cliff_lap === undefined;
})());
check("sprint: stretchOptions is always []", stretchOptions(sp, sprint).length === 0);

// — fuel-spec equivalence: 125cc / 10.4cc-per-lap = floor(12.02) = 12 laps,
//   same tank as 420s / 35s — identical plan apart from the fuel note.
const ccPlan = computePitPlan({ ...enduro, fuel: { tank_cc: 125, burn_cc_per_lap: 10.4 } });
check("fuel: tank_cc path equals tank_burn_s path (notes aside)", JSON.stringify(stripNotes(ccPlan)) === JSON.stringify(stripNotes(ep)));
check("fuel: cc note explains the division", ccPlan.notes.some((n) => n.includes("125cc tank / 10.4cc per lap")));
check("fuel: tank_burn_s takes precedence over the cc pair", computePitPlan({ ...enduro, fuel: { tank_burn_s: 420, tank_cc: 1, burn_cc_per_lap: 1 } }).stint_max_laps === 11);

// — stretch options (21-min race, margin 2 -> cap 10): base plan 34 laps /
//   3 stops. +1 (cap 11) still needs 3 stops at 34 laps -> dropped. +2 (cap
//   12 = full tank) -> 35 laps / 2 stops -> kept.
const stretchy: StrategyInputs = { ...enduro, race_length_s: 1260, margin_laps: 2 };
const bp = computePitPlan(stretchy);
check("stretch base: cap 10, 34 laps, 3 stops, stints 9+9+8+8", bp.stint_max_laps === 10 && bp.total_laps === 34 && bp.stops === 3 && lapsOf(bp) === "9,9,8,8");
const opts = stretchOptions(bp, stretchy);
check("stretch: only the stop-reducing option survives (+1 dropped)", opts.length === 1, `${opts.length}`);
check("stretch: +2 option runs full 12-lap tanks, 35 laps, 2 stops", opts[0].stint_max_laps === 12 && opts[0].total_laps === 35 && opts[0].stops === 2 && lapsOf(opts[0]) === "12,12,11");
check("stretch: notes state time saved = 1 stop * 25s", opts[0].notes.some((n) => n.includes("Saves 1 stop(s) = 25s of pit loss")), opts[0].notes.join(" | "));
check("stretch: notes state remaining fuel margin in laps", opts[0].notes.some((n) => n.includes("fuel margin left: 0 lap(s)")), opts[0].notes.join(" | "));

// — stretch clamping (same race, margin 1 -> cap 11): +1 -> 12 = full tank
//   (35 laps / 2 stops, kept); +2 -> 13 clamps to 12, a duplicate -> dropped.
const clampy: StrategyInputs = { ...enduro, race_length_s: 1260, margin_laps: 1 };
const cbp = computePitPlan(clampy);
const copts = stretchOptions(cbp, clampy);
check("stretch: never beyond laps_per_tank, clamps dedupe to one option", copts.length === 1 && copts[0].stint_max_laps === 12);
check("stretch: clamped option still reduces stops (3 -> 2)", cbp.stops === 3 && copts[0].stops === 2);
check("stretch: base plan untouched by stretchOptions", JSON.stringify(cbp) === JSON.stringify(computePitPlan(clampy)));

// — tyre cliff detection (lap 1 always excluded: it contains the start)
const cliffSeries = [36.5, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 36, 37, 38, 39, 40];
const cliff = detectTyreCliff(cliffSeries);
check("cliff: flat 35s then +1s/lap from lap 14 -> cliff_lap 14", cliff.cliff_lap === 14, `${cliff.cliff_lap}`);
check("cliff: degradation slope is clearly positive", cliff.degradation_s_per_lap > 0.2, `${cliff.degradation_s_per_lap}`);
const noisy = [36.8, 35.1, 34.9, 35.3, 34.8, 35.2, 35.0, 34.7, 37.4, 35.1, 34.9, 35.2, 35.0, 34.8, 35.3, 35.1];
const flat = detectTyreCliff(noisy);
check("cliff: noisy-but-flat series with one mistake -> no cliff", flat.cliff_lap === undefined);
check("cliff: flat series slope is near zero", Math.abs(flat.degradation_s_per_lap) < 0.05, `${flat.degradation_s_per_lap}`);
const short = detectTyreCliff([36.5, 35, 35, 36.5, 37.5, 38.5]);
check("cliff: fewer than 8 laps never reports a cliff", short.cliff_lap === undefined);
check("cliff: short series still measures degradation", short.degradation_s_per_lap > 0);
check("cliff: under 2 usable points -> slope 0, no cliff", (() => {
  const r = detectTyreCliff([35, 36]);
  return r.cliff_lap === undefined && r.degradation_s_per_lap === 0 && detectTyreCliff([]).degradation_s_per_lap === 0;
})());

// — cliff inside the fuel window flips the pit decider (endurance only):
//   cliff at lap 8 < cap 11 -> stints capped at 8; time(47) = 1772 < 1800,
//   time(48) = 2 + 48*35 + 5*25 = 1807 >= 1800 -> 48 laps, 5 stops, 6x8.
const cliffLaps = [36.8, 35, 35, 35, 35, 35, 35, 36.2, 37.2, 38.2, 39.2];
const cp = computePitPlan({ ...enduro, lap_times: cliffLaps });
check("cliff plan: tyre_cliff drives the pits, stints capped at 8", cp.pit_driver === "tyre_cliff" && cp.cliff_lap === 8 && cp.stint_max_laps === 8);
check("cliff plan: 48 laps, 5 stops, six 8-lap stints, 1807s", cp.total_laps === 48 && cp.stops === 5 && lapsOf(cp) === "8,8,8,8,8,8" && cp.total_time_s === 1807, `${cp.total_laps}/${cp.stops}/${lapsOf(cp)}/${cp.total_time_s}`);
check("cliff plan: notes say the cliff, not fuel, decides", cp.notes.some((n) => n.includes("tyres, not fuel, decide the pits")), cp.notes.join(" | "));
check("cliff plan: cliff outside the fuel window leaves fuel in charge", (() => {
  const lateCliff = [36.8, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 36.2, 37.2, 38.2];
  const p = computePitPlan({ ...enduro, lap_times: lateCliff });
  return p.pit_driver === "fuel" && p.cliff_lap === 14 && p.stint_max_laps === 11;
})());

// — error cases: unusable fuel spec, non-positive lap/race lengths
check("error: empty fuel spec throws", throws(() => computePitPlan({ ...enduro, fuel: {} })));
check("error: tank_cc without burn_cc_per_lap throws", throws(() => computePitPlan({ ...enduro, fuel: { tank_cc: 125 } })));
check("error: burn_cc_per_lap without tank_cc throws", throws(() => computePitPlan({ ...enduro, fuel: { burn_cc_per_lap: 10.4 } })));
check("error: avg_lap_s <= 0 throws", throws(() => computePitPlan({ ...enduro, avg_lap_s: 0 })));
check("error: race_length_s <= 0 throws", throws(() => computePitPlan({ ...enduro, race_length_s: 0 })));
check("error: stretchOptions validates inputs too", throws(() => stretchOptions(ep, { ...enduro, fuel: {} })));

if (failures > 0) {
  console.error(`\n${failures} strategy test(s) failed`);
  process.exit(1);
}
console.log("\nAll strategy tests passed");
