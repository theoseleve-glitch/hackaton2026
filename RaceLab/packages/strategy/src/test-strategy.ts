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

// — R4-1 fuel-vs-tyre tradeoff depth ─────────────────────────────────────────
// (a) cliff-driven plan: tyres set the stops, a bigger tank wouldn't help.
check(
  "R4-1: cliff plan states tyres (not fuel) set the stops — bigger tank wouldn't help",
  cp.notes.some((n) => /Tyres, not fuel, set the stops/.test(n) && /bigger tank wouldn't help/.test(n)),
  cp.notes.join(" | "),
);
check(
  "R4-1: cliff plan quantifies how far BEFORE the fuel window the cliff lands (385-280=105s)",
  cp.notes.some((n) => n.includes("105s") && n.includes("BEFORE the tank runs low")),
  cp.notes.join(" | "),
);
// (b) fuel-driven enduro (no cliff data): fuel sets the stops, range is the lever.
check(
  "R4-1: fuel-bound enduro names fuel as the stop-setter and range as the lever",
  ep.notes.some((n) => /Fuel sets the stops/.test(n) && /bigger tank or leaner consumption/.test(n)),
  ep.notes.join(" | "),
);
// (c) late-cliff enduro: cliff is OUTSIDE the window → fuel decides, named + quantified.
{
  const lateCliff = [36.8, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 36.2, 37.2, 38.2];
  const lp = computePitPlan({ ...enduro, lap_times: lateCliff });
  check(
    "R4-1: late-cliff plan states fuel (not tyres) sets the stops + names range as the lever",
    lp.notes.some((n) => /Fuel, not tyres, sets the stops/.test(n) && /more range/.test(n)),
    lp.notes.join(" | "),
  );
}
// (d) stretch option explains WHY it beats the base plan: stops-vs-stint tradeoff.
check(
  "R4-1: stretch option states why it beats the base plan (one fewer stop vs longer stints)",
  opts[0].notes.some((n) => /Why it beats the 3-stop plan/.test(n) && /one fewer trip down pit lane/.test(n) && /longer on the same tyres/.test(n)),
  opts[0].notes.join(" | "),
);
check(
  "R4-1: stretch tradeoff quantifies pit-time saved (25s) vs extra stint length (70s longer)",
  opts[0].notes.some((n) => n.includes("(25s) of standing time") && n.includes("(70s) longer")),
  opts[0].notes.join(" | "),
);
check(
  "R4-1: fuel-bound stretch justifies itself by the absent cliff ('no tyre cliff inside the fuel window')",
  opts[0].notes.some((n) => /no tyre cliff inside the fuel window/.test(n)),
  opts[0].notes.join(" | "),
);
// R4-1 tradeoff lines are NaN-free everywhere they appear.
check(
  "R4-1: tradeoff notes never render NaN/Infinity/undefined",
  [cp, ep, opts[0]].every((p) => p.notes.every((n) => !/NaN|Infinity|undefined/.test(n))),
);

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

// — R6-3 strategy edge cases ──────────────────────────────────────────────────
// (a) No measured autonomy → the output SAYS it's an estimate and what to log,
//     and the math is otherwise unchanged from the measured run.
{
  const estimated = computePitPlan({ ...enduro, autonomy_estimated: true });
  const measured = computePitPlan({ ...enduro });
  check(
    "R6-3: estimated autonomy → notes say it's an ESTIMATE, not measured",
    estimated.notes.some((n) => /no full-tank run is logged yet/i.test(n) && /it's an ESTIMATE, not measured/i.test(n)),
    estimated.notes.join(" | "),
  );
  check(
    "R6-3: estimated autonomy → notes tell the racer to log a run-until-dry for a real number",
    estimated.notes.some((n) => /run-until-dry/i.test(n) && /re-plan for a real number/i.test(n)),
    estimated.notes.join(" | "),
  );
  check(
    "R6-3: estimated flag tags the full-tank line '(estimated)' (no false precision)",
    estimated.notes.some((n) => /Full tank lasts/.test(n) && n.includes("(estimated)")),
    estimated.notes.join(" | "),
  );
  check(
    "R6-3: the estimate disclaimer comes FIRST (before any number)",
    /no full-tank run is logged yet/i.test(estimated.notes[0]),
    estimated.notes[0],
  );
  check(
    "R6-3: estimate flag does NOT change the math (same stops/stints/total as measured)",
    estimated.stops === measured.stops && durationsOf(estimated) === durationsOf(measured) && estimated.total_time_s === measured.total_time_s,
    `${estimated.stops}/${durationsOf(estimated)} vs ${measured.stops}/${durationsOf(measured)}`,
  );
  // Without the flag, no estimate language leaks in.
  check("R6-3: measured plan carries NO estimate disclaimer", !measured.notes.some((n) => /ESTIMATE|estimated/i.test(n)), measured.notes.join(" | "));
  // NaN-free + deterministic.
  check("R6-3: estimate notes are NaN/undefined-free", estimated.notes.every((n) => !/NaN|Infinity|undefined/.test(n)));
  check("R6-3: estimate plan is deterministic", JSON.stringify(estimated) === JSON.stringify(computePitPlan({ ...enduro, autonomy_estimated: true })));
}

// (b) Single-stint / no-pit race → a clear "one tank covers it, no stop" line and
//     NO misleading fuel/tyre lever rationale (which only applies when you stop).
{
  // 5-min sprint, full tank (420s) longer than the race → zero stops.
  const single = computePitPlan({ race_length_s: 300, race_type: "sprint", avg_lap_s: 35, autonomy_s: 420, pit_loss_s: 25 });
  check("R6-3: single-tank race reports zero stops", single.stops === 0, String(single.stops));
  check(
    "R6-3: single-stint race says one tank covers it + manage the tyres (no odd empty pit list)",
    single.notes.some((n) => /One tank covers the whole race — no stop needed/i.test(n) && /manage the tyres/i.test(n)),
    single.notes.join(" | "),
  );
  check(
    "R6-3: single-stint race does NOT emit the fuel/tyre 'sets the stops' lever rationale",
    !single.notes.some((n) => /sets the stops/i.test(n)),
    single.notes.join(" | "),
  );
  check("R6-3: single-stint race has an empty pit list + a single stint", single.pit_at_s.length === 0 && single.stints.length === 1);

  // An endurance race that also fits one tank behaves the same (no cliff data).
  const singleEnduro = computePitPlan({ race_length_s: 300, race_type: "endurance", avg_lap_s: 35, autonomy_s: 600, pit_loss_s: 25 });
  check("R6-3: a one-tank endurance race is also a clean no-stop verdict", singleEnduro.stops === 0 && singleEnduro.notes.some((n) => /no stop needed/i.test(n)), singleEnduro.notes.join(" | "));
}

// (c) Extremes — sane output at both ends, no throw, NaN-free, deterministic.
{
  // Very short: a 60s race finishes the lap you're on, zero stops.
  const veryShort = computePitPlan({ race_length_s: 60, race_type: "sprint", avg_lap_s: 35, autonomy_s: 420, pit_loss_s: 25 });
  check("R6-3: very short race → finishes the lap, zero stops, sensible total", veryShort.stops === 0 && veryShort.total_time_s > 0 && veryShort.stints.length === 1, `${veryShort.stops}/${veryShort.total_time_s}`);
  // Very long: a 3-hour enduro yields many sane, even stints under the cap.
  const veryLong = computePitPlan({ race_length_s: 10800, race_type: "endurance", avg_lap_s: 35, autonomy_s: 420, pit_loss_s: 25 });
  check("R6-3: very long race → many stops, every stint under the cap, total covers the race", veryLong.stops > 10 && veryLong.stints.every((s) => s.duration_s <= veryLong.stint_max_s) && veryLong.total_time_s >= 10800, `${veryLong.stops}/${veryLong.total_time_s}`);
  check("R6-3: extremes are NaN/undefined-free in notes", [veryShort, veryLong].every((p) => p.notes.every((n) => !/NaN|Infinity|undefined/.test(n))));
  check("R6-3: extremes are deterministic", JSON.stringify(veryLong) === JSON.stringify(computePitPlan({ race_length_s: 10800, race_type: "endurance", avg_lap_s: 35, autonomy_s: 420, pit_loss_s: 25 })));
}

// ═══════════════════════════════════════════════════════════════════════════
// F1 — consumption-based range estimation
// ═══════════════════════════════════════════════════════════════════════════
// Base enduro reused: avg 35s, single autonomy test 420s, pit 25s, margin 35s.
// Consumption: a 6000cc tank burning a clean ~110cc/lap.
//   mean_s        = (6000 / 110) * 35 = 1909.09…s
//   With σ=0: pessimistic_s = mean_s (rate = mean) = 1909.09…s
//   effectiveAutonomy = min((mean_s + 420)/2, pessimistic_s)
//                     = min(1164.5, 1909.1) = 1164.5  (the blend; floor doesn't bite)
{
  const cleanCons: StrategyInputs = {
    ...enduro,
    use_consumption_estimate: true,
    consumption_based: { mean_cc_per_lap: 110, std_dev_cc_per_lap: 0, runs_sampled: 4, tank_cc: 6000 },
  };
  const cp1 = computePitPlan(cleanCons);
  const meanS = (6000 / 110) * 35; // ~1909.09
  check(
    "F1: clean multi-run consumption → autonomy_estimate.mean_s ≈ (tank/mean_cc)*avg",
    cp1.autonomy_estimate !== undefined && Math.abs(cp1.autonomy_estimate.mean_s - Math.round(meanS * 10) / 10) < 0.2,
    `${cp1.autonomy_estimate?.mean_s} vs ${meanS}`,
  );
  check(
    "F1: zero-variance consumption → pessimistic_s equals mean_s",
    cp1.autonomy_estimate !== undefined && cp1.autonomy_estimate.pessimistic_s === cp1.autonomy_estimate.mean_s,
    `${cp1.autonomy_estimate?.pessimistic_s} vs ${cp1.autonomy_estimate?.mean_s}`,
  );
  check("F1: derived_from_runs reflects runs_sampled", cp1.autonomy_estimate?.derived_from_runs === 4, `${cp1.autonomy_estimate?.derived_from_runs}`);
  check(
    "F1: note states the run-count + mean/2σ in mm:ss",
    cp1.notes.some((n) => /Tank autonomy from 4 logged run/.test(n) && /2σ margin/.test(n)),
    cp1.notes.join(" | "),
  );
  check("F1: estimate notes are NaN/undefined-free", cp1.notes.every((n) => !/NaN|Infinity|undefined/.test(n)));

  // Pessimistic floor BITES: high mean but wide σ pulls the planning window down.
  //   mean 130 ±25 → pessimistic rate 180 → pessimistic_s = (6000/180)*35 = 1166.7
  //   mean_s = (6000/130)*35 = 1615.4 ; blend = (1615.4+420)/2 = 1017.7
  //   effective = min(1017.7, 1166.7) = 1017.7 — but verify pessimistic < mean.
  const varied: StrategyInputs = {
    ...enduro,
    use_consumption_estimate: true,
    consumption_based: { mean_cc_per_lap: 130, std_dev_cc_per_lap: 25, runs_sampled: 5, tank_cc: 6000 },
  };
  const cp2 = computePitPlan(varied);
  check(
    "F1: with variance, pessimistic_s < mean_s (the 2σ envelope is conservative)",
    cp2.autonomy_estimate !== undefined && cp2.autonomy_estimate.pessimistic_s < cp2.autonomy_estimate.mean_s,
    `${cp2.autonomy_estimate?.pessimistic_s} vs ${cp2.autonomy_estimate?.mean_s}`,
  );
  check(
    "F1: high variance (σ/mean > 15%) → a warning to log a clean fuel test",
    cp2.notes.some((n) => /varies a lot/.test(n) && /run-until-dry/.test(n)),
    cp2.notes.join(" | "),
  );

  // Mixed: consumption present but NOT opted in → behaves exactly as autonomy-only.
  const optedOut: StrategyInputs = { ...cleanCons, use_consumption_estimate: false };
  const cpOut = computePitPlan(optedOut);
  const plain = computePitPlan(enduro);
  check(
    "F1: consumption present but use_consumption_estimate=false → identical to autonomy-only",
    JSON.stringify(cpOut) === JSON.stringify(plain) && cpOut.autonomy_estimate === undefined,
    `estimate=${cpOut.autonomy_estimate !== undefined}`,
  );
  check(
    "F1: no consumption_based at all → no autonomy_estimate, plan unchanged",
    plain.autonomy_estimate === undefined,
  );

  // Determinism.
  check("F1: consumption plan is deterministic", JSON.stringify(cp1) === JSON.stringify(computePitPlan(cleanCons)));

  // NaN-guard: garbage consumption fields are IGNORED, plan stays valid (autonomy-only).
  const nanCases: StrategyInputs[] = [
    { ...enduro, use_consumption_estimate: true, consumption_based: { mean_cc_per_lap: NaN, std_dev_cc_per_lap: 5, runs_sampled: 3, tank_cc: 6000 } },
    { ...enduro, use_consumption_estimate: true, consumption_based: { mean_cc_per_lap: 110, std_dev_cc_per_lap: NaN, runs_sampled: 3, tank_cc: 6000 } },
    { ...enduro, use_consumption_estimate: true, consumption_based: { mean_cc_per_lap: 110, std_dev_cc_per_lap: 5, runs_sampled: 3, tank_cc: 0 } },
    { ...enduro, use_consumption_estimate: true, consumption_based: { mean_cc_per_lap: 0, std_dev_cc_per_lap: 5, runs_sampled: 3, tank_cc: 6000 } },
    { ...enduro, use_consumption_estimate: true, consumption_based: { mean_cc_per_lap: 110, std_dev_cc_per_lap: -5, runs_sampled: 3, tank_cc: 6000 } },
    { ...enduro, use_consumption_estimate: true, consumption_based: { mean_cc_per_lap: 110, std_dev_cc_per_lap: 5, runs_sampled: 0, tank_cc: 6000 } },
    { ...enduro, use_consumption_estimate: true, consumption_based: { mean_cc_per_lap: Infinity, std_dev_cc_per_lap: 5, runs_sampled: 3, tank_cc: 6000 } },
  ];
  check(
    "F1: NaN-guard — any non-finite/insane consumption field → estimate dropped, plan == autonomy-only",
    nanCases.every((c) => {
      const p = computePitPlan(c);
      return p.autonomy_estimate === undefined && JSON.stringify({ ...p, notes: 0, pit_traffic_risks: 0 }) === JSON.stringify({ ...plain, notes: 0, pit_traffic_risks: 0 });
    }),
  );
  check(
    "F1: NaN-guard cases never throw and never render NaN in notes",
    nanCases.every((c) => {
      const p = computePitPlan(c);
      return p.notes.every((n) => !/NaN|Infinity|undefined/.test(n));
    }),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// F3 — pit-window-vs-traffic (RC-honest)
// ═══════════════════════════════════════════════════════════════════════════

// (a) Solo / tiny field → every pit moment is `none`.
{
  const solo = computePitPlan({ ...enduro, entrants: 1 });
  check("F3: solo race → pit_traffic_risks all 'none'", solo.pit_traffic_risks !== undefined && solo.pit_traffic_risks.length === solo.pit_at_s.length && solo.pit_traffic_risks.every((r) => r.risk_type === "none"), JSON.stringify(solo.pit_traffic_risks?.map((r) => r.risk_type)));
  check("F3: solo race risks carry pit_at_s + a sane pit_lap (>=1)", solo.pit_traffic_risks!.every((r) => r.pit_lap >= 1 && r.pit_at_s > 0));
  check("F3: solo race note says clear air", solo.notes.some((n) => /no pack to rejoin into and no one to be lapped by/.test(n)), solo.notes.join(" | "));
  const twoCar = computePitPlan({ ...enduro, entrants: 2 });
  check("F3: 2-car field also all 'none'", twoCar.pit_traffic_risks!.every((r) => r.risk_type === "none"));
}

// (b) No field info → `unknown` (conservative — we never guess the field).
{
  const noField = computePitPlan({ ...enduro });
  check("F3: no entrants → all risks 'unknown' (default field is not asserted)", noField.pit_traffic_risks !== undefined && noField.pit_traffic_risks.every((r) => r.risk_type === "unknown"), JSON.stringify(noField.pit_traffic_risks?.map((r) => r.risk_type)));
  check("F3: unknown risks carry a 'log entrants' mitigation", noField.pit_traffic_risks!.every((r) => r.mitigation !== undefined && /entrants/.test(r.mitigation!)));
  check("F3: unknown-field note tells the racer to log the field size", noField.notes.some((n) => /not enough field\/position data/.test(n)), noField.notes.join(" | "));
}

// (c) Leading + late lapped traffic → lapped_cars / high.
//   Big field, you are P1, a long enduro so the late window has lapped cars.
{
  const leading = computePitPlan({ ...enduro, race_length_s: 3600, entrants: 12, current_position: 1 });
  const hasLapped = leading.pit_traffic_risks!.some((r) => r.risk_type === "lapped_cars" && r.severity === "high");
  check("F3: leading a big field, late stop → lapped_cars/high on at least one pit moment", hasLapped, JSON.stringify(leading.pit_traffic_risks?.map((r) => `${r.risk_type}/${r.severity}`)));
  check("F3: lapped_cars carries a clear-air mitigation", leading.pit_traffic_risks!.some((r) => r.risk_type === "lapped_cars" && /clear air/.test(r.mitigation ?? "")));
  check("F3: lapped-cars summary note mentions the cold out-lap", leading.notes.some((n) => /out-lap runs/.test(n) && /lapped cars/.test(n)), leading.notes.join(" | "));

  // Same race but position UNKNOWN → we won't assert you're leading: late window stays 'unknown'.
  const leadingNoPos = computePitPlan({ ...enduro, race_length_s: 3600, entrants: 12 });
  check(
    "F3: big field but no position → late-window risk is 'unknown', never asserted lapped_cars",
    !leadingNoPos.pit_traffic_risks!.some((r) => r.risk_type === "lapped_cars"),
    JSON.stringify(leadingNoPos.pit_traffic_risks?.map((r) => r.risk_type)),
  );
}

// (d) Mid-field uniform pits → pack_rejoin / high + the ±1 lap mitigation.
//   Mid-pack position (so NOT near the front → no lapped-car claim), field >= 4,
//   a uniform stint cap shorter than the race → synced pit windows.
{
  const pack = computePitPlan({ ...enduro, entrants: 10, current_position: 6 });
  const packRisk = pack.pit_traffic_risks!.find((r) => r.risk_type === "pack_rejoin");
  check("F3: mid-field, synced uniform window → pack_rejoin/high", packRisk !== undefined && packRisk.severity === "high", JSON.stringify(pack.pit_traffic_risks?.map((r) => `${r.risk_type}/${r.severity}`)));
  check("F3: pack_rejoin mitigation is the ±1 lap break-the-sync line", packRisk?.mitigation !== undefined && /±1 lap to break the sync/.test(packRisk.mitigation) && /doesn't cost a stop/.test(packRisk.mitigation), packRisk?.mitigation);
  check("F3: pack summary note names the synced window + clear air", pack.notes.some((n) => /boxes together/.test(n) && /clear air/.test(n)), pack.notes.join(" | "));
}

// (e) No stops (one tank) → no pit_traffic_risks at all (nothing rejoins).
{
  const noStop = computePitPlan({ race_length_s: 300, race_type: "sprint", avg_lap_s: 35, autonomy_s: 420, pit_loss_s: 25, entrants: 10 });
  check("F3: a no-stop race has no pit_traffic_risks (no rejoin happens)", noStop.stops === 0 && noStop.pit_traffic_risks === undefined);
}

// (f) Determinism + NaN-guard on entrants/position.
{
  const ref = computePitPlan({ ...enduro, entrants: 10, current_position: 6 });
  check("F3: traffic plan is deterministic", JSON.stringify(ref) === JSON.stringify(computePitPlan({ ...enduro, entrants: 10, current_position: 6 })));
  const badEntrants: StrategyInputs[] = [
    { ...enduro, entrants: NaN },
    { ...enduro, entrants: Infinity },
    { ...enduro, entrants: 8.5 },
    { ...enduro, entrants: 0 },
    { ...enduro, entrants: -3 },
  ];
  check(
    "F3: NaN-guard — non-finite/non-integer/<1 entrants → 'unknown' (treated as no field), never throws",
    badEntrants.every((c) => {
      const p = computePitPlan(c);
      return p.pit_traffic_risks !== undefined && p.pit_traffic_risks.every((r) => r.risk_type === "unknown");
    }),
  );
  const badPos = computePitPlan({ ...enduro, race_length_s: 3600, entrants: 12, current_position: NaN });
  check(
    "F3: NaN position → never asserts lapped_cars (falls back to unknown in the late window)",
    !badPos.pit_traffic_risks!.some((r) => r.risk_type === "lapped_cars"),
    JSON.stringify(badPos.pit_traffic_risks?.map((r) => r.risk_type)),
  );
  check(
    "F3: traffic notes/mitigations never render NaN/Infinity/undefined",
    [ref, ...badEntrants.map(computePitPlan), badPos].every((p) =>
      p.notes.every((n) => !/NaN|Infinity|undefined/.test(n)) &&
      (p.pit_traffic_risks ?? []).every((r) => r.mitigation === undefined || !/NaN|Infinity|undefined/.test(r.mitigation)),
    ),
  );
}

// (g) F1 + F3 together — both attach, both NaN-free, deterministic.
{
  const both = computePitPlan({
    ...enduro,
    use_consumption_estimate: true,
    consumption_based: { mean_cc_per_lap: 130, std_dev_cc_per_lap: 25, runs_sampled: 5, tank_cc: 6000 },
    entrants: 10,
    current_position: 6,
  });
  check("F1+F3: both autonomy_estimate and pit_traffic_risks present together", both.autonomy_estimate !== undefined && both.pit_traffic_risks !== undefined && both.pit_traffic_risks.length > 0);
  check("F1+F3: combined plan deterministic + NaN-free", JSON.stringify(both) === JSON.stringify(computePitPlan({ ...enduro, use_consumption_estimate: true, consumption_based: { mean_cc_per_lap: 130, std_dev_cc_per_lap: 25, runs_sampled: 5, tank_cc: 6000 }, entrants: 10, current_position: 6 })) && both.notes.every((n) => !/NaN|Infinity|undefined/.test(n)));
}

if (failures > 0) {
  console.error(`\n${failures} strategy test(s) failed`);
  process.exit(1);
}
console.log("\nAll strategy tests passed");
