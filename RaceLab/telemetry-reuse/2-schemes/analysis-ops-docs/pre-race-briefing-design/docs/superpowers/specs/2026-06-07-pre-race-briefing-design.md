# Race Brief — Pre-Race Briefing + 2D Racing-Line Optimizer — Design Spec

> **Status:** approved by user 2026-06-07 (Approach 1: in-place extension with a research gate; one delivery, optimizer first).
> **Name:** "Race Brief" (nav label; internal identifier `briefing`). User may rename before FE work lands.

**Goal:** Before a race, a driver opens Race Brief for a track, enters when the session is and its type, and gets: the weather forecast for that window, what it changes about their driving inputs, the track-surface story from prior sessions, **two predicted racing lines** (dry-optimal and wet that avoids low-grip zones/puddles) computed by a true 2D grip-aware minimum-time optimizer, and personalized "what to work on" advice from their recent sessions at that track.

---

## 1. Decisions (locked with user)

| Question | Decision |
|---|---|
| Audience | **Real-world first** (karting/track days, GPS datalogger). Sim later. |
| Intake | Track + **race date/time** ("race o'clock" → forecast window) + **session type** (race / training / endurance). |
| Line predictor depth | **Full 2D optimizer**: `mu(s,n)` inside the CasADi NLP so the line routes around lateral low-grip cells. Not per-corner shifts, not 1D-grip-only. |
| Sequencing | **One delivery, optimizer first.** The briefing ships consuming the validated 2D optimizer; no interim-line release. |
| Data gate | **3-tier**: (1) personal sessions at track → full briefing; (2) community surface ≥k distinct contributors → community briefing, no personal advice; (3) nothing → weather-only preview + upload prompt. Tier 2 stays dark until WS4-A/C (contributor table + k-anon) land. |
| Advice generation | **Deterministic v1** (rule tables + revived driver_focus). No LLM in v1. |
| Architecture | **Approach 1 — in-place extension**: solver + artifacts + endpoint in `lap_web/telemetry_tool`, page in `lap_web/lap-website`. NLP runs only in Celery workers, never in-request. |

## 2. Current state (verified by 6-agent codebase map, 2026-06-07)

Already built (cited evidence in the map; key anchors):

- **Dormant pre-session briefing**: `track_surface/pre_session.py:84` `generate_pre_session_briefing()` → condition alerts, per-corner `wet_line_shifts`, compression/puddle warnings, `driver_focus`, reference pace. Served at `GET /api/v1/tracks/{id}/pre-session` (`data_v2.py:5397`) — **no FE consumer; `condition` is a manual param; route never passes `driver_history` so driver_focus is dead in prod**.
- **Min-time OCP solver**: `lap_oracle/solver/ocp.py:47` (spatial formulation, V/N_lat/Ax decision vars, friction ellipse with per-distance grip, track-boundary bounds, periodic BCs, IPOPT; QSS fallback). **`casadi` not in requirements.txt → `/optimal-line` returns `available:false` in prod.** Uses only the 1D centerline grip slice (`solver_bridge.py:60-78`).
- **Wet model**: `wet_model.py:80` `invert_grip_for_wet` (rubber line slick when wet), `:106` `compute_wet_line_shifts`, drainage puddle zones (`pre_session.py:153-166`).
- **2D grip**: `grip_2d.py` `GripSurface` `mu_grid (M,K)` on Frenet `(s,n)` @5 m × 1 m over ±8 m, `count_grid`, bilinear `mu_at`, ≥10 laps; Parquet sidecars keyed `track/vehicle_class/condition`. Frenet projection `frenet.py:142` `xy_to_sn`.
- **Boundaries**: hand-traced gt geojson → Frenet, else data-derived; `width_left/right` consumed by the OCP bounds.
- **Weather**: `meteo_service.py` `get_weather_forecast(lat, lon, hours)` (Open-Meteo, currently 48 h max); `tracks.start_lat/lon` + `predefined_track_coords` geocode cache; condition classifier `classifier.py` (P/D rules → dry/damp/wet/greasy + μ-scale ladders).
- **Session metadata**: `sessions.session_type` ∈ {practice, qualifying, race, test, endurance, heat, final} validated at upload (`sessions_v2.py:475`); `tracks.dry_ref_session_id`/`wet_ref_session_id` auto-set per condition.
- **FE plug-in point**: `TrackSurface3D.tsx` 4-tier mesh cascade, `makeColorBuffer`, `buildLineGeometry`(:1139) + `Line2` overlays already render optimal (gold, behind `SHOW_OPTIMAL_LINE=false`) and driven lines; `FeatureGate`/`FEATURE_MAP` entitlements; React Query + `apiFetch`.

Known defects this feature depends on fixing:

