# LAP V1 — Conditions Engine Specification

**Scope:** The track-conditions engine. What inputs it consumes, what physical effects it models, what outputs it produces, what research it's grounded in.

**Status:** Designed. Not built. Day 8–10 implementation work per `LAP_V1_BUILD_PLAN.md`.

**Last updated:** 2026-05-12

This document is the engineering reference for the conditions engine. It does not cover repos, branches, day sequencing, or build operations — those live in `LAP_V1_BUILD_PLAN.md` and `LAP_V1_PRODUCTION_SPEC.md`.

---

## 1. What the engine does

For each session, produce a description of track grip that respects:
- Real-world weather conditions at the track location and time
- The track's spatial geometry (per-segment elevation, orientation, sun/wind exposure)
- User-provided ground truth when available

Output: a single `WeatherCondition` per session, containing both a scalar baseline μ and a spatial μ-modifier function `mu_spatial_factor(s)` indexed along the racing-line arclength.

The engine REPLACES the existing ML conditions classifier, which Day 3 empirically proved broken (deterministic output μ ≈ 0.85 with high confidence on every session regardless of actual conditions).

---

## 2. Output hierarchy

```
1. User metadata `condition` field → wins, always (source = "user")
2. Else: weather-based classifier → scalar + spatial output (source = "weather")
3. Else: ML classifier fallback only when weather API unavailable (source = "ml_fallback")
```

---

## 3. Physical model — what we're modeling

Track grip is a function of three things, in roughly this order of impact for kart racing on tarmac:

1. **Water on the surface** (film thickness + rate of replenishment) — determines the wet/damp/dry partition entirely. Hydroplaning physics dominate above ~1mm film.
2. **Track temperature** — for kart tires (small contact patch, no warmers), surface temperature has outsized effect on μ. Pacejka tire model and empirical motorsport friction data show μ varying ±15% over a 10–40°C track-surface range.
3. **Surface contamination** — dust, marbles, oil, rubber accumulation. Mostly NOT recoverable from weather data; we model "days since rain" as a weak proxy (rain clears dust; oil rises to surface during dry spells and emulsifies on first rain).

The weather API provides inputs to compute (1) directly, (2) via a track-temperature estimation model, and (3) approximately via rain history with explicit oil-rejection handling.

For the spatial layer, three geometric effects modulate the scalar baseline:
- **Drainage** (low elevation segments pool water; steep grades drain fast)
- **Sun exposure** (terrain-shaded segments dry slower than sunlit)
- **Wind exposure** (windward segments dry faster than leeward/sheltered)

---

## 4. The 15 weather inputs (scalar classifier)

Fetched from **Open-Meteo Historical Weather API** (`https://archive-api.open-meteo.com/v1/archive`). Free, no API key, hourly granularity, worldwide coverage, archive goes back decades.

### Primary (10 — from Open-Meteo hourly endpoint, 48h window ending at session start)

| # | Parameter | Open-Meteo field | Unit | Why it matters |
|---|---|---|---|---|
| P1 | precipitation last 1h | `precipitation` (sum of last hourly point) | mm | Wet/dry hard split; hydroplaning above 0.5mm/h |
| P2 | precipitation last 6h | sum of 6 most recent hourly points | mm | Recent wetness; surface film state |
| P3 | precipitation last 24h | sum over 24h | mm | Saturation; sub-surface moisture |
| P4 | precipitation last 48h | sum over 48h | mm | Whether track had time to fully dry; greasy indicator |
| P5 | air temperature | `temperature_2m` at session start | °C | Direct input to track-temp estimation |
| P6 | solar radiation | `shortwave_radiation` at session start | W/m² | Track heating from sun; primary driver of track-temp lift above air-temp |
| P7 | cloud cover | `cloudcover` at session start | % | Solar attenuation; cross-check on shortwave |
| P8 | wind speed | `windspeed_10m` at session start | km/h | Track cooling; affects drying rate |
| P9 | relative humidity | `relative_humidity_2m` at session start | % | Drying rate; dew risk |
| P10 | dew point | `dewpoint_2m` at session start | °C | If air temp ≤ dew point: condensation; damp risk even with zero rain |

