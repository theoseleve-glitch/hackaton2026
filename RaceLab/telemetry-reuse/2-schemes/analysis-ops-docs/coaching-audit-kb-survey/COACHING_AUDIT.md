# LAP — Coaching Audit (V2_claude_ai)

Empirical audit of every coaching-output module in `V2_claude_ai`. Generated 2026-05-11 via single deep-audit agent run. READ-ONLY — no code changes.

**Verdict (top):** Coaching for V1 ships as a **HYBRID of three already-PRODUCTION engines**, not the spec'd "per-bin gain table" rewrite. The spec is redundant — the work is done, three times over. Reconciliation work = **3–5 days** (mostly pruning dead/orphan code).

The spec was: "per-bin gain table with Brake/Carry/Line/Throttle tags". The literal output of `kart_envelope.coaching.cause_ranking.generate_coaching_text` is already:

> Total time loss in top 3 areas: 316 ms
> 1. Corner 1: 152 ms (late braking)
>    -> Brake earlier — losing time.
> 2. Corner 3: 98 ms (low apex speed)
> 3. Corner 5: 66 ms (slow exit)

— and this is in production for karts today.

---

## 1. Module inventory

| Module | Path | LOC | Output type | Maturity | Tests |
|---|---|---:|---|---|---|
| `prescriptive` engine | `telemetry_tool/track_surface/prescriptive/engine.py` (+ types/registry/patterns/adapters/serialization/_internal) | 416 (engine) | Typed `CoachingSheet` DTO: global_focus + **per-corner CornerCoaching with time_delta_ms + phase + summary** + playbook_matches + next_run_plan + validation_checks + storyline + limits | **PROD** — live in `lap_web/web/routes/coaching.py` `POST /api/v1/coaching/prescriptive`; called by `scripts/build_ok_raw.py` for canned OK fixtures | 4 dedicated (engine, domain, patterns, route) |
| `prescriptive_coaching.py` (legacy) | `telemetry_tool/track_surface/prescriptive_coaching.py` | 595 | Same shape as above (dict-form precursor) | **DEPRECATED** — docstring: "superseded by track_surface.prescriptive package", "one-cycle rollback safety, delete after prod soak" | parity-anchor test only |
| `coaching_library.py` (registry) | `telemetry_tool/track_surface/coaching_library.py` | 2,453 | Pattern-registry data: weakness/strength patterns with `RealLifeCoaching`, `SimCoaching`, `SetupHints`, `StrategyFlags`. Library v2.0.0; pure data + validation | **WIP-ORPHAN** — used by `driver_development.py`, `prescriptive_coaching.py` (legacy), `coaching_intelligence.py`; the NEW `prescriptive` engine uses its OWN `patterns.py` registry, not this file | `test_coaching_library.py`, `test_coaching_ontology_migration.py` |
| `coaching_intelligence.py` | `telemetry_tool/track_surface/coaching_intelligence.py` | 546 | Lap-level "intervention classes" (entry/brake_release/apex/exit phases). Imports `coaching_library` | **WIP** — present, tested, **NOT wired into pipeline orchestrator** | `test_coaching_intelligence.py` |
| `driver_development.py` | `telemetry_tool/track_surface/driver_development.py` | 676 | Session-level behavior pattern detection. Imports `coaching_library` | **WIP** — present, tested, **NOT wired into orchestrator** | `test_driver_development.py` |
| `debrief_engine.py` | `telemetry_tool/debrief_engine.py` | 1,080 | `summarize_session` dict (summary_sentence, phases_summary, pace_trend), `classify_mistakes` per-segment (dominant_cause + confidence + coaching_hint), `generate_next_session_drills` list[str] | **PROTOTYPE** — imported ONLY by `test_debrief_engine.py`; not wired anywhere in pipeline/web/scripts/kart_envelope | `test_debrief_engine.py` only |
| `tire_degradation.py` | `telemetry_tool/tire_degradation.py` | 980 | f-string coaching hints in `analyze_tire_degradation()` (cliff detection, deg-rate advice, optimal-stint suggestion) | **PROTOTYPE** — imported only by own tests | own tests |
| `driver_fitness.py` | `telemetry_tool/driver_fitness.py` | 983 | f-string coaching strings in `generate_fitness_report()` (pace fade %, concentration drops, recovery rate, fitness band text) | **PROTOTYPE** — imported only by own tests | own tests |
| `kart_envelope/coaching/corner_coaching.py` | `kart_envelope/coaching/corner_coaching.py` | 562 | `CornerPerformance` per corner: time_loss_entry_s, _apex_s, _exit_s, brake_delta_m, **primary_cause** ∈ {early_braking, late_braking, low_apex_speed, slow_exit}, coaching_hint text | **PROD** — called from `kart_envelope/pipeline.py` step 16/17; `corner_coaching` dict ships through `lap_web/web/routes/data_v2.py` to live frontend | `test_corner_coaching.py`, `test_corner_coaching_aggregate.py`, `kart_envelope/tests/test_coaching.py` |
| `kart_envelope/coaching/cause_ranking.py` | `kart_envelope/coaching/cause_ranking.py` | 419 | `TimeLossCause` ranking (per-corner cause + time_loss_ms + coaching_hint), `SectorAnalysis`, **`generate_coaching_text()`** → multi-line human summary | **PROD** — pipeline step 17 calls `generate_coaching_text(causes, scalars)` → stores `ctx["coaching_text"]`; consumed live | `kart_envelope/tests/test_coaching.py` |
| `kart_envelope/coaching/driver_diagnostics.py` | `kart_envelope/coaching/driver_diagnostics.py` | 1,405 | Dynamics-ML findings narrative (appended to coaching_text in pipeline) | **WIP/PROD** — wired via `kart_envelope/pipeline.py:884` when enabled | `test_driver_diagnostics.py` |
| `telemetry_tool/coaching/` package (v3) | `telemetry_tool/coaching/{analyzers,composers,templates,taxonomy}/` | ~5,700 total | Layered: 6 physics analyzers (trail_brake, exit_speed, traction_budget, throttle_lift, weight_transfer, symptom_detector) → composers (corner_composer, session_composer, focus_limiter, progressive_coach, confidence_framer) → templates (**CORNER_TIPS 156 entries** indexed by (cause, severity, vehicle_class); **DRILL_LIBRARY 20 drills** with beginner/intermediate/advanced steps) | **PROD** — wired into orchestrator at `pipeline/orchestrator.py:1311-1356` as stages 13e/13f/13g/13g2; feature-flag `COACHING_V3` defaults ON; output persisted under `summary["coaching_v3"]["corner_coaching"]` | 7 dedicated under `telemetry_tool/tests/coaching/` |
| `track_surface/coaching.py` | `telemetry_tool/track_surface/coaching.py` | 119 | Thin compat shim (legacy adapter) | LEGACY | n/a |
| 67 YAML rules + rule_loader (lap-backend) | `lap-backend/coaching/library/rules/**/*.yaml` (9 categories: adaptation, braking, consistency, cornering, endurance, preparation, strategy, throttle, tire_fuel) + `rule_loader.py`/`rule_runner.py`/`rule_schema.py`/`condition_compiler.py`/`bundle.py`/`compiler.py` | 67 rules | `rule_runner` → `CoachingInsight(rule_id, rule_version, category, subcategory, difficulty, explanation)` with mustache-rendered strings | **WIP-DDD** — wired into FastAPI lap-backend routers (`app/routers/{coaching,admin}.py`); persistence via `infra/coaching_insight_persistence.py`, `prescription_generator.py`, `weakness_episode_opener.py`. **NOT present in V2_claude_ai or lap_web at all** | adaptation_rules_library, admin_rules_health, dozens of catalog/episode tests |