- **Condition-label bug (WS4-B in the crowd plan)**: grip upserts hardcode `condition='dry'` (`orchestrator.py:889/:966`) because `classify_conditions` runs later (~`:1265`) — the wet/damp partition never accumulates real data. Also reconcile `heavy_wet → wet`.
- **Dead `driver_history` param**: `data_v2.py:5446` never passes it → personalized advice silently empty.
- Alembic: prod head = **060**; 056–058 orphaned. **New migrations chain off 060.**

## 3. Architecture — four lanes, built in order

```
Lane 1  ocp_2d solver + validation harness    telemetry_tool/lap_oracle/solver/
Lane 2  line artifacts + pipeline wiring      telemetry_tool (celery task, migration 061+)
Lane 3  briefing endpoint + advice rules      telemetry_tool/track_surface + web/routes
Lane 4  Race Brief page                       lap-website /app/tracks/[id]/briefing
```

The solver never runs in a web request: Celery computes per `(track, vehicle_class, condition)` and persists artifacts; the endpoint assembles reads. Everything is branch-only until post-launch; deploys diff-confirmed (live launch-path repo).

## 4. Lane 1 — `ocp_2d.py` (the research gate)

Extension of the existing spatial min-time formulation:

- **2D grip in the NLP**: `mu = casadi.interpolant('mu', 'linear', [s_grid, n_grid], mu_flat)`; friction-ellipse limits evaluated at `(s_i, N_lat_i)` so grip depends on the chosen line. Effective curvature `kappa/(1 − n·kappa)` as today.
- **Confidence shrinkage** (guards the classic sparse-data failure): per-cell `mu_used = w·mu_cell + (1−w)·mu_1d(s)` with `w = confidence` from `count_grid`; unmeasured cells get a pessimistic prior slightly below the 1D profile so the optimizer cannot exploit noise or undriven asphalt.
- **Wet field**: `mu_wet(s,n) = invert_grip_for_wet(mu_dry(s,n))`, puddle cells from the drainage model clamped to μ≈0.2. Same solver, different field.
- **Warm start** from the existing QSS/1D solution; IPOPT iteration + wall-time caps; deterministic options (fixed seeds/orderings).
- **Output contract unchanged** from `/optimal-line`: `{points: [{distance_m, lateral_offset_m, speed_mps}], condition, solver_meta}`.

**Validation gates — all must pass on real data before Lane 2 consumes the solver:**

1. Determinism: identical inputs → identical line (hash-stable).
2. Dry plausibility: median |lateral deviation| vs fast drivers' driven lines ≤ ~0.5 m on gold-tier tracks (KCT-class data).
3. Wet correctness: integrated μ along the wet line under the wet field strictly exceeds the dry line's; **zero puddle-cell crossings**.
4. Lap-time sanity: predicted dry lap within ~3% of best real lap.
5. Robustness: ≥95% solve rate across all tracks with ≥10 laps; <60 s/solve on VPS-class hardware.

Thresholds are initial; the harness reports actuals and the gate values get reviewed against the first run rather than tuned blind.

## 5. Lane 2 — artifacts + wiring

- **Migration 061 (chains off 060)**: `track_racing_lines` — global/RLS-free (derives from aggregate grip; k-anon applies at read, like `track_surfaces_global`). Key `uq_track_racing_line (track_id, vehicle_class, condition, line_kind)`; columns: `points` JSONB (`[{d, n, v}]`), `solver_version`, `grip_snapshot_hash`, `n_laps_used`, `status` (`ok|failed|pending`), `computed_at`.
- **Celery task `compute_racing_lines(track_id, vehicle_class)`**: triggered debounced post-pipeline when a session changes a track's grip, plus a nightly beat; no-op when `grip_snapshot_hash` unchanged; writes `failed` status with reason on solver failure (briefing degrades, never errors).
- **Condition-label fix (prerequisite)**: move/defer grip upserts until after `classify_conditions`; map `heavy_wet→wet`. Behavior-changing for the live pipeline → own branch + own diff-confirmed deploy.
- **Dependencies**: `casadi` (bundles IPOPT) added to the **worker** requirements/image only.

## 6. Lane 3 — briefing endpoint

`GET /api/v1/tracks/{track_id}/briefing?race_at=<ISO8601>&session_type=race|training|endurance`

