# Phase 2B-B1a — Schema extension for theo product fields

**Date:** 2026-06-18
**Branch:** `theo/racelab`
**Scope:** `packages/schema` only (+ this doc). No engine/app/logbook/garage/tracks edits.
**Goal:** make William's `schema` package able to round-trip ALL of theo's product-specific
fields, adding genuine gaps as **OPTIONAL** (additive, backward-compatible) so William's
existing data still validates and his code is unaffected. This is the artifact William ratifies.

## Rules honored

- Every added field is OPTIONAL (`?`). No required-field additions.
- Each new field is preserved on read (`parseX` validates-if-present, absent is fine) and
  settable via `makeX` (write-time never-wipe guards: NaN/Infinity reject, signs/integers guard).
- Each new field carries the comment `// theo product field (Phase 2B-B1a); pending William ratification`.
- Mapped to an existing schema field wherever one exists — no duplicates.

## Field-by-field disposition

Legend: **EXISTING** = already in schema (no change) · **NEW-OPTIONAL** = added this phase ·
**DEFERRED** = genuine design call, left for William · **OUT-OF-SCOPE** = belongs to another package.

### Car (theo `CarEntity`)

| theo field | disposition | schema home |
|---|---|---|
| `transponder` | **EXISTING** | `Car.transponder_id` |
| `power` | **EXISTING** | `Car.power_type` (theo `"electric"` ↔ schema `"brushless"` — value mapping is the later bridge's job, not a schema gap) |
| `brand` / `model` / `category` / `scale` | **EXISTING** (registry-known chassis) / **NEW-OPTIONAL** (custom/legacy) | registry via `classLabels(car, registry)`; for a custom chassis (`CUSTOM_CHASSIS_ID`, registry returns `null`) → `Car.custom?: CarCustomChassis { brand?, model?, category?, scale? }` |
| `template_id` | **NEW-OPTIONAL** | `Car.template_id?` — engine `ChassisTemplate` id when a custom/legacy car carries its own template (registry-known cars resolve it via the registry) |
| `drivetrain` (`"4wd"\|"2wd"`) | **NEW-OPTIONAL** | `Car.drivetrain?` |
| `fuel_tank_cc` | **NEW-OPTIONAL** | `Car.fuel_tank_cc?` (cc — matches `FuelLog.tank_cc` unit; `>0`, NaN rejects) |
| `fuel_tank_cl` | **DEFERRED** | theo's v2 unit (cL = cc/10). One canonical unit (cc) added; cL↔cc normalization is a bridge concern. Needs William: confirm cc is canonical. |
| `engine` / `motor` / `esc` / `battery` / `weight_g` / `options` | **OUT-OF-SCOPE** | these are setup/component facts, not car-identity facts — home is `packages/sheets` (a setup version), not the `Car` entity. Not added to `Car`. |

### RunEntry / timing summary `result` (theo `RunResult` + run-level fields)

| theo field | disposition | schema home |
|---|---|---|
| `best_lap_s` / `avg_lap_s` / `consistency_pct` / `laps` / `position` / `mistakes` / `driver_confidence` / `traffic` / `tyre_state_after` | **EXISTING** | `RunResult.*` (read via `effectiveTiming`); `driver_confidence` normalizes into `DriverState.confidence_1to5` |
| `entrants` | **NEW-OPTIONAL** | `RunResult.entrants?` (integer `>=1`; non-timing field, sits with `position`) |
| `laps_list` (number[]) | **NEW-OPTIONAL** | `RunResult.laps_list?` on the **summary** branch only — when a true `LapSeries` exists the `RunTiming kind:"laps"` branch is the source of truth and stats stay derived; this preserves theo's summary-side raw list on round-trip. Each entry finite + `>0`. Excluded from `NonTimingResult`. |
| `autonomy_test` (`{time_s?, laps?}`) | **NEW-OPTIONAL** | `RunEntry.autonomy_test?: AutonomyTest` — **run-level** (race-strategy source), not timing-level. `time_s>=0`, `laps` integer `>=0`. |
| `duration_min` | **NEW-OPTIONAL** | `RunEntry.duration_min?` — run-level, `>=0` |
| `feeling` (0–100) | **EXISTING** | `DriverState.feeling_1to10` (0–100 ↔ 1–10 scale conversion is a bridge concern) |
| `fatigue` (1–5) | **EXISTING** | `DriverState.fatigue_1to5` |
| `fuel_used_cc` | **EXISTING** | `FuelLog.consumed_cc` |
| `corner_notes` (`{corner,note}[]`) | **EXISTING** | `RunFeedback.turns` (`TurnFeedback { turn_n, text? }`) |
| `RunConditions.wind_kmh` / `pressure_hpa` / `sun_pct` | **OUT-OF-SCOPE** | these live on the richer `WeatherObservation` (`wind_speed_kmh`, `pressure_hpa`, `cloud_cover_pct`), not on `RunConditions`. Mapping is a bridge concern; no `RunConditions` gap. |

### Track (theo `TrackEntity`)

| theo field | disposition | schema home |
|---|---|---|
| `corners` (`CornerSpec`) | **EXISTING** | `Track.turns` (`TrackTurn`). Mapping for the later bridge: `direction left/right → L/R`; `shape` (`ninety/esses/...`) → `corner_type`; `features[]` → `bumps`/`banking`/`surface_override`. |
| `visibility` (`"private"\|"public"`) | **EXISTING** | `Track.is_public: boolean` (`"public" → true`) |
| `LapRecord{lap_s, category, holder, date}` | **EXISTING** | `TrackRecord{best_lap_s, class, holder, date, source}` (`lap_s→best_lap_s`, `category→class`) |
| `LapRecord.conditions` (free string) | **NEW-OPTIONAL** | `TrackRecord.conditions?` — theo keys records by class+conditions; no prior home |
| `traits` (string[]) | **NEW-OPTIONAL** | `Track.traits?: readonly string[]` — stored as **free strings** (schema deliberately does not couple to theo's `TRACK_TRAITS` closed list) |
| `surfaces` (string[], multi-surface) | **DEFERRED** | schema's `surface` is a single `Surface`; per-turn `surface_override` covers mixed-surface corners. A track-level multi-surface list is a real contract decision (engine reads `surface` only). Needs William: add `surfaces?` or rely on `surface_override`? |
| `length_m` / `width_m` | **DEFERRED** | descriptive venue dimensions with no current schema consumer. Trivial to add but adding fields nothing reads violates "minimum"; defer until a consumer exists. Needs William. |

## New types / exports added

- `cars.ts`: `CarCustomChassis`; `Car.{template_id?, drivetrain?, fuel_tank_cc?, custom?}`,
  `MakeCarInput.*`, `CarRejectReason += "non_finite_numeric" | "out_of_range"`.
- `tracks.ts`: `Track.traits?`, `MakeTrackInput.traits?`, `TrackRecord.conditions?`.
- `runs.ts`: `AutonomyTest`; `RunResult.{entrants?, laps_list?}`, `RunEntry.{autonomy_test?, duration_min?}`,
  `MakeRunInput.{autonomy_test?, duration_min?}`. `NonTimingResult` excludes `laps_list`.
- `parse.ts`: validate-if-present for all of the above (foreign/corrupt values reject on load).
- `index.ts`: exports `CarCustomChassis`, `AutonomyTest`.

## Test evidence

Added a `theo product fields (B1a)` block to `test-schema.ts`: per field, a make → JSON → parse
round-trip AND a backward-compat assertion that the pre-existing fixture entity (which omits the
field) still parses; plus never-wipe rejection cases (NaN/`<=0`/bad enum, on both `makeX` write and
`parseX` load).

| Gate | Command | Result |
|---|---|---|
| schema | `cd packages/schema && npm test` | **GREEN** — all checks passed (168 prior + 44 new) |
| schema typecheck | `npm run typecheck` | **GREEN** |
| engine | `cd packages/engine && npm test` | **GREEN** — 13/13 eval scenarios (≥10/10) |
| storage | `cd packages/storage && npm test` | **GREEN** — 137 passed, 0 failed |
| storage typecheck | `npm run typecheck` | **GREEN** |

Storage repos (`repos.ts`) read every entity through `parseCar`/`parseTrack`/`parseRunEntry`, so the
new optional fields round-trip through the repos automatically — confirmed by the storage suite.

## Deferred — needs William

1. **Car `fuel_tank_cl`** — confirm cc is the canonical unit (cL→cc is a bridge transform).
2. **Track `surfaces`** (multi-surface list) — add a track-level list, or rely on per-turn
   `surface_override`? Engine reads `surface` only today.
3. **Track `length_m` / `width_m`** — add now (no consumer yet) or wait for a consumer?

Status: **DONE_WITH_CONCERNS** — all gaps either mapped or added; three genuinely-ambiguous
fields deferred for William rather than guessing a bad home.
