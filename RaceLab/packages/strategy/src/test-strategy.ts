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

function durationsOf(plan: PitPlan): string {
  return plan.stints.map((s) => s.duration_s).join(",");
}

// — 30-min endurance (hand-computed): avg 35s, autonomy 420s, pit 25s,
//   default margin = one avg lap (35s) -> stint cap 385s (11 laps inside).
//   Internal laps: clock(L) = 35L + (ceil(L/11)-1)*25.
//   L=48: 1680 + 4*25 = 1780 < 1800; L=49: 1715 + 4*25 = 1815 >= 1800
//   -> 49 laps, 5 stints (10+10+10+10+9 laps = 350,350,350,350,315 s),
//   4 stops; pit_at_s: 350, 350+25+350=725, 725+25+350=1100,
//   1100+25+350=1475; total 1715 + 100 = 1815s.
const enduro: StrategyInputs = {
  race_length_s: 1800,
  race_type: "endurance",
  avg_lap_s: 35,
  autonomy_s: 420,
  pit_loss_s: 25,
};
const ep = computePitPlan(enduro);
check("endurance: stint_max_s = 420 autonomy - 35 default margin = 385", ep.stint_max_s === 385, `${ep.stint_max_s}`);
check("endurance: 4 stops", ep.stops === 4, `${ep.stops}`);
check("endurance: stints 350,350,350,350,315 — even, none over the cap", durationsOf(ep) === "350,350,350,350,315", durationsOf(ep));
check("endurance: every stint under stint_max_s", ep.stints.every((s) => s.duration_s <= ep.stint_max_s));
check("endurance: pit_after true on all stints but the last", ep.stints.slice(0, 4).every((s) => s.pit_after === true) && ep.stints[4].pit_after === false);
check("endurance: pit_at_s cumulative incl. prior pit loss = 350,725,1100,1475", JSON.stringify(ep.pit_at_s) === "[350,725,1100,1475]", ep.pit_at_s.join(","));
check("endurance: total 49 laps x 35 + 4 stops x 25 = 1815s", ep.total_time_s === 1815, `${ep.total_time_s}`);
check("endurance: fuel decides, no cliff reported", ep.pit_driver === "fuel" && ep.cliff_lap === undefined);
check("endurance: notes speak pilot time — tank ~7:00, boxing every 6:25, 35s safety reserve", ep.notes.some((n) => n.includes("7:00")) && ep.notes.some((n) => n.includes("6:25")) && ep.notes.some((n) => n.includes("35s safety reserve")), ep.notes.join(" | "));
check("endurance: notes total the pit loss (4 x 25s = 1:40)", ep.notes.some((n) => n.includes("1:40")), ep.notes.join(" | "));
check("endurance: notes give the race-clock box moments", ep.notes.some((n) => n.includes("5:50") && n.includes("24:35")), ep.notes.join(" | "));

// — sprint zero-stop (hand-computed): 5-min race, autonomy > race.
//   clock(8) = 280 < 300; clock(9) = 315 >= 300 -> 9 laps, one 315s stint.
const sprint: StrategyInputs = {
  race_length_s: 300,
  race_type: "sprint",
  avg_lap_s: 35,
  autonomy_s: 420,
  pit_loss_s: 25,
};
const sp = computePitPlan(sprint);
check("sprint: zero stops, one stint of 315s", sp.stops === 0 && durationsOf(sp) === "315", durationsOf(sp));
check("sprint: single stint has pit_after false", sp.stints[0].pit_after === false);
check("sprint: pit_at_s empty, total 315s", sp.pit_at_s.length === 0 && sp.total_time_s === 315);
check("sprint: notes say no stop needed", sp.notes.some((n) => n.includes("no stop needed")), sp.notes.join(" | "));
check("sprint: lap_times are ignored (no cliff path)", (() => {
  const cliffy = [36.8, 35, 35, 35, 35, 35, 35, 36.2, 37.2, 38.2, 39.2];
  const p = computePitPlan({ ...sprint, lap_times: cliffy });
  return p.pit_driver === "fuel" && p.cliff_lap === undefined;
})());
check("sprint: stretchOptions is always []", stretchOptions(sp, sprint).length === 0);