---

## 2. Smoke test results

### `kart_envelope/coaching/cause_ranking.py::generate_coaching_text`
- **Import:** PASS (clean)
- **Smoke:** built 3 `TimeLossCause(corner_id, cause, time_loss_ms, coaching_hint)`, called `generate_coaching_text(causes, max_items=3)` → multi-line str
- **Sample output (verbatim):**
  > Total time loss in top 3 areas: 316 ms
  > 1. Corner 1: 152 ms (late braking)
  >    -> Brake earlier — losing time.
  > 2. Corner 3: 98 ms (low apex speed)
  > 3. Corner 5: 66 ms (slow exit)
  > Pattern summary:
  >   late braking: 1 corners, 152 ms total

### `track_surface/prescriptive/engine.py::generate_coaching_sheet`
- **Import:** PASS
- **Smoke:** 2 corner_packets + 1 weakness (`behavior_id='late_braking'`) → `CoachingSheet(version='1.0', corner_coaching=2 items, storyline=2 items)`. Registry has 5 built-in patterns: `low_minimum_speed`, `early_braking`, `late_throttle_pickup`, `weak_exit_build`, `line_deviation` — note `late_braking` is NOT registered (only `early_braking`), so weakness surfaces as `unregistered_weakness` storyline. Per-corner output present with signed `time_delta_ms`.
- **Sample output:**
  > STORYLINE[data_warning]: "Only 1 session(s) analyzed. Trend and portability claims need 3+ sessions to be reliable."
  > STORYLINE[unregistered_weakness]: "Upstream reported weakness 'late_braking' but no coaching playbook is registered for it"
  > CORNER 1: time_delta=+250 ms, summary="T1: +250 ms. No matched playbook."
  > CORNER 3: time_delta=+120 ms, summary="T3: +120 ms. No matched playbook."

