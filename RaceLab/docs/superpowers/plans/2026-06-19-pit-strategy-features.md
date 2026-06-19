# New Pit-Strategy Features — RC-honest design

> Scoped against the real strategy model + logged data + RC reality. Verdicts: F1 consumption-range = BUILD; F2 undercut/overcut = SKIP (needs rival data RC lacks); F3 traffic = BUILD (RC-honest). All pure/deterministic/NaN-guarded. Gated by strategy + engine (eval/adversarial) + app tsc.

## Feature 1 — Consumption-based range estimation (BUILD)
**Problem:** strategy trusts ONE autonomy-until-dry test (noisy: temp, tune, grip vary). **Fix:** estimate tank range from consumption rate across multiple logged runs, with a pessimistic 2σ envelope.

**Model (pure):** per run with fuel+laps: `cc_per_lap = fuel.consumed_cc / lap_count`. Across selected runs: `mean_cc_per_lap`, `std_dev_cc_per_lap`. Range: `tank_range_s = (tank_cc / mean_cc_per_lap) * avg_lap_s`. Pessimistic: `(tank_cc / (mean + 2*std)) * avg_lap_s`. Blend with the single autonomy test when both exist; use the pessimistic as the margin floor. Use the schema `fuelStats()` helper.

**Data:** `RunEntry.fuel.{tank_cc,consumed_cc}`, `timing.laps`, optional `autonomy_test.time_s` — ALL exist; no new schema. New UI: optional StrategyForm checkbox "use consumption history" (default yes when data exists).

**Output:** `StrategyInputs.consumption_based?: {mean_cc_per_lap, std_dev_cc_per_lap, runs_sampled}` + `use_consumption_estimate?`; `PitPlan.autonomy_estimate?: {mean_s, pessimistic_s, derived_from_runs}`. Note: "Tank autonomy from N logged runs (mm:ss mean, mm:ss with 2σ margin)." High-variance → warn ("log a test with fresh fuel + dialed tune").

**Tests:** clean multi-run consumption; mixed consumption+autonomy-only runs; high-variance (warn). Determinism + NaN-guard (drop runs missing fuel/laps).

## Feature 2 — Undercut/overcut (SKIP, with reason)
Classic undercut/overcut need rival pit-plan + fuel-state knowledge. RC has NO live rival telemetry (own transponder only; position is end-of-lap). Computing "pit lap 12 to undercut P1" is not data-supported → would be scientifically dishonest. **Do not build.** The useful piece (rejoin in clear air) is covered by F3.

## Feature 3 — Pit-window-vs-traffic (BUILD, RC-honest)
**Problem:** your out-lap (cold tyres, light/high-rev) can rejoin into lapped cars or a pack. **Fix:** warn per pit moment using only YOUR pace + field size.

**Model (pure, conservative — flag "unknown" when unsure):** for each `pit_at_s[i]`: `rejoin_time_s = pit_at_s[i] + pit_loss_s`; out-lap `avg_lap_s * 1.05`. Lapped-car estimate: `leader_laps = race_length_s/avg_lap_s`; backmarkers ≈ leader − entrants/2 (rough) — if rejoin lands in backmarker-lap range, flag `lapped_cars`. Pack-rejoin: if a uniform stint cap means everyone pits ~same moment, flag `pack_rejoin` with mitigation "pit ±1 lap to break the sync (only if it doesn't cost a stop)." Solo/no-field-info → `none`/`unknown`.

**Data:** `RunEntry.result.entrants` (field size, default 8 if absent), `timing.laps` (pace), `result.position` (optional). No new schema. No new input.

**Output:** `PitPlan.pit_traffic_risks?: Array<{pit_at_s, pit_lap, risk_type: "lapped_cars"|"pack_rejoin"|"backmarker_zone"|"none"|"unknown", severity: "low"|"medium"|"high", mitigation?}>`. Render flags/notes in PitPlanView.

**Tests:** solo race → none; leading + lapped traffic late → lapped_cars/high; mid-field uniform pits → pack_rejoin/high + mitigation. Determinism + NaN-guard (reject non-finite entrants/laps).

## Build order: F1 → F3. (F2 skipped.) Gate every step: strategy `npm test`, engine `npm test` (eval ≥18, adversarial 0 — unaffected but verify), app `tsc` 0.