1. **Forecast**: lat/lon from `tracks.start_lat/lon`, fallback `predefined_track_coords`; `meteo_service` extended from 48 h to Open-Meteo's 16-day horizon, windowed on `race_at` (endurance widens to event duration). Predicted condition = precip probability/amount through the existing classifier thresholds → dry/damp/wet verdict + confidence.
2. **3-tier gate**: personal sessions at track (RLS-scoped query) → full · else community surface with ≥`GLOBAL_GRIP_K_MIN` distinct contributors → community briefing (dark until WS4-A/C; fail closed; 404 semantics, no track-existence leak) · else → weather-only + upload prompt.
3. **Response blocks**: `weather` (hourly strip for the window) · `condition_verdict` · `surface` (quality tier, n_laps, grip evolution from `track_surface_snapshots`) · `lines` (dry + wet from `track_racing_lines`, incl. per-line `speed_mps` profile and provenance: n_laps_used, computed_at, "modeled from dry sessions" flag when wet grip is inverted-dry) · `advice` · `reference_pace` (existing wet factors).
4. **Advice (deterministic)**:
   - Weather→inputs rule table: `(precip_prob, rain_mm, temp_c, wind)` × corner class → input advice strings (braking distance, throttle application, apex shift pointer to the wet line, cold-tire/visibility notes). Rule table lives in code with exhaustive table tests.
   - **driver_focus revived**: pass `driver_history` (recent sessions at this track) → aggregate line-delta corner losses → top-3 focus corners with suggestions.
   - `session_type` selects template families: race → consistency/pace + overtaking-zone notes; training → drills (existing coaching engine templates); endurance → stint pacing + weather windows across the event.

No persisted briefing artifact in v1 (computed on demand; forecast cached short-TTL). YAGNI until there's a reason to store briefings.

## 7. Lane 4 — frontend

- Route `/app/tracks/[id]/briefing` in `lap_web/lap-website`; entry point from the existing per-track page.
- Intake: race datetime picker + session-type select (and vehicle class if ambiguous for the track).
- View: weather strip → condition verdict → **TrackSurface3D with both lines** (existing `buildLineGeometry`/`Line2`; gold = dry, blue = wet) → advice cards → focus corners → reference pace. Tier-2/3 states render the reduced briefing with clear provenance labels.
- `briefing` key added to `FEATURE_MAP` (single-membership tier per the June-8 pricing model).
- One-shot entrance animation only; no ambient motion (standing rule for LAP surfaces).
- Mobile: **out of scope v1** (mobile apps target the frozen lap-backend).

## 8. Error handling

| Failure | Behavior |
|---|---|
| Solver failed/timed out for a partition | Artifact `status=failed`; briefing falls back to best driven line labeled "optimized line pending" — never a 500. |
| Forecast API down | Last-cached weather + stale marker; briefing still renders. |
| `race_at` > 16 days out | "Forecast opens at D-16" notice; rest of the briefing unaffected. |
| No wet grip data yet (cold start; condition bug means all prod data is 'dry' today) | Wet line computed from the inverted-dry field (the wet model's core assumption) and labeled "modeled from dry sessions". |
| Track below data threshold (<10 laps or no boundaries) | Surface+weather briefing + explainer of what unlocks lines. |
| Community data below k | Tier-3 behavior (404 semantics on community reads). |
| Track missing lat/lon and not geocodable | Briefing renders without weather block + prompt to set track location. |

## 9. Testing

- **Solver**: unit (interpolant correctness, constraint construction, shrinkage math) · property (determinism, μ↑→speed↑ monotonicity on synthetic fields) · the §4 validation harness as a permanent regression suite on real gold-tier data · convergence matrix across all eligible tracks.
- **Backend**: rule-table tests (every weather rule row) · gate-tier tests with RLS-aware fixtures (portable-PG pattern, no Docker) · forecast client mocked (horizon, windowing, cache) · endpoint contract tests incl. all degraded modes in §8 · migration up/down on scratch DB.
- **FE**: component tests with mocked briefing payloads · Playwright pass using the established local-run recipe (`next dev`, bypassCSP, same-origin API mock).
- TDD throughout (tests written first per task at implementation time).

## 10. Dependencies & sequencing

```
condition-label fix (WS4-B)  ──►  real wet grip starts accumulating          [own deploy]
ocp_2d + harness  ──►  validation gates pass  ──►  Lane 2 artifacts
                                                       └──►  Lane 3 endpoint  ──►  Lane 4 page
WS4-A/C (contributor table + k-anon)  ──►  lights up tier 2                  [separate planned work]
```

- Launch 2026-06-08: nothing deploys before it; afterwards every deploy that touches the live pipeline is diff-confirmed.
- The condition-label fix is the only piece that changes existing prod behavior; it ships first and alone.
- Tier 2 (community briefing) has a hard dependency on the crowd plan's WS4-A/C; Race Brief v1 ships with tiers 1 and 3 active and tier 2 behind the k-anon gate.

## 11. Out of scope (v1)

Sim sessions · LLM-composed advice · mobile parity · persisted briefing history · per-driver (vs per-workspace) k-anon identity · cross-track generalization of grip (each track's lines come only from that track's data) · live-timing/raceday updates after the briefing is generated.