### `telemetry_tool/debrief_engine.py::summarize_session + generate_next_session_drills`
- **Import:** PASS (4 public callables: summarize_session, top_time_loss_segments, classify_mistakes, generate_next_session_drills)
- **Smoke (summarize):** 5-lap mock `lap_metrics_df` → dict with keys `[summary_sentence, phases_summary, best_lap, median_lap_time_s, pace_trend, n_laps]`. Output is structured numeric — no rich narrative text.
- **Smoke (drills):** 3-mistake mock with columns `[lap_number, segment, dominant_cause, confidence, time_loss_s]` → `list[str]` of one-line drills.
- **Sample output (verbatim):**
  > ['Segment T1: review this section for late braking.',
  >  'Segment T3: review this section for low apex speed.',
  >  'Segment T5: review this section for slow exit.']
- **Note:** drills are TRIVIAL templates ("review this section for X") — not progressive, not per-cause-tailored. **Stub-quality.**

### `telemetry_tool/coaching/composers/corner_composer.py::compose_corner_coaching`
- **Import:** PASS
- **Signature:** `(corner_perf, trail_brake, traction, exit_cascade, symptoms, throttle_lifts, weight_transfer, taxonomy, vehicle_class, driver_history=None) → CornerCoachingDetail`. Needs upstream physics-analyzer outputs; cold-call not attempted.
- **Wired live** via `pipeline/orchestrator.py:1311` (stages 13e/g) feeding `summary["coaching_v3"]`.

### `telemetry_tool/coaching/templates/corner_tips.py::CORNER_TIPS`
- **Import:** PASS. dict, **156 entries** keyed by `(cause_id, severity_band, vehicle_class)`.
- **Sample key+value:**
  > KEY = ('early_braking_confidence', 'mild', 'kart')
  > VALUE.tip = "At {corner_name} you are braking {delta_m}m earlier than the reference. Trust the grip — the kart will stop in time. Eyes up to the turn-in point and let the braking marker come to you."
  > progressive_steps = [
  >   "Move your braking point {step1_m}m later on the next three laps and hold it there.",
  >   "Once comfortable, move another {step2_m}m later while keeping the same pedal pressure.",
  >   "Target the reference point at {target_delta_m}m and focus on feeling the front tyres load up."
  > ]
  > symptom_check = "Brake trace starts {delta_m}m before reference with similar peak pressure."

### `telemetry_tool/coaching/templates/drills.py::DRILL_LIBRARY`
- **Import:** PASS. **20 drills** keyed by drill_id (e.g. `brake_point_consistency`, `trail_brake_introduction`, `throttle_progression`).
- Each has `applicable_causes`, `difficulty_levels: {beginner, intermediate, advanced}` with description + success_criteria.