**Also fetched** for the spatial classifier (Section 6): `winddirection_10m` (°). Stored in `raw_inputs` but not consumed by the scalar rules.

### Derived (5 — computed in code)

| # | Metric | Formula | Grounding |
|---|---|---|---|
| D1 | track temperature estimate (°C) | `T_track = T_air + α·(W_solar/1000)·(1 - 0.5·cloud_fraction) - β·windspeed_kmh` with α=12.0, β=0.15 | TRB pavement-temperature prediction literature; standard linear surface-temperature model. Quora answer from F1 expert: "track temperatures tens of degrees higher than ambient air" — confirmed by Pirelli motorsport guidance. |
| D2 | hours since significant rain | scan hourly precipitation backwards; return hours until cumulative ≥ 1.0 mm (999 if none in 48h) | Operational; "significant" = enough to wet the surface. |
| D3 | cumulative solar since rain | integrate `W_solar × (1 - cloud_fraction)` over hours from D2 to session start | Surface drying budget; energy delivered for evaporation. |
| D4 | drying rate estimate | `drying_rate ∝ max(T_track - T_dew, 0) × (W_solar/1000) × (1 - RH/100) × √(windspeed_kmh)` | Simplified Penman 1948 evaporation model. |
| D5 | days since last significant rain | scan 30-day daily archive backwards; return days until first day with precipitation > 3.0 mm (None if window empty) | For oil-rejection detection (Rule 5b). Eisenberg 2003 quantifies the effect (3.7% fatal-accident increase 2 days after dry-spell rain, scaling with dry-spell duration). |

The daily archive (for D5) requires a separate Open-Meteo call: `daily=precipitation_sum` for the 30 days preceding session start. Cache it under its own key.

---

## 5. Scalar classification rules (10)

Evaluated in order; first match wins. Confidence attached per rule.

| # | Label | Trigger | Confidence |
|---|---|---|---|
| 1 | WET-heavy | P1 > 2.0 mm | 0.95 |
| 2 | WET | P1 > 0.5 mm | 0.90 |
| 3 | WET-dew | P6 > 3.0 mm AND P5 ≤ T_dew + 2 | 0.80 |
| 4 | DAMP | P6 > 1.0 mm AND P1 ≤ 0.5 mm | 0.80 |
| 5 | DAMP-dew | P5 ≤ T_dew + 1 AND P1 == 0 | 0.70 |
| 5b | **GREASY-oilrejection** | D5 ≠ None AND D5 > 14 AND P24 > 1.0 mm AND P1 < 0.5 mm | 0.85 |
| 6 | GREASY-recent | P24 > 1.0 mm AND D2 ∈ [2, 12] | 0.80 |
| 7 | GREASY-cold | D1 < 12°C AND P48 > 5.0 mm | 0.75 |
| 8 | GREASY-slowdry | D4 < 0.3 kWh/m²/h AND P48 > 0 | 0.65 |
| 9 | DRY | else | clamp(D1/30, 0.5, 0.95) |

**Rule 5b (oil-rejection) is the key non-obvious one.** It captures the "first rain after long dry spell" phenomenon: pavement-trapped petroleum products and bitumen-released oils rise to the surface during dry weather and emulsify with the first rain, producing a film that persists even after the surface visibly dries. Eisenberg 2003 (UC Berkeley, *American Journal of Public Health*) quantified this with US traffic-accident data; Bridgestone (Hamashima) and Pirelli describe the same mechanism in motorsport contexts — Pirelli specifically on Mexico City's new asphalt: "very shiny new top layer of oil and grease that makes it very hard to find traction."

Rule 5b takes precedence over Rule 6 because oil-rejection is a more pessimistic μ than standard greasy — the rule order matters.

---

## 6. mu_scale lookup (function of label + D1 track temp)