// — tyre cliff detection (algorithm unchanged from v1; lap 1 always excluded)
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

// — cliff-driven endurance (hand-computed): cliff at lap 8 -> cliff time
//   8 x 35 = 280s < 385s fuel window -> cap 280s (8 laps inside).
//   clock(L) = 35L + (ceil(L/8)-1)*25: L=47: 1645 + 5*25 = 1770 < 1800;
//   L=48: 1680 + 5*25 = 1805 >= 1800 -> 48 laps, six 8-lap stints (280s
//   each), 5 stops; pit_at_s: 280, 585, 890, 1195, 1500; total 1805s.
const cliffLaps = [36.8, 35, 35, 35, 35, 35, 35, 36.2, 37.2, 38.2, 39.2];
const cp = computePitPlan({ ...enduro, lap_times: cliffLaps });
check("cliff plan: tyre_cliff drives, cliff_lap 8, stint_max_s 280", cp.pit_driver === "tyre_cliff" && cp.cliff_lap === 8 && cp.stint_max_s === 280, `${cp.pit_driver}/${cp.cliff_lap}/${cp.stint_max_s}`);
check("cliff plan: 5 stops, six 280s stints, total 1805s", cp.stops === 5 && durationsOf(cp) === "280,280,280,280,280,280" && cp.total_time_s === 1805, `${cp.stops}/${durationsOf(cp)}/${cp.total_time_s}`);
check("cliff plan: pit_at_s = 280,585,890,1195,1500", JSON.stringify(cp.pit_at_s) === "[280,585,890,1195,1500]", cp.pit_at_s.join(","));
check("cliff plan: notes quantify cliff time vs fuel window, tyres decide", cp.notes.some((n) => n.includes("tyres run out of grip first") && n.includes("4:40") && n.includes("6:25")), cp.notes.join(" | "));
check("cliff plan: cliff outside the fuel window leaves fuel in charge", (() => {
  const lateCliff = [36.8, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 36.2, 37.2, 38.2];
  const p = computePitPlan({ ...enduro, lap_times: lateCliff });
  return p.pit_driver === "fuel" && p.cliff_lap === 14 && p.stint_max_s === 385;
})());

// — text-clarity invariants (locks A1/A2/A3) ────────────────────────────────
// A1: the margin note reads "safety reserve", never the legacy "fuel margin".
check(
  "A1: margin note uses 'safety reserve', not legacy 'fuel margin'",
  ep.notes.some((n) => n.includes("safety reserve")) && !ep.notes.some((n) => /keeps a .* fuel margin/.test(n)),
  ep.notes.join(" | "),
);
// A2: the cliff note is a time-vs-time comparison — BOTH mmss(cliffTime) and mmss(fuelCap).
check(
  "A2: cliff note compares cliff time vs fuel window (time-vs-time)",
  cp.notes.some((n) => n.includes("4:40") && n.includes("6:25") && n.includes("vs")),
  cp.notes.join(" | "),
);
// A3: the box note leads with stint durations before the race-clock box moments.
check(
  "A3: box note lists stint durations under the cap",
  ep.notes.some((n) => n.startsWith("Stints:") && n.includes("under the") && n.includes("cap")),
  ep.notes.join(" | "),
);