### `telemetry_tool/coaching/taxonomy/causes.json`
- Loaded as JSON: `version: 1`, **10 categories**, each cause has `{symptom, diagnosis, root_cause, severity_thresholds: {mild/moderate/severe}, unit}`. Examples: `early_braking_confidence` (mild=5.0m, severe=20.0m), `late_braking_aggressive`, `insufficient_brake_pressure`, `no_trail_braking`, `abrupt_brake_release`. **~30+ causes total.**

### `telemetry_tool/tire_degradation.py` coaching strings (verbatim grep)
- `f"At {degradation_rate:.3f} s/lap degradation, the tire will lose >{acceptable_loss_s:.1f}s after ~{laps_from_deg} laps."`
- `f"Stint {s['stint_index']+1}: tire cliff detected at lap {s['cliff_lap']} ({s['cliff_severity_s']:.1f}s drop). Consider pitting before this point."`
- `f"High degradation rate ({deg_rate:.3f} s/lap). Focus on smoother inputs and reducing tire abuse through slides and lock-ups."`
- `f"Optimal stint length is ~{opt} laps, but your longest stint was {longest_stint} laps. Consider an earlier pit."`

### `telemetry_tool/driver_fitness.py` coaching strings (verbatim grep)
- `f"Pace faded {pace_fade_pct:.1f}% from Q1 to Q4."`
- `f"Fatigue onset detected at lap {fatigue_onset_lap}."`
- `f"{n_drops} concentration drop(s) detected."`
- `f"Average recovery takes {avg_recovery:.1f} laps."`
- `f"Overall fitness score: {overall:.0f}/100 — race-ready condition." / "solid, with room for improvement." / "targeted training recommended."`

### YAML rule samples (parsed via `yaml.safe_load`)
- **`braking/early_braking_entry_speed_loss.yaml`** — `id=br.early_braking.entry_speed_loss`, category=technique/early_braking, `detection.condition = entry_speed < reference_entry_speed * 0.93`, severity_rule="linear, 0.93=low/0.88=med/0.82=high", explanation_template has beginner/intermediate/advanced strings with `{{corner}}` and `{{delta_kmh}}` placeholders, `prescription.drill_template_id = drill.late_brake_marker_progression`, `expected_gain_kmh = "2-4"`, success_condition.metric=`entry_speed`, transfer_profile.sim_vs_real.likely_transfers=true.
- **`cornering/apex_miss_late_turn.yaml`** — `id=cs.apex_miss.late_turn`, `detection.condition = turn_in_distance_m_after_optimal >= 5.0 and apex_position_pct_through_corner >= 0.60`, severity="linear, 5m=low/8m=med/12m=high", three difficulty templates with rich physics explanation, `prescription.drill_template_id = drill.early_turn_in_anchor`.
- **`throttle/early_throttle_snap_oversteer.yaml`** — `id=th.early_throttle.snap_oversteer`, `detection.condition = throttle_pct_at_apex > 0.40 and peak_rear_slip_angle_deg > 6.0`, requires `must_have_channels: [throttle, steering_angle, rear_slip_angle]` (sensors V2_claude_ai does NOT currently have). All 67 rules follow the same schema; `rule_runner.py` renders mustache `{{var}}` against feature context.

---

## 3. YAML rules vs `coaching_library.py` relationship

**They are PARALLEL, NOT consumer/producer.**

- `lap-backend/coaching/library/` (FastAPI DDD service): YAML rule files → `rule_loader.load_rules()` → Pydantic `RuleSpec` → `rule_runner.run_rules(rules, context, difficulty)` → `CoachingInsight` records persisted via `infra/coaching_insight_persistence.py`, with `prescription_generator.py` and `weakness_episode_opener.py` reading `RuleSpec`. Wired into `app/routers/coaching.py` and `app/routers/admin.py`. **Ships in lap-backend (DDD rewrite).** This represents the "per-bin gain table with Brake/Carry/Line/Throttle tags" architecture in its most literal form — each YAML rule IS a tagged bin with `expected_gain_kmh` and a categorical category (braking/cornering/throttle/…).