```
DRY:
  D1 < 10°C:        mu_scale = 0.92
  D1 ∈ [10, 25]°C:  mu_scale = 0.98 + 0.04·((D1-10)/15)   # rises to 1.02
  D1 ∈ [25, 35]°C:  mu_scale = 1.00
  D1 ∈ [35, 45]°C:  mu_scale = 1.00 - 0.04·((D1-35)/10)   # falls to 0.96
  D1 > 45°C:        mu_scale = 0.92

GREASY (standard, Rule 6/7/8):
  D1 < 12°C:        mu_scale = 0.82
  D1 ∈ [12, 20]°C:  mu_scale = 0.85
  D1 > 20°C:        mu_scale = 0.88

GREASY-oilrejection (Rule 5b override; -0.05 vs standard):
  D1 < 12°C:        mu_scale = 0.77
  D1 ∈ [12, 20]°C:  mu_scale = 0.80
  D1 > 20°C:        mu_scale = 0.83

DAMP:
  D1 < 15°C:        mu_scale = 0.70
  D1 ∈ [15, 25]°C:  mu_scale = 0.75
  D1 > 25°C:        mu_scale = 0.78

WET (water_film thresholded from P1):
  P1 ≤ 2.0 (thin film): mu_scale = 0.60
  P1 > 2.0 (thick film): mu_scale = 0.55
```

The DRY ladder reflects the well-known optimal tire-grip window for kart slicks — too cold = unwarmed, too hot = degrading. Above-40°C is a real concern on summer afternoons.

The values above are **first-pass empirical guesses**, not calibrated truth. Driver-feedback loop in V1.5 (UI prompt "weather said X, you felt Y") feeds threshold and lookup calibration.

---

## 7. Spatial μ modifier (Day 9 layer)

The scalar classifier outputs a global μ_baseline. The spatial layer multiplies it by a per-segment factor derived from track geometry + weather direction.

### Architecture

```
mu_effective(s, n, v) = mu_data(s, n) · mu_baseline · mu_spatial_factor(s)

where:
  mu_data(s, n)        — data-derived Bayesian (s,n) grip posterior from track_surface/
  mu_baseline          — scalar from Section 5/6 above
  mu_spatial_factor(s) — Section 7 below; per-segment, clamped to [0.6, 1.5]
```

### The three coefficient factors

For each segment `s` of the racing line, compute three independent factors. Final spatial factor inverts their product (factors > 1 = wetter = lower effective μ).

#### Factor 1 — Drainage (from local elevation gradient)

```
slope < 0.5%:   factor = 1.30   (flat — water pools)
0.5–2%:         factor = 1.10   (mild — slow drainage)
2–5%:           factor = 1.00   (good — neutral)
> 5%:           factor = 0.85   (steep — drains fast, dries first)
```

**Research basis:** AASHTO Drainage Manual identifies <0.5% grade as the threshold for ponding risk on asphalt surfaces. Pavement-design standards use 2% as the typical "good drainage" minimum.

**Input:** per-segment slope from the 3D mesh (post Day 5 GeoJSON integration, mesh boundaries are hand-traced authoritative).

#### Factor 2 — Sun exposure (from solar geometry + segment orientation)

```
sun_alignment > 0.7 (full sun):   factor = 0.85   (fast drying)
0.3 ≤ alignment ≤ 0.7:            factor = 0.95   (partial)
< 0.3 (shaded by terrain):        factor = 1.15   (slow drying)

modifier: sun_altitude < 10° (low sun): factor *= 1.10  (low solar energy delivered)
```

**Inputs:**
- Solar azimuth and elevation from `pvlib` (NREL-maintained Python library; free; computes from lat/lon + UTC datetime)
- Per-segment normal vector from the 3D mesh
- Terrain shadowing via ray-trace against the mesh (optional refinement; cheap approximation acceptable for V1)

**Research basis:** TRB pavement-temperature studies show surface heating scales linearly with `cos(solar_zenith_angle) × (1 − albedo)`. Track sections shadowed by terrain features can run 5–10°C cooler than exposed sections on the same circuit, directly slowing drying. Prisma Electronics motorsport guidance: "High levels of bitumen result in a darker asphalt surface and thus greater absorption of solar heat."

#### Factor 3 — Wind exposure (from wind direction + speed + segment orientation)

```
windward + wind > 15 km/h:    factor = 0.85   (fast wind-driven drying)
windward + wind 5–15 km/h:    factor = 0.95
perpendicular or weak wind:   factor = 1.00   (neutral)
leeward (sheltered):          factor = 1.10   (slow drying)
leeward + low overall wind:   factor = 1.15   (very slow)
```