// — stretch options (hand-computed): 21-min race, margin 70s -> cap 350s
//   (10 laps inside). clock(L) = 35L + (ceil(L/10)-1)*25: L=33: 1155 + 75
//   = 1230 < 1260; L=34: 1190 + 75 = 1265 >= 1260 -> 34 laps, 4 stints
//   (9+9+8+8 laps = 315,315,280,280 s), 3 stops.
//   +1 avg lap (cap 385, 11 laps): still 34 laps / 3 stops -> dropped.
//   +2 avg laps (cap 420 = full autonomy, 12 laps): L=34: 1190 + 50 = 1240
//   < 1260; L=35: 1225 + 50 = 1275 >= 1260 -> 35 laps, 3 stints (12+12+11
//   laps = 420,420,385 s), 2 stops -> kept; saves 1 stop, 0s margin left.
const stretchy: StrategyInputs = { ...enduro, race_length_s: 1260, margin_s: 70 };
const bp = computePitPlan(stretchy);
check("stretch base: cap 350s, 3 stops, stints 315,315,280,280", bp.stint_max_s === 350 && bp.stops === 3 && durationsOf(bp) === "315,315,280,280", `${bp.stint_max_s}/${bp.stops}/${durationsOf(bp)}`);
check("stretch base: pit_at_s = 315,655,960, total 1265s", JSON.stringify(bp.pit_at_s) === "[315,655,960]" && bp.total_time_s === 1265, `${bp.pit_at_s.join(",")}/${bp.total_time_s}`);
const opts = stretchOptions(bp, stretchy);
check("stretch: only the stop-reducing option survives (+1 dropped)", opts.length === 1, `${opts.length}`);
check("stretch: +2 option runs full 420s tanks, 2 stops, stints 420,420,385", opts[0].stint_max_s === 420 && opts[0].stops === 2 && durationsOf(opts[0]) === "420,420,385", `${opts[0].stint_max_s}/${opts[0].stops}/${durationsOf(opts[0])}`);
check("stretch: option pit_at_s = 420,865, total 1275s", JSON.stringify(opts[0].pit_at_s) === "[420,865]" && opts[0].total_time_s === 1275);
check("stretch: notes state time saved in seconds", opts[0].notes.some((n) => n.includes("Saves 1 stop(s) = 25s of pit loss")), opts[0].notes.join(" | "));
check("stretch: notes state remaining margin in seconds", opts[0].notes.some((n) => n.includes("remaining margin: 0s")), opts[0].notes.join(" | "));
check("stretch: never beyond autonomy_s", opts.every((o) => o.stint_max_s <= stretchy.autonomy_s && o.stints.every((s) => s.duration_s <= stretchy.autonomy_s)));

// — stretch clamping (margin 35s -> cap 385): +1 -> 420 = full autonomy
//   (35 laps / 2 stops, kept); +2 -> 455 clamps to 420, a duplicate -> dropped.
const clampy: StrategyInputs = { ...enduro, race_length_s: 1260, margin_s: 35 };
const cbp = computePitPlan(clampy);
const copts = stretchOptions(cbp, clampy);
check("stretch: clamps to autonomy_s and dedupes to one option", copts.length === 1 && copts[0].stint_max_s === 420, `${copts.length}`);
check("stretch: clamped option still reduces stops (3 -> 2)", cbp.stops === 3 && copts[0].stops === 2);
check("stretch: base plan untouched by stretchOptions", JSON.stringify(cbp) === JSON.stringify(computePitPlan(clampy)));

// — error cases (clear messages, all four inputs guarded + margin sanity)
check("error: autonomy_s <= 0 throws", throws(() => computePitPlan({ ...enduro, autonomy_s: 0 })));
check("error: avg_lap_s <= 0 throws", throws(() => computePitPlan({ ...enduro, avg_lap_s: 0 })));
check("error: race_length_s <= 0 throws", throws(() => computePitPlan({ ...enduro, race_length_s: 0 })));
check("error: pit_loss_s < 0 throws", throws(() => computePitPlan({ ...enduro, pit_loss_s: -1 })));
check("error: margin eating the whole tank throws (stint_max_s <= 0)", throws(() => computePitPlan({ ...enduro, margin_s: 420 })));
check("error: the throw names stint_max_s", (() => {
  try {
    computePitPlan({ ...enduro, margin_s: 500 });
    return false;
  } catch (e) {
    return e instanceof Error && e.message.includes("stint_max_s");
  }
})());
check("error: stretchOptions validates inputs too", throws(() => stretchOptions(ep, { ...enduro, autonomy_s: 0 })));

if (failures > 0) {
  console.error(`\n${failures} strategy test(s) failed`);
  process.exit(1);
}
console.log("\nAll strategy tests passed");