- `V2_claude_ai/telemetry_tool/track_surface/coaching_library.py` (Python registry): 2,453-line Python module declaring `PatternRegistry` dataclasses (`CoachingTemplate`, `RealLifeCoaching`, `SimCoaching`, `SetupHints`). Library version 2.0.0. Consumed by 3 sibling modules: `driver_development.py`, `prescriptive_coaching.py` (legacy), `coaching_intelligence.py`. **NONE of these are wired into the V2_claude_ai pipeline orchestrator** (only the newer `track_surface.prescriptive` package is, and it has its OWN registry in `prescriptive/patterns.py` — not coaching_library.py).

- **Dead code in V2_claude_ai:** `prescriptive_coaching.py` is explicitly tagged `.. deprecated:: v1.0` ("superseded by track_surface.prescriptive package"). `coaching_library.py` is still imported by `driver_development.py` and `coaching_intelligence.py`, but those two consumers aren't wired into the live pipeline either — so the entire **`coaching_library + driver_development + coaching_intelligence + prescriptive_coaching` quartet is effectively orphaned in V2_claude_ai.**

- **LIVE in lap_web backend** (`lap_web/telemetry_tool/web/routes/coaching.py`): only `from track_surface.prescriptive import generate_coaching_sheet, to_json_dict` — the **new typed engine with 5 built-in patterns from `prescriptive/patterns.py`**, NOT the 2,453-line `coaching_library.py`. Stateless `POST /api/v1/coaching/prescriptive`.

- **ALSO LIVE in lap_web** (`web/routes/data_v2.py`): consumes `theo["corner_coaching"]` produced by `kart_envelope/pipeline.py` step 17 (which uses `kart_envelope.coaching.cause_ranking.generate_coaching_text`). This is a SECOND coaching channel that ships independently of the prescriptive sheet.

- **Live coaching count in lap_web:** 2 channels — `track_surface.prescriptive` (HTTP endpoint) + `kart_envelope.coaching.corner_coaching/cause_ranking` (pipeline-embedded).

---

## 4. V1 spec comparison ("per-bin gain table with Brake/Carry/Line/Throttle tags")

| Module | per-bin? | tagged? | gain_s? | maturity | replaces spec? |
|---|:-:|:-:|:-:|---|---|
| `track_surface.prescriptive` engine | ✓ (per-corner `CornerCoaching`, `s_entry_m/s_exit_m` bin bounds) | ✓ (`PhaseTag` ∈ {entry, brake_release, apex, exit, straight} — superset of Brake/Carry/Line/Throttle) | ✓ (`time_delta_ms` per corner + `estimated_cost_ms` per FocusItem) | PROD (live) | **YES — HYBRID** (richer than spec: adds playbook actions, drills, validation_checks, storyline, but core "per-bin tagged gain" is fully present) |
| `kart_envelope.coaching.corner_coaching + cause_ranking` | ✓ (per-corner `CornerPerformance`, entry/apex/exit sub-bins) | ✓ (cause ∈ {early_braking, late_braking, low_apex_speed, slow_exit} — direct Brake/Carry/Throttle mapping) | ✓ (`time_loss_entry_s, _apex_s, _exit_s` AND `time_loss_ms`) | PROD (live, kart pipeline) | **YES** — this IS the spec'd "per-bin gain table with tags", already in prod for karts |
| `telemetry_tool/coaching/` v3 (analyzers+composers+templates) | ✓ (per-corner via `CornerCoachingDetail` from `compose_corner_coaching`) | ✓ (CauseTaxonomy with 30+ causes across 10 categories, mapped to braking/cornering/throttle/exit phases) | ✓ (severity bands mild/moderate/severe per cause; time_loss propagated through composer) | PROD (wired stages 13e–13g2) | **YES — HYBRID** — strict superset of spec (adds drills + progressive coaching + confidence framing + symptom checks) |
| `lap-backend` 67 YAML rules + rule_runner | ✓ (per-corner rule firing; corner identity flows via mustache `{{corner}}`) | ✓ (each rule has category + subcategory; 9 categories cover braking/cornering/throttle/tire_fuel/strategy/consistency/adaptation/endurance/preparation) | △ (`prescription.expected_gain_kmh` is km/h not seconds; severity_rule emits low/med/high not numeric ms) | WIP-DDD (lap-backend only, not yet in lap_web prod) | **YES — STRONGEST SPEC MATCH** — each YAML rule = one tagged bin with detection condition + expected gain + drill prescription; but requires sensors V2 doesn't have (rear_slip_angle, brake pressure, steering angle) |
| `debrief_engine.py` | ✗ (session-level summary; `top_time_loss_segments` has per-segment k-ranking but no phase tagging) | △ (`dominant_cause` per segment via `classify_mistakes`) | ✓ (time_loss_s per segment) | PROTOTYPE | **PARTIAL** — same shape but stub-quality drills ("Segment T1: review this section for X"); superseded by coaching v3 + prescriptive |
| `tire_degradation.py` | ✗ (stint-level, not corner-bin) | ✗ (free-text only) | △ (predicts laps, not ms) | PROTOTYPE | **NO** — orthogonal axis (long-run tire model, not per-corner coaching) |
| `driver_fitness.py` | ✗ (session-level pace fade / concentration) | ✗ | △ (% fade, not per-bin ms) | PROTOTYPE | **NO** — orthogonal (fitness/endurance, not technique) |
| `track_surface.coaching_library + driver_development + coaching_intelligence` | ✓ (corner-level pattern matching) | ✓ (PHASES + ARCHETYPES taxonomies, polarity weakness/strength/neutral) | △ (cost tagging via consumers, but cost_ms computed by `prescriptive` engine consuming these) | WIP, orphaned in V2 | **NO — superseded** by `prescriptive` engine which is the new home for this taxonomy |