**Inputs:**
- `winddirection_10m` and `windspeed_10m` from Open-Meteo
- Per-segment tangent vector from the 3D mesh
- Angle between wind vector and segment direction

**Research basis:** Penman evaporation equation includes a wind-speed term `f(u) = a + b·u` where evaporation scales roughly linearly with wind above a threshold. iRacing's dynamic water model — the industry reference for sim-accurate spatial drying — uses exactly this kind of per-segment wind/sun/elevation reasoning (Fanatec documentation: "Puddles form and dry based on track elevation, sun exposure, and airflow. Different sections of the track react differently to rain and drying").

### Combined formula

```python
mu_spatial_factor(s) = clamp(
    1.0 / (drainage_factor(s) × sun_factor(s) × wind_factor(s)),
    lower=0.6,
    upper=1.5
)
```

Inversion: factors > 1 mean "wetter section" → we want lower effective μ → divide.

For label = "dry", clamp tighter to [0.9, 1.1] — variance is muted in dry conditions (still some effect from sunny-vs-shaded → different track temp → slight grip variation, but nothing dramatic).

For wet/damp/greasy, the full [0.6, 1.5] range applies — that's where the spatial story matters most.

### Worked example (wet OK_R1 conditions)

```
Baseline:    label=WET, mu_scale_baseline = 0.55
Segment A (sheltered hairpin, shaded, flat):
  drainage = 1.30   sun = 1.15   wind = 1.10
  factor   = 1 / (1.30 × 1.15 × 1.10) = 1 / 1.64 = 0.61 → clamped to 0.60
  mu_segment = mu_data(A) × 0.55 × 0.60 = mu_data × 0.33
Segment B (exposed back straight, sunlit, 3% slope):
  drainage = 1.00   sun = 0.85   wind = 0.85
  factor   = 1 / (1.00 × 0.85 × 0.85) = 1 / 0.72 = 1.38 → keeps 1.38
  mu_segment = mu_data(B) × 0.55 × 1.38 = mu_data × 0.76

Range: 2.3× variation in grip across the track for the same nominal wet conditions.
```

This is the kind of insight the hero 3D viz makes visceral.

---

## 8. Output dataclass schema

```python
@dataclass(frozen=True)
class WeatherCondition:
    # Core scalar output (Section 5/6)
    label: Literal["dry", "damp", "wet", "greasy"]
    mu_scale: float                          # in [0.50, 1.05]
    confidence: float                        # in [0.0, 1.0]

    # Derived diagnostics
    track_temp_estimate_c: float | None
    water_film_estimate: Literal["none", "thin", "thick"] | None
    hours_since_rain: float | None
    days_since_significant_rain: int | None    # for oil-rejection
    drying_rate_estimate: float | None

    # Explainability
    dominant_factor: str         # which rule fired, e.g. "oilrejection" or "precip_1h > 0.5mm"
    rationale: str               # human-readable, 1–3 sentences
    source: Literal["weather", "user", "ml_fallback"]

    # Spatial layer (Section 7); None when only scalar layer ran
    spatial_modifier: Optional["SpatialMuModifier"] = None

    # Debugging
    raw_inputs: dict             # all P1-P10 + D1-D5 + wind direction
    classifier_version: str      # e.g. "weather-v1.0" or "weather-v1.0+spatial-v1.0"


@dataclass(frozen=True)
class SpatialMuModifier:
    arclength_samples: list[float]           # s values along racing line, meters
    factor_values: list[float]                # mu_spatial_factor(s), clamped
    drainage_components: list[float]          # per-segment Factor 1
    sun_components: list[float]               # per-segment Factor 2
    wind_components: list[float]              # per-segment Factor 3
    sun_altitude_deg: float                   # session-time, for sanity
    sun_azimuth_deg: float                    # session-time
    wind_direction_deg: float                 # from Open-Meteo
    wind_speed_kmh: float                     # from Open-Meteo
    mesh_source: Literal["hand_traced", "data_derived", "multihead"]
    spatial_version: str                      # e.g. "spatial-v1.0"
```

The `dominant_factor` + `rationale` are the explainability contract — every classification can answer "why did you call it this?" in plain terms. `raw_inputs` lets future debugging reconstruct the decision deterministically.

### 8.1 Endurance / multi-stint schema extension (V1.x deferred)

V1 ships with `WeatherCondition` modeling one classification per session — appropriate for sprint sessions (15-30 min) where conditions are stable enough to characterize with a single label + mu_scale. Endurance sessions (1-24h, multiple driver stints, conditions can evolve dry → wet → drying) require a different model.

The forward-looking schema extension, planned for V1.x implementation per §11 below:

```python
@dataclass(frozen=True)
class StintCondition:
    # Same fields as WeatherCondition, but scoped to a stint window
    stint_start_utc: str
    stint_end_utc: str
    stint_driver_id: str | None    # if known via metadata or telemetry
    label: Literal["dry", "damp", "wet", "greasy"]
    mu_scale: float
    confidence: float
    dominant_factor: str
    rationale: str
    raw_inputs: dict
    source: Literal["weather", "user", "ml_fallback"]


@dataclass(frozen=True)
class WeatherCondition:
    # ... all V1 fields above remain ...
    # NEW (V1.x):
    is_endurance_session: bool = False
    stint_conditions: list[StintCondition] | None = None
    # When is_endurance_session=False (sprint), stint_conditions=None and the
    # top-level fields describe the whole session.
    # When True, the top-level fields describe the *dominant* condition across
    # the session (computed as time-weighted-by-stint-duration mode of stint labels),
    # and stint_conditions has the per-stint breakdown.
```

The V1 schema is forward-compatible: `is_endurance_session=False` is the default; the optional `stint_conditions` field is `None` by default. Adding stint handling later requires NO migration of V1 data — V1 sessions all read as sprints, which is correct.

V1 implementation note: Day 11 ships without the `is_endurance_session` and `stint_conditions` fields. They get added in V1.x at the same time the segmentation logic is implemented. The schema documented here is the migration target, not the V1 reality.

---

## 9. Caching

Weather data is historical → infinite TTL. Cache aggressively.

```
Path: data/cache/weather/{key}.json

Cache keys:
  (round(lat, 2), round(lon, 2), date.isoformat())            — hourly 48h
  (round(lat, 2), round(lon, 2), date.isoformat(), "daily30") — daily 30-day archive for D5

File format: JSON
Write strategy: atomic (write to .tmp, rename)
Lifecycle: never expire (historical weather doesn't change)
```

Same (track, date) used across re-analyses of the same session = zero API calls after first run.

---

## 10. Research grounding (cite in docstrings)

1. **Pacejka tire model** — Hans B. Pacejka, *Tire and Vehicle Dynamics* (3rd ed., Butterworth-Heinemann). Standard motorsport tire-friction reference; temperature-dependent friction formulation.
2. **Race Car Vehicle Dynamics** — Milliken & Milliken (SAE). Empirical race-car tire-grip data.
3. **PIARC International Friction Index** — water-film-thickness vs friction coefficient tables for asphalt.
4. **AASHTO Guide for Pavement Design** — skid-resistance reference tables and drainage standards.
5. **AASHTO Drainage Manual** — slope thresholds for ponding/drainage (Factor 1 grounding).
6. **ASTM E274** (locked-wheel skid resistance) and **E1859** (tire-pavement friction) — measurement standards.
7. **FIA F1 Technical Regulations** — public document with formal wet/damp/dry condition definitions.
8. **TRB (Transportation Research Board)** — peer-reviewed papers on predicting pavement surface temperature from ambient weather; the linear-with-solar-correction formulation in D1.
9. **Penman 1948** — atmospheric science standard for evaporation rate; basis for D4 and Factor 3 wind dependency.
10. **Eisenberg 2003** — *Engineering Effects of Wet Roads on Fatal Crash Risk: A Quantitative Examination of California Crash Data, 1995–1997*, UC Berkeley / *American Journal of Public Health*. Quantifies the oil-rejection effect: 3.7% fatal-accident increase 2 days after dry-spell rain, scaling with dry-spell duration. The empirical basis for Rule 5b.
11. **Bridgestone motorsport guidance** (Hamashima interview, F1Technical.net): freshly-laid asphalt has oils rising to surface; rain emulsifies them.
12. **Pirelli motorsport press** (Mexico City 2015): "very shiny new top layer of oil and grease that makes it very hard to find traction."
13. **iRacing dynamic water model** (industry reference for sim spatial accuracy; documented in Fanatec sim-racing guidance): "Puddles form and dry based on track elevation, sun exposure, and airflow."
14. **pvlib** (NREL-maintained Python library) — solar geometry calculations for Factor 2.
15. **Goodyear / Greg Stucker, "How Tracks Take and Lose Rubber"** — context on track evolution and rubber lay-down (V2 work, but informs the eventual ICEBOX direction).