---

## VERDICT

**Coaching for V1 ships as a HYBRID of three already-PRODUCTION engines, NOT the spec'd "per-bin gain table" rewrite.**

1. **`track_surface.prescriptive`** (live HTTP `POST /api/v1/coaching/prescriptive`) — typed `CoachingSheet` with 5 built-in patterns covering low_minimum_speed / early_braking / late_throttle_pickup / weak_exit_build / line_deviation; per-corner `time_delta_ms` + phase tag + playbook actions + drills + validation checks. **This already IS a richer version of the spec.**

2. **`kart_envelope.coaching.cause_ranking + corner_coaching`** (live, pipeline-embedded for karts) — per-corner cause ∈ {early_braking, late_braking, low_apex_speed, slow_exit} + per-zone time_loss_s. **This is the spec almost verbatim, kart-specific, already in prod.**

3. **`telemetry_tool/coaching/` v3** (live, pipeline stages 13e–13g2) — 6 physics analyzers + 5 composers + 156-entry `CORNER_TIPS` template + 20-entry `DRILL_LIBRARY` + JSON cause taxonomy. **This is a superset of the spec with progressive drills + confidence framing.**

**Reconciliation work: 3–5 days**, not weeks. Concrete tasks:

- **(a)** Decide which of the three channels is V1-canonical for the API surface (`prescriptive` is most stateless/typed and already has the HTTP route — pick it).
- **(b)** Deprecate `prescriptive_coaching.py` (already marked deprecated) + `coaching_library.py`-driven trio (`driver_development` + `coaching_intelligence`) since their downstream `prescriptive_coaching.py` is dead.
- **(c)** Decide whether the 67 lap-backend YAML rules are FUTURE roadmap (they require sensors V2 lacks: `rear_slip_angle`, brake pressure, steering angle) or RETIRE in favor of the in-tree Python registries — they're orthogonal because lap-backend is a separate DDD service, not the live V2 stack.
- **(d)** Wire `debrief_engine` / `tire_degradation` / `driver_fitness` into the pipeline OR delete them — currently they import only into their own test files (~3,000 LOC of dead prototype code).

**Rationale:** The spec described a thin per-bin gain table, but V2 already has THREE production engines emitting per-bin gain + categorical tags + millisecond costs. The `kart_envelope.cause_ranking` output literally matches the spec (*"Corner 1: 152 ms (late braking)"*). The `prescriptive` engine generalizes it across vehicle classes with a typed contract and version anchor (`COACHING_SHEET_VERSION=1.0`). The v3 coaching package adds progressive multi-step drills + symptom checks + confidence framing. **The spec doesn't need to be built — it needs to be selected from existing outputs and the deprecated `prescriptive_coaching.py` + orphan `coaching_library` quartet need pruning.**