---

## 11. Out of scope for V1 (logged for V1.5 / V2)

These are real physical effects we've identified and chosen not to model in V1. Documented here so they're not re-discovered as gaps later.

### V1.5

- **Endurance / stint segmentation** — V1's `WeatherCondition` represents one classification per session, appropriate for sprint sessions (15-30 min). Endurance sessions (1-24h, multi-stint, conditions evolving dry → wet → drying) require per-stint classification. The forward-looking schema (`is_endurance_session`, `stint_conditions: list[StintCondition]`) is documented in §8.1. Implementation needs three pieces: (a) stint boundary detection from telemetry (driver-change events if present in metadata, else GPS-gaps > 5min, else 30-min fixed windows), (b) per-stint classifier invocation reusing the existing rule engine on weather slice for that stint, (c) session-level summary as time-weighted-by-duration mode of stint labels. MKR endurance sessions are the first real use case. Estimated effort: 6-10h once V1 calibration loop ships.
- **Driver feedback calibration loop** — UI prompt "weather said X, you felt Y" → fit thresholds to driver-reported truth. Will tighten Section 5 rule boundaries over 20–50 sessions.
- **Sun adjacent-terrain shadowing** — V1 Factor 2 ships a per-tile 2D sun field driven by surface normals from `elevation_surface` (Day-13 Phase D), capturing banking-induced angle-of-incidence variation. It does NOT capture occlusion from treelines, grandstands, buildings, or other adjacent terrain — the bigger real-world shadowing effect. V1.5 requires an OSM/photogrammetry pipeline to ingest external terrain geometry + a ray-cast against that mesh for proper occlusion. Separate data unblocker from the banking 2D path.
- **Wind adjacent-terrain shielding** — V1 Factor 3 ships a per-tile 2D wind field where banking-induced surface normal alignment modulates the 1D wind components. It does NOT capture diffraction past treelines, building edges, or grandstand walls — wind around obstacles isn't directly captured. V1.5 requires the same external-terrain data pipeline as sun shadowing, plus a wind diffraction model on top. V1.5 minimum.
- **Per-track polygon editor UI** — surface gt_*.geojson hand-edits to drivers when aerial auto-detection ships in V1.5.
- **Frontend lint cleanup (post-Day-13 upgrade)** — `next lint` was previously truncating output at ~25 issues, masking ~100+ pre-existing errors that surface with `--quiet`. Estimated 4–6h mechanical-but-careful work. Rule categories: `@typescript-eslint/no-explicit-any` (bulk — endurance/, race-strategy/, sessions/upload routes — type these properly); `prefer-const` (3+ chart files — `let X` → `const X`); `react-hooks/rules-of-hooks` (LapByLapPanel.tsx — useMemo called conditionally); `react/no-unescaped-entities` (coach-sections-showcase — escape `"` as `&quot;`); `@next/next/no-html-link-for-pages` (Lap3DConcept, Lap3DConceptV2 — `<a href="/">` → `<Link>`); plus the deferred 14 stylistic warnings (`react/no-array-index-key` × 9 in Skeleton/SkeletonTable/RadioCard/FaqAccordion/ChartTooltip/SuccessPage, `@next/next/no-img-element` × 5 in Avatar/ScreenshotGallery/SuccessPage). Lint script intentionally left at bare `next lint` (no `--max-warnings`, no `--quiet`) — preserves pre-upgrade behavior. Separate PR; no behavioral change.
- **Visual regression snapshot storage** — `npm run test:visual` generates 11 chromium-win32 PNG baselines (~2.8 MB) at `e2e/visual-regression.spec.ts-snapshots/`. Root `.gitignore:74: *.png` blocks commit. Visual regression is therefore effectively disabled in CI without an artifact store. Decide: (a) Playwright Cloud / similar managed visual diff service; (b) S3/GCS bucket + CI plumbing to upload/diff; (c) `.gitignore` exception for `e2e/**/__snapshots__/**` + `*-snapshots/**`. Baselines regenerate cleanly on Next 15.5.10; ready to commit once storage decision lands.
- **E2E auth + API fixtures** — `npm run test:e2e` runs 330 Playwright tests; 87 pass (route reachability + middleware + cookie behavior), 162 fail because they assume a logged-in user against a real backend. `NEXT_PUBLIC_API_URL=https://api.lap-coach.racing` + no JWT in test env → 401s and empty-state renders. Failures are not Next 15 upgrade regressions. Needs (a) seeded test users in a staging backend, (b) Playwright fixtures that mock auth + key API endpoints (the existing `e2e/helpers/api-mocks.ts` is a starting point but not wired into the global setup), or (c) explicit "spec needs backend" annotation per test so the suite can skip them locally and require them only in CI with a fixture environment.

### V2

- **ML conditions classifier as refinement layer** — telemetry feature signals (rolling-window grip consistency, lap-time variance) flag weather-vs-actual divergence; retains usefulness without being the primary classifier.
- **Track evolution / rubber lay-down** — F1Technical, Goodyear, Bridgestone all describe this. Requires session-history per circuit. Outputs a slow-varying baseline-grip multiplier on top of the weather model.
- **Racing-line vs off-line spatial** — marbles, rubber pellets off the racing line; off-line is treacherous after dry running. Requires intra-session GPS clustering against the racing-line corridor.
- **Per-track asphalt metadata** — color, aggregate type, age, resurfacing date. Affects baseline μ and heat absorption rate. Track-database extension.
- **Atmospheric pressure** — minor engine-power and tire-pressure effects. Negligible vs grip factors. Skipped.
- **Track-surface thermometer integration** — 30€ hardware option to ground-truth D1's track-temperature estimate. V2 hardware partnership candidate.
- **Concrete vs asphalt** — Goodyear notes concrete doesn't accept rubber. Different baseline μ. Track-specific metadata.

### Removed (claim falsified or replaced)

- Cold-start degeneracy fix on existing ML classifier — replaced wholesale by weather-based engine.
- Single-scalar μ output — replaced by scalar + spatial.

---

## 12. Verification gates

The engine ships only when:

### Scalar layer
- 7 synthetic isolation tests pass (dry, wet, damp, greasy variants, dew, oil-rejection, mu_scale ladder)
- ≥ 2 of 3 real-session tests pass (KCT dry, OK_R1 wet, OK_R4 greasy)
- Regression suite shows zero new failures
- KCT (no user metadata) → mu_scale > 0.95
- OK_R1 (no user metadata) → mu_scale < 0.80
- OK_R4 (user metadata "greasy") → user wins, mu_scale ≈ 0.83 (Rule 5b lookup if dry-spell preceded)

### Spatial layer
- Synthetic mesh test: known-geometry mesh + known sun/wind → expected per-segment factors within tolerance
- Real mesh test: OK 3D mesh + Open-Meteo wind for an OK_R1-style wet day → factors vary across track in a way consistent with mesh elevation and wind direction
- Spatial range on wet OK_R1: at least 2× variation in `mu_spatial_factor(s)` across the racing line (the visceral grip-map differentiator)
- OCP integration: when threaded through `mu_long(v, s)`, the optimal line shifts toward predicted-drier sections vs the spatial-uniform baseline

### Empirical sanity (post-integration)
- 3D map's spatial grip color mode renders cleanly on OK + KCT
- Coaching engine can reference "Corner 4 is shaded + leeward → predicted slower" in human-readable form
- No NaN or negative μ values produced anywhere in the pipeline

---

*End of conditions engine specification.*
