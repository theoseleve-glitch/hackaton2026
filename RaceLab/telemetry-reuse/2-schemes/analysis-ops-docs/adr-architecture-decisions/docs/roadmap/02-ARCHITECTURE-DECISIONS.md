# LAP — Architecture Decisions (ADRs)

For each question you marked "you choose" or left blank, this is the decision, the reasoning, and the alternatives rejected. All decisions are locked for 6 months unless flagged `flexible`.

---

## ADR-001 — Backend stack: **FastAPI**, migrate from Flask

**Decision:** Migrate `lap_tool_virtualisation` + Flask API to a single **FastAPI** service. Keep Celery for async jobs. Absorb `lap_tool_virtualisation` into the main backend repo as a package, not a separate service.

**Why:**
- Native Pydantic models + OpenAPI → schema registry comes for free (ADR-004).
- Async native — better for the streaming ingest patterns Bundle v2 needs.
- Flask migration is 2-4 weeks for our surface; FastAPI speeds the rest of the 6 months.
- You delegated this (Q52). Migration cost is front-loaded but pays back in every other workstream.

**Alternatives rejected:**
- Stay Flask: OpenAPI generation is painful, Pydantic integration is bolt-on, async story is weak.
- Node/Express: rewrites existing Python coaching/processing logic — not affordable.
- Django: heavier, ORM-opinionated; we don't need admin/auth batteries.

**Status:** locked.

---

## ADR-002 — Repo consolidation

**Decision:** Reorganize into the following repos:

```
lap-backend           ← NEW. FastAPI + Celery workers + Pydantic models.
                       Absorbs lap_tool_virtualisation entirely.
                       Owns ALL intelligence (WeaknessEpisode, Prescription, etc.)
lap-website           ← SLIMMED. Marketing site only (Astro static).
lap-webapp            ← RENAMED from lap-website/src/app/app.
                       Next.js 14 app router. Driver OS UI.
lap-coach-logger      ← Desktop Qt/QML. Unchanged name.
lap-mobile            ← iOS Swift + (later) Android.
lap-schemas           ← NEW. Source of truth for all data contracts.
                       Pydantic + OpenAPI + generated TS + generated Swift types.
```

**Why:**
- Audit's strongest finding: marketing + authenticated app + ops in one Next repo is a regression-surface tax. Splitting marketing out is cheap.
- `lap-schemas` as its own repo (or top-level folder in a monorepo) is the only way to enforce the cross-repo contract discipline the audit demands.
- Keeping `lap-coach-logger` and `lap-mobile` names reduces rename churn.

**Monorepo vs polyrepo?** **Monorepo** under a single `lap/` root using pnpm/nx workspace + Python uv workspace. One commit, atomic cross-repo changes. Turborepo or Nx for CI.

**Status:** locked.

---

## ADR-003 — Canonical ID format: **UUIDv7**

**Decision:** All entity IDs use **UUIDv7** (time-ordered, sortable, globally unique). 128-bit, expressed as 36-char string.

**Why:**
- Time-ordered: natural DB index locality, sortable by creation without a separate timestamp index.
- Globally unique: safe for offline-first generation on desktop/mobile.
- Library support mature in Python (`uuid6`), TypeScript (`uuidv7`), Swift.
- ULID considered but UUIDv7 is now the RFC-standard equivalent (RFC 9562, 2024) with broader ecosystem.

**Migration:** hard cutoff at Month 1, Week 4. Old sessions get UUIDv7 IDs assigned during reprocessing; old IDs become aliases in a migration table for backward URL compatibility (then deprecated at Month 6).

**Status:** locked.

---

## ADR-004 — Schema registry: **Pydantic source → OpenAPI → codegen TS + Swift**

**Decision:** All data contracts defined once as Pydantic v2 models in `lap-schemas/python/`. We generate:
- OpenAPI 3.1 spec
- TypeScript types (via `openapi-typescript`)
- Swift types (via `openapi-generator` Swift5 template)

CI fails any PR that mutates Pydantic schemas without regenerating TS/Swift.

**Why:**
- One source of truth. Every other option multiplies drift.
- Protobuf was tempting but: the session payloads are JSON over HTTP, not binary RPC. gRPC from Swift/TS is painful. JSON Schema is descriptively weaker than Pydantic.
- OpenAPI gives us free docs + client SDKs + contract tests.

**Status:** locked.

---

## ADR-005 — The 7 canonical backend objects (field shapes)

The audit named 7. You accepted all (Q76) and ranked top 3: `ActionPrescription`, `WeaknessEpisode`, `DriverProgressSnapshot` (Q77). Below are the shapes. All timestamps UTC RFC3339.

### 5.1 `DriverProgressSnapshot`

Captures the driver's current level across skill dimensions at a point in time.

```python
class DriverProgressSnapshot(BaseModel):
    id: UUID7
    driver_id: UUID7
    captured_at: datetime
    window: Literal["session", "week", "month", "rolling_30d"]
    window_start: datetime
    window_end: datetime

    # Per-dimension scores, 0-100 scale with confidence.
    # Dimensions (from Q86 — all real, no placeholder):
    braking: SkillDimension              # timing + release + trail
    throttle_pickup: SkillDimension
    minimum_speed: SkillDimension
    line_consistency: SkillDimension
    tire_management: SkillDimension
    racecraft: SkillDimension
    fatigue_consistency: SkillDimension
    strategy_execution: SkillDimension
    setup_sensitivity: SkillDimension
    adaptation: SkillDimension

    overall_score: float                 # weighted composite
    overall_confidence: float            # 0-1
    percentile_vs_cohort: Optional[float]  # null until cohort exists (ADR-008)

    generated_by: str                    # version of scoring engine

class SkillDimension(BaseModel):
    score: float                         # 0-100
    confidence: float                    # 0-1, decays with time since last evidence
    trend_14d: Literal["up", "flat", "down", "volatile"]
    last_evidence_session_id: Optional[UUID7]
    sample_count: int                    # how many sessions fed this
```

### 5.2 `WeaknessEpisode`

A longitudinal issue the driver has shown repeatedly. NOT a per-session finding — those are `CoachingInsight` (see 5.6). An episode is "this driver struggles with threshold braking at Turn 1 of Spa, across 12 sessions since March".

```python
class WeaknessEpisode(BaseModel):
    id: UUID7
    driver_id: UUID7
    category: WeaknessCategory           # enum: technique, consistency, setup_sensitivity,
                                         #       confidence, race_management, execution
    subcategory: str                     # "late_braking", "early_throttle", etc.
    corner_tag: Optional[str]            # "Spa/T1" or None if not corner-specific
    environment_scope: list[EnvironmentTag]  # which sims/cars/tracks it appears on

    first_observed_at: datetime
    last_observed_at: datetime
    recurrence_count: int
    sessions_affected: list[UUID7]       # capped at last 50

    severity: Literal["low", "medium", "high"]
    confidence: float                    # 0-1, decays over time without re-observation
    confidence_decay_per_day: float      # default 0.02

    status: Literal["open", "improving", "resolved", "dormant"]
    resolved_at: Optional[datetime]

    linked_prescriptions: list[UUID7]    # ActionPrescription IDs
    linked_insights: list[UUID7]         # CoachingInsight IDs

    # Coaching library linkage
    library_rule_id: str                 # which rule in our library defines this weakness
```

### 5.3 `ActionPrescription`

What the driver should do next. Generated when a `WeaknessEpisode` fires or when pre-session planning runs.

```python
class ActionPrescription(BaseModel):
    id: UUID7
    driver_id: UUID7
    weakness_episode_id: Optional[UUID7]  # null if generated from standalone insight
    created_at: datetime

    priority: Literal["p0", "p1", "p2"]
    due_before_session_id: Optional[UUID7]  # if tied to a scheduled target event
    valid_until: Optional[datetime]

    # The prescription itself
    title: str                           # "Trail-brake later into Spa T1"
    rationale: str                       # plain-language why, from library rule
    drill_template_id: Optional[str]     # link to coaching library drill
    expected_context: SessionContext     # car+track+conditions to execute in
    success_condition: SuccessCondition  # measurable

    # Lifecycle
    status: Literal["proposed", "accepted", "in_progress", "completed", "skipped", "expired"]
    accepted_at: Optional[datetime]
    outcome_id: Optional[UUID7]          # ActionOutcome

class SuccessCondition(BaseModel):
    # How we know it worked. Must be machine-checkable against the next session(s).
    metric: str                          # "t1_trail_brake_release_pct"
    target_value: float
    comparison: Literal["gte", "lte", "within_pct"]
    target_pct: Optional[float]
    measurement_window: Literal["next_session", "next_3_sessions", "next_7_days"]

class SessionContext(BaseModel):
    # The {car, track, conditions} a prescription is intended to be executed in.
    # Used by the next-session planner to decide whether the prescription is
    # currently actionable (correct car loaded, track booked, conditions match).
    car_id: UUID7
    track_id: UUID7
    track_layout: str                    # circuit variant, e.g., "GP", "Short", "Combined"
    environment_tag: Optional[EnvironmentTag]   # sim_practice, real_track_day, etc.
    conditions: Optional[str]            # human-readable, e.g., "wet, cold, rolling start"
```

### 5.4 `ActionOutcome`

Did the prescription work.

```python
class ActionOutcome(BaseModel):
    id: UUID7
    prescription_id: UUID7
    measured_at: datetime
    session_ids_measured: list[UUID7]

    success_condition_met: bool
    measured_value: float
    delta_vs_baseline: float             # improvement vs pre-prescription snapshot

    confidence_change: float             # how much the WeaknessEpisode confidence moved
    prescription_efficacy_score: float   # 0-1, feeds prescription_efficacy KPI

    notes: Optional[str]
```

### 5.5 `TransferLink`

The sim↔real bridge. Two or more sessions linked because they represent comparable driving.

```python
class TransferLink(BaseModel):
    id: UUID7
    driver_id: UUID7
    created_at: datetime
    created_by: Literal["user", "auto"]

    session_pair: list[UUID7]            # usually 2: one sim, one real
    link_reason: Literal["same_track", "event_prep", "similar_car_class", "manual"]

    # The diagnostics
    shape_match_score: float             # 0-1, how similar are the *shapes* of inputs
    intensity_match_score: float         # 0-1, how similar are the magnitudes
    divergence_points: list[DivergencePoint]

    # What transferred / did not
    transferred_skills: list[str]        # dimension names that showed parity
    non_transferred_skills: list[str]    # dimension names that diverged

    generated_report_id: Optional[UUID7]  # CoachingInsight summarizing the link

class DivergencePoint(BaseModel):
    track_distance_m: float              # >= 0; meters along the track from start/finish
    metric: str                          # "brake_pressure_peak"
    sim_value: float
    real_value: float
    divergence_type: Literal["shape", "intensity", "both"]
```

### 5.6 `DriverBenchmarkProfile`

Percentiles vs cohort. Empty until we have cohort data (ADR-008).

```python
class DriverBenchmarkProfile(BaseModel):
    id: UUID7
    driver_id: UUID7
    generated_at: datetime

    cohort_definition: CohortDef
    cohort_size: int                     # must be >= 20 for a percentile to publish

    per_track_car_percentiles: dict[str, float]   # "spa/gt3-porsche" → 0.72
    per_dimension_percentiles: dict[str, float]   # "braking" → 0.65

    archetype: Optional[Literal["late_braker", "smooth_flow", "aggressive_exit",
                                "consistent_executor", "adaptive_racecraft"]]
    # archetype only set when enough evidence across dimensions

class CohortDef(BaseModel):
    # Filter spec defining the cohort against which a driver is benchmarked.
    # Any None field = unrestricted on that axis. min_sessions filters out cohort
    # members with insufficient data.
    skill_level: Optional[str]           # "beginner" | "intermediate" | "advanced" | None
    car_class: Optional[str]             # "GT3" | "LMP2" | None for all
    track_id: Optional[UUID7]            # narrow to one track or None for all
    environment_tag: Optional[EnvironmentTag]
    min_sessions: int                    # default 5; cohort member must have ≥ this many sessions
```

### 5.7 `DriverReadinessState`

Ready for the next target session / event?

```python
class DriverReadinessState(BaseModel):
    id: UUID7
    driver_id: UUID7
    target_event: Optional[TargetEvent]  # iRacing special event / real track day
    computed_at: datetime

    readiness_score: float               # 0-100

    # Inputs (all from Q156)
    volume_input: float                  # sessions in last N days
    quality_input: float                 # avg data_quality score
    recency_input: float                 # time since last relevant session
    consistency_input: float             # lap-time consistency trend
    unresolved_weaknesses_input: float   # count x severity
    familiarity_input: float             # sessions on this track/car
    event_pressure_input: float          # competitive weight of target
    recovery_input: float                # time since last intense session

    limiting_factor: str                 # which input is lowest
    likely_gain_area: str                # which weakness, if resolved, moves score most
    recommended_sessions_before_event: int

class TargetEvent(BaseModel):
    # An upcoming sim event or real-life track day/race the driver is preparing for.
    # readiness_score and event_pressure_input depend on the kind + competitive_weight.
    id: UUID7
    name: str                            # "iRacing 24h Daytona qualifier", "Spa club race"
    kind: Literal["sim_event", "real_track_day", "real_race", "real_test"]
    starts_at: datetime
    ends_at: Optional[datetime]
    track_id: Optional[UUID7]
    car_id: Optional[UUID7]
    competitive_weight: float            # 0-1; drives event_pressure_input in readiness calc
    notes: Optional[str]
```

**Amendments (2026-04-26):** §5.3 `SessionContext`, §5.5 `DivergencePoint.track_distance_m`
comment, §5.6 `CohortDef`, and §5.7 `TargetEvent` were added/clarified to close 4
documentation gaps surfaced by the c130 lap-schemas Pydantic conformance audit. No
field shapes changed — these subsections elevate previously implicit Pydantic implementations
into the binding spec, so the source-of-truth (`lap-schemas/python/src/lap_schemas/v1/*.py`)
and ADR are now in full alignment.

**Status:** locked. Field additions allowed; removals require a new ADR.

---

## ADR-006 — Canonical session shape (`SessionManifest` + `SessionRecord`)

Every session, regardless of source, is this.

```python
class SessionManifest(BaseModel):
    # Identity
    session_id: UUID7
    driver_id: UUID7
    bundle_version: Literal["v2"]        # hard cutoff, no v1 going forward

    # Provenance (Q70 — all mandatory)
    capture_app: Literal["lap-coach-logger", "lap-mobile-ios", "lap-mobile-android"]
    capture_app_version: str
    device_model: str
    device_os: str
    device_os_version: str

    source: SourceTag                    # sim name OR "real"
    sim_title: Optional[str]             # "iracing", "acc", etc.
    real_hardware: Optional[Literal["racebox", "phone_only", "aim_solo", "vbox_sport"]]

    # Context (Q65 mandatory fields)
    car_id: UUID7
    track_id: UUID7
    track_layout: str
    environment_tag: EnvironmentTag      # sim_practice, sim_race, real_track_day, etc.
    objective_tag: Optional[ObjectiveTag]  # drill, race_prep, open_practice, etc.
    training_block_id: Optional[UUID7]

    # Timing
    started_at: datetime                 # canonical timebase (ADR-007)
    ended_at: datetime
    duration_seconds: float

    # Integrity
    telemetry_checksums: dict[str, str]  # file_name → sha256
    total_samples: int
    sample_rate_hz: float

    # Quality (Q71)
    data_quality: DataQuality

    # Sensor config snapshot (Q70)
    sensor_config: SensorConfigSnapshot

class DataQuality(BaseModel):
    score: float                         # 0-100
    gps_fix_quality: Optional[float]     # for real-life
    gps_satellite_count_avg: Optional[int]
    channel_completeness: float          # pct of expected channels present
    sample_gaps_count: int
    sample_rate_stability: float         # coefficient of variation
    warnings: list[str]                  # human-readable issues
    recommendations: list[str]           # Q72: how to capture better data next time
    usable_for_overlays: bool
    usable_for_long_term_coaching: bool
```

**Status:** locked.

---

## ADR-007 — Timestamp normalization

**Problem:** mobile has 3 clock sources (CoreMotion `Date()`, CLLocation timestamp, RaceBox parser receipt time) that produce skewed fused samples. Desktop has its own alignment issues.

**Decision:** All captured samples carry TWO timestamps:

```python
class TelemetrySample(BaseModel):
    t_source_ns: int         # ns since session_start, from the ORIGINAL sensor's clock
    t_canonical_ns: int      # ns since session_start, in the session's canonical timebase
    t_source_clock: Literal["gnss", "coremotion", "racebox_gnss", "irsdk_tick",
                            "acc_shmem", "device_monotonic"]
    ...channel values...
```

**Canonical timebase rules:**
- **Sim sessions:** irsdk tick / ACC shared-mem tick is canonical. Sim time never drifts within the sim.
- **Real-life with RaceBox:** RaceBox GNSS timestamp is canonical. CoreMotion samples are aligned to it by nearest GNSS sample (interpolated).
- **Real-life phone-only:** CLLocation timestamp is canonical. CoreMotion aligned by same method.
- **Fusion:** any derived sample uses `t_canonical_ns`. `t_source_ns` is kept for forensic debugging.

**Implementation:** capture clients ship raw sensor timestamps. Canonical alignment happens server-side in the ingestion pipeline. Clients do NOT pre-fuse timestamps.

**Status:** locked.

---

## ADR-008 — Cohort data & benchmarking

**Problem:** Q89 — we have no cohort data. Q90 — no cross-user compute.

**Decision:**
- Months 1-3: `DriverBenchmarkProfile` is null for every user. UI shows "Cohort unlocks at 20 comparable drivers." Users see progression vs themselves only.
- Month 4 onwards: if ≥20 drivers have opted in (opt-in per Q90, not opt-out) and share car+track context, compute percentiles. Anonymized: cohort data stores only `{car_id, track_id, metric, value, session_time}`, no `driver_id` once aggregated.
- Cohort privacy: no user can query "who scored higher than me". Only their own percentile.

**Status:** locked. Flexibility on timing — may move earlier to Month 3 if beta fills fast.

---

## ADR-009 — Live coaching latency policy

**Decision per surface (from Q57, Q61, Q94):**

| Surface | Latency target | Architecture |
|---|---|---|
| Desktop live overlays | <33ms (60fps) | Fully local. Pre-fetched rules from server at session-start. |
| Desktop live coaching prompts | <200ms from event | Local rules engine, no server round-trip during session. |
| Desktop live strategy | <500ms for recalc | Local compute, server sync post-session only. |
| Mobile live dashboard | <200ms | Local. |
| Mobile coaching prompts | <500ms | Local rules engine, thin. |
| Post-session coaching | server-side, <60s p95 after upload | FastAPI + Celery. |
| Next-session plan | server-side, <5s p95 | Deterministic rules + cached ML predictions. |

**Rules engine distribution:** the coaching library (80-150 rules) is **compiled to a portable format** (JSON + embedded DSL) at server-side. Clients fetch at session-start and execute locally. Changes to the library ship via a versioned bundle — server decides WHICH rules, clients execute WHEN.

This preserves "server owns the brain" (rules are authored server-side, loaded at runtime) while meeting latency requirements.

**Status:** locked.

---

## ADR-010 — Offline-first contract

**Decision:**

| Feature | Must work offline? |
|---|---|
| Desktop capture | YES, no exceptions |
| Desktop live overlays | YES, no exceptions |
| Desktop live coaching (rule-based) | YES, if rules fetched within last 7 days |
| Desktop live strategy | YES |
| Desktop post-session review | YES (local bundle), deep insights require cloud |
| Mobile capture | YES, no exceptions |
| Mobile live dashboard | YES |
| Mobile coaching | YES, cached rules only |
| Webapp everything | NO, cloud-required |
| Sync / upload | Queued offline, dispatched when network returns |

**Status:** locked.

---

## ADR-011 — Authentication & identity

**Decision:**
- **Auth provider:** Clerk.dev. Rationale: cheaper than building, native Next.js integration, mobile SDKs, handles MFA/social/email out of the box. Monthly cost at 1K users: ~$25 MAU + $0.02/user. €20/mo.
- **Alternative considered:** Supabase Auth. Rejected because we don't need the rest of Supabase yet.
- **Session model:** JWT with 15-min access + 7-day refresh, rotated on refresh. Desktop/mobile store refresh in OS keychain. Webapp uses httpOnly cookie + BroadcastChannel (already in place).
- **Deep-link handoff webapp→desktop/mobile:** magic-link QR. User clicks "connect desktop" on webapp → QR shown → desktop scans → one-time token exchanged for refresh token.

**Driver identity:**
- Q63: all of those yes → one user account → one or more `DriverProfile` entities → each profile has multiple `VehicleProfile` and `TrackAffinity` and `ChampionshipGoal` children.
- In practice for v1: 1 user = 1 `DriverProfile`. Multi-profile support is scaffolded but not user-facing in 6mo.

**Status:** locked.

---

## ADR-012 — Ingestion pipeline unification

**Problem:** `/sessions/upload` and `/sessions/sync-upload` duplicate dispatch logic (Q75).

**Decision:** Single ingestion endpoint:

```
POST /api/v1/sessions/ingest
  Headers: Idempotency-Key, Authorization
  Body: multipart/form-data
    - manifest: SessionManifest JSON (ADR-006)
    - chunks[]: streamed telemetry chunks
    - artifacts[]: optional supplementary files

Response: 202 Accepted
  body: { session_id, ingest_job_id, status_stream: "/api/v1/jobs/:id/events" }
```

Both desktop "final session upload" and mobile "chunked streaming upload" use this endpoint. Differences handled via manifest fields (`capture_mode: "finalized" | "streaming"`). Celery dispatches the processing pipeline, which emits SSE events for progress.

**Status:** locked.

---

## ADR-013 — What the coaching library looks like

**Problem:** you said the library is a moat and defines what counts as a weakness (Q143). Defining the format.

**Decision:**

```yaml
# lap-backend/coaching/library/rules/braking/late_braking_apex_speed_loss.yaml
id: "br.late_braking.apex_speed_loss"
version: 1
category: technique
subcategory: late_braking
difficulty: beginner

detection:
  signal: apex_speed
  condition: "apex_speed < reference_apex_speed * 0.93"
  context:
    must_have_channels: ["brake", "speed", "steering_angle"]
    min_corner_priority: medium
  evidence_required:
    min_occurrences_in_session: 3
    min_sessions_in_window: 2
    window_days: 14

severity_rule: "linear, 0.93 = low, 0.88 = medium, 0.82 = high"

explanation_template:
  beginner: "You lose {{delta_kmh}} km/h at the apex of {{corner}}. You're braking too late."
  intermediate: "Apex speed deficit of {{delta_kmh}} km/h on {{corner}}. Trail brake release is abrupt."
  advanced: "Apex-speed loss = {{delta_kmh}} km/h. Trail-brake release derivative spikes at t={{release_ms}}ms."

prescription:
  drill_template_id: "drill.trail_brake_later_release"
  expected_gain_kmh: 2-5
  success_condition:
    metric: "apex_speed"
    comparison: "gte"
    target_pct: 0.96
    measurement_window: "next_3_sessions"

transfer_profile:
  sim_vs_real:
    likely_transfers: true
    caveats: ["real braking is more binary; trail-brake release less linear"]
```

80-150 rules of this form by end of Month 4. Rules are YAML, live in the backend repo, versioned, unit-tested against archived sessions.

**Schema (T181, sprint-backend):** the formal JSON Schema is generated from `lap-backend/coaching/library/rule_schema.py` (Pydantic v2 source of truth). Required top-level fields: `id`, `version`, `category` ∈ {technique, setup, strategy}, `subcategory`, `difficulty` ∈ {beginner, intermediate, advanced}, `detection`, `severity_rule`, `explanation_template` (all three difficulty branches), `prescription`. `transfer_profile` is optional. Extra keys are rejected (`extra="forbid"`) so YAML typos fail at load time. The example above is the canonical fixture — `tests/test_coaching_rule_schema.py::test_adr_013_example_validates` regresses any drift.

**Status:** locked.

---

## ADR-014 — Track & car catalog

**Problem:** Q117 mandates moving track mapping off mobile. Q139 asks sim↔real track mapping.

**Decision:**
- **Server owns the track catalog.** One `TrackLayout` entity per circuit variant, with start/finish coordinates, sector splits, official corner names. Sourced from: iRacing data export (legal), OpenStreetMap, user contributions (admin-moderated).
- **Sim↔real track equivalence:** admin-curated mapping table. Spa Francorchamps GP layout maps to the same `master_track_id` whether captured in iRacing, ACC, AC, or real-life.
- **Car catalog:** same pattern. `CarModel` + `sim↔real_equivalence` mapping. GT3 class equivalents grouped.
- **Clients:** send raw GPS. Server does lap detection, sector splits, corner attribution. Clients do NOT do start/finish line detection (Q117 — stripped).

Exception: desktop and mobile cache the latest catalog for offline capture. When offline, they use cached sector splits for live lap timing. On sync, server recomputes canonical laps from raw GPS.

**Status:** locked.

---

## ADR-015 — Frozen decisions (no churn for 6 months)

Per Q192:

- Backend stack (FastAPI)
- Canonical session format (Bundle v2)
- ID format (UUIDv7)
- 7 backend objects' names and core fields
- Pricing (€15/month)
- Auth provider (Clerk)
- Coaching library YAML format

**Flexibility allowed on:**

- Desktop overlay defaults (iterate on feedback)
- Next-session plan generation algorithm (rule-based only for 6mo, but specific rules iterate)
- Exact trial duration (14 vs 30 days — revisit at M3)
- Marketing messaging (iterate with data)
- Android launch date (M5 or M6)
- Cohort opening (M3 or M4)

---

## ADR-018 — TypeScript scaffold hygiene: `@types/node` mandatory; scaffold-task scope-flag threshold (2026-04-23)

**Context:** Two related issues surfaced in review loop Cycle 4 on lap-website.

1. **Verification failure at T005+T006+T007 (`HEAD 5826a14`)**: `playwright.config.ts` uses `process.env` but `@types/node` wasn't added to devDependencies. `astro check` + `eslint` failed with `ts(2580) Cannot find name 'process'` (4 errors). Pattern is general: any TS repo with Node-adjacent APIs (Playwright, Vitest, build scripts, dotenv, `process.env`, `fs`, `path`, `Buffer`) needs `@types/node`. Sprint loops that scaffold TS projects can forget it because the initial `pnpm create astro` / `npx create-next-app` doesn't include it by default.

2. **Scope flag false-positive on T001 (`fbe7bd6`, 4068 insertions)**: Astro 5 scaffold bulk-imports framework-standard files. 4068 lines is normal. The 1500-LOC threshold from ADR-017 is designed to catch scope creep in implementation tasks, not scaffold tasks which legitimately bulk-create boilerplate. Alert noise wastes review quota.

### Decision 1 — `@types/node` mandatory in every TS repo with Node-adjacent usage

Every TypeScript repo in the LAP workspace MUST include `@types/node` in devDependencies from the earliest scaffold task. Applies to:

- `lap-website` (Astro + Playwright)
- `lap-webapp` (Next.js + Playwright)
- `lap-schemas/typescript` (codegen + tests)
- Any future TS package

Sprint tasks that scaffold a TS project are updated to include `pnpm add -D @types/node` as part of T001 or the first "install dev tooling" task. The review loop's applicability check (ADR-017 Step 2.5) does NOT exempt this.

**Why not "remove `process.env` usage"?** Fighting the tool. Playwright configs, Next.js runtime detection, build scripts, test setup all use `process.env` as standard practice. Rewriting around it would require fighting well-trodden patterns for no benefit.

**Why not LOOSER TS config (e.g., `skipLibCheck: true`)?** Masks other real errors. `@types/node` is 2MB in devDependencies — trivial cost.

### Decision 2 — Tiered SCOPE_FLAG thresholds (updated 2026-04-24)

Update `loop-review.md` Step 4 scope-check rules. Three tiers instead of two:

- **Tier A — Default** (implementation tasks): 1500 insertions+deletions → `[SCOPE_FLAG]` (alerting)
- **Tier B — Scaffold-tagged**: 8000 threshold. Below 8000 → `[SCAFFOLD_BULK]` silent-accept. Above 8000 → `[SCOPE_FLAG]` alerting.
- **Tier C — Framework-init-tagged** (new): **15000 threshold**. Below 15000 → `[SCAFFOLD_BULK]` silent-accept. Above 15000 → `[SCOPE_FLAG]` alerting.

**Tier B — Scaffold-tagged** = task title matches ANY of:
- `T001` (always)
- Contains one of: `scaffold`, `init`, `bootstrap`, `seed`, `boilerplate`
- **Test-harness setup**: contains any of `vitest`, `playwright`, `jest`, `cypress`, `pytest`, `test-infra`, `testing library`
- **Installer / packaging**: contains any of `pyinstaller`, `inno setup`, `fastlane`, `gradle wrapper`, `release workflow`
- **Toolchain setup**: contains any of `eslint`, `prettier`, `ruff`, `mypy`, `husky`, `lint-staged`, `pre-commit`
- **CI/CD setup**: contains any of `github actions`, `ci workflow`, `deploy workflow`
- **Codegen setup**: contains `openapi codegen`, `ts codegen`, `swift codegen`, `kotlin codegen`, `schema registry`

**Tier C — Framework-init-tagged** = known-extreme-bulky framework installs where the tool itself creates thousands of lines of generated config/stories/addons:
- `storybook` (Storybook init with default addon bundle routinely 8K-12K LOC)
- `nx workspace`, `turbo setup`, `lerna init` (monorepo init)
- `django-admin startproject`, `rails new` (opinionated mega-scaffolds)
- `expo init`, `create-react-native-app` (RN boilerplate)
- `shadcn/ui init` (registers dozens of components at once)
- `hilt + room + serialization` combined setup (Android)

**Precedents:**
- 2026-04-23 — `lap-website T001` (Astro scaffold) — 4068 LOC → Tier B [SCAFFOLD_BULK]
- 2026-04-24 — `lap-webapp T017` (Vitest + Playwright harness) — 1803 LOC → Tier B [SCAFFOLD_BULK] (reclassified; initially flagged Tier A before expansion)
- 2026-04-24 — `lap-webapp T018` (Storybook setup) — 8722 LOC → Tier C [SCAFFOLD_BULK] (reclassified; initially flagged Tier B)

**Rationale for Tier C**: applying Tier B's 8000 ceiling to Storybook-class tools creates a structural false-positive because the tool's own `init` command generates the bulk. The agent isn't being wasteful — the tool is. Alerting here wastes quota without surfacing actionable scope.

**Never disable scope-checking entirely.** Even Tier C has an upper bound because a genuinely misbehaving agent that `init`s a project and then scaffolds 50 unrelated components in the same commit SHOULD flag.

### Decision 3 — Resolution for current in-flight blocker

Investigation (2026-04-23):

- Review loop cycle-4 reported matrix failure at T005+T006+T007 (`HEAD 5826a14`) with ts(2580) errors.
- User-invoked reproduction: `@types/node` **is already present** in package.json at HEAD 5826a14 (added by T006 `9cb0ecf` in the same failing window). `astro check` passes clean (0 errors).
- **Actual remaining blocker at HEAD was prettier `--check .` failing** on 6 not-yet-formatted files (`.prettierrc.mjs`, `eslint.config.mjs`, `package.json`, `src/layouts/BaseLayout.astro`, `src/pages/index.astro`, `src/styles/global.css`).
- Root cause of the ts(2580) error was transient per-commit state: the review loop likely inspected a working-tree snapshot between T005 (eslint config landed) and T006 (@types/node landed in same cycle), catching an inconsistent intermediate state. By the time cycle-4 completed, T006 had resolved it — but cycle-4 already flagged.
- User intervention: `pnpm format` (prettier --write) at HEAD. Working tree normalized; git diff empty after CRLF re-normalization. Matrix now fully green.
- Sprint file updated: T005 and T006 restored from `[NEEDS_REWORK]` to `[x]` with explanatory note.

**Net outcome:** no git commit required. Problem self-resolved by sprint loop's own T006 commit, masked briefly by prettier-format state. Matrix is GREEN at current HEAD.

**Implication for loop-review.md:** Step 2 verification should inspect HEAD at time of review, not per-commit historical states. If a range of unreviewed sprint commits collectively leave the repo in a green state at HEAD, accept the range. Per-commit failures that resolve by the time review runs are not failures. This prevents false-positive `[NEEDS_REWORK]` tagging on commits that form a valid atomic unit when taken together. (See Decision 5 below.)

### Decision 4 — Preemptive application to lap-webapp

`sprint-webapp.md` T017 (Vitest + Playwright setup) task description updated to include `pnpm add -D @types/node` as the first step of the task. Prevents same failure when webapp loop reaches that task.

### Decision 5 — Review loop verifies HEAD, not per-commit states

Corollary of Decision 3. When multiple unreviewed sprint commits exist in a range:

- The review loop runs the verification matrix once at HEAD of the unreviewed range.
- If green: all commits in the range are marked reviewed. A `[SCOPE_FLAG]` or `[BATCH_REVIEW]` annotation may be added to commits that had intermediate issues.
- If red at HEAD: identify the first commit that still fails (bisect-style, optional). Revert that commit or flag the range for human review.
- **Never treat transient intermediate state as a failure.** Sprint loops operate in small commits; a half-configured state between two commits in a range is expected and not a bug.

`loop-review.md` runbook Step 2 is updated to reflect this.

### Decision 4 — Preemptive application to lap-webapp

`sprint-webapp.md` T017 (Vitest setup) is updated to include `pnpm add -D @types/node` as the first step of the task. Prevents same failure when webapp loop reaches that task.

### Scope

This ADR does NOT:
- Mandate any particular TS target version or strictness level
- Require type coverage metrics
- Extend to runtime dependencies (production code), only devDeps
- Create a "pre-scaffold checklist" agent — the rule is embedded in the sprint task text, not a separate review step

### Status

Accepted. Implemented 2026-04-23. Fix committed to lap-website. Sprint files updated in lap-meta.

---

## ADR-019 — Analytics stack: PostHog cookieless on lap-website, Plausible deferred (2026-04-24)

**Context:** T014 (sprint-marketing) integrated `posthog-js` into lap-website in cookieless mode — `persistence: 'memory'`, `autocapture: false`, `capture_pageview: true`. The bundled client weighs 62.33 kB gzip — roughly 40% of the per-page 150 kB gzip budget defined in `lap-website/CLAUDE.md`. T015 asks for a formal yes/no on swapping to Plausible (~1 kB gzip) before the site is publicly launched.

### The three candidates

| Option | Client JS | Cost | Features we use today | Features we might use |
|---|---|---|---|---|
| PostHog (cookieless) | ~62 kB gzip | €0 (free tier ≤1M events/mo) | pageviews | funnels, feature flags, experiments, session replay |
| Plausible | ~1 kB gzip | ~€9/mo hosted (self-host: €0 + ops) | pageviews, referrers, simple goals | basics only |
| No analytics | 0 kB | €0 | none | none |

### Decision

**Keep PostHog.** Plausible is deferred — not rejected.

### Why

The lap-website's job (01-STRATEGIC-DOCTRINE.md §9) is to convert visits into €15/month trials and to land 1,000 paying users by 2026-10-31. That is a conversion-funnel problem, not a vanity-metric problem. Questions a solo founder needs answered weekly:

- How many /pricing visitors click "Start 14-day trial"?
- Does headline A beat headline B for signup rate?
- Which blog pillar drives the most /pricing traffic?

Plausible can answer the first with care, the second only through manual A/B infrastructure, and the third only partially. PostHog answers all three natively through its funnels + experiments surface — and a solo founder iterating weekly will use them.

The 62 kB gzip cost is real but within budget, and the script is emitted as `type="module"` (browser-deferred by default), so it does not block LCP. T036's performance audit is the next checkpoint that would empirically reject this.

### Revisit triggers

Swap to Plausible if any of these become true:

1. Homepage LCP under test conditions exceeds 1.8 s (CLAUDE.md gate) and the analytics bundle is the dominant bottleneck as measured by Lighthouse (T017).
2. Six months in (target 2026-10-24), we have not opened the PostHog funnels or experiments UI a single time.
3. The free-tier threshold (1M events/mo) is crossed and the resulting paid bill exceeds €20/mo.
4. GDPR guidance tightens such that `persistence: 'memory'` no longer qualifies as non-consensual tracking — i.e. a DPA explicitly ruling on in-memory session identifiers.

### Mitigations that preserve the keep-decision

If bundle size becomes the constraint but we still want PostHog:

- Lazy-load `posthog-js` on first user interaction (defer past LCP).
- Swap to `posthog-js-lite` (~5 kB gzip) when only pageview + basic funnels are needed.
- Self-host the capture endpoint behind `lap-coach.racing` so the third-party DNS + TLS handshake disappears.

### Alternatives rejected

- **Skip analytics entirely.** Flying blind on a conversion-driven launch is not viable at Month 1-5. Revisit post-V1 if the data ends up unused.
- **Run both PostHog and Plausible.** Doubles JS cost, doubles vendor ops, splits funnel tracking. No added signal.

### Status

Accepted. Implementation remains as committed in lap-website@c370601. Revisit at T036 (LCP audit), T017 (Lighthouse CI gate), or when any revisit trigger fires.

---

## ADR-017 — Review loop tooling policy: applicability checks + INFRA_FLAG (2026-04-23)

**Decision:** The review loop does **not** revert commits that fail verification due to infrastructure gaps (tool not installed, command not defined, task scaffolding not yet landed). It accepts with `INFRA_FLAG` and pushes. It only reverts on actual code failure (broken tests, compile errors, lint violations in code that could have been written correctly).

**Context:** Cycle 2 of the review loop surfaced the structural issue. Sprint 1 backend and mobile matrices couldn't run fully because:
- `uv` not in review host PATH (sprint T001 created the venv but system-level uv wasn't available)
- `detekt` / `ktlintCheck` Gradle tasks don't exist yet (they're created by sprint tasks T005 and T006 respectively)
- JDK 21 installed but `JAVA_HOME` not exported in the review terminal's environment

If the review loop had reverted these commits, the sprint loops would have immediately re-done the same work, the review loop would have re-failed them the same way, and the system would enter an infinite recreate-revert cycle that burns quota and ships nothing. The review loop's intuition to accept-with-flag was correct.

The general principle: **a review loop cannot enforce a verification step that hasn't been built yet by the sprint it's reviewing.** Early-sprint commits legitimately operate in a sub-tooled environment; full verification is only realistic once the sprint has scaffolded its own lint/format/test infrastructure.

### Tool categories

Tools are classified into three tiers based on when they must be available:

| Tier | Tool | When required | Behavior if missing |
|---|---|---|---|
| **Hard-required** (always) | `git`, `gh`, `python 3.12`, `node 20+`, `pnpm 9+`, `java 21` + `JAVA_HOME`, `uv`, Android SDK + `ANDROID_HOME` | Entire sprint lifecycle | INFRA_FLAG + alert; if missing for 3 consecutive cycles, loop pauses |
| **Conditionally-required** | `detekt`, `ktlintCheck`, custom Gradle tasks, `mypy strict`, `pnpm test:contracts`, `make codegen-check` | Only after the sprint task creating them has landed `[x]` | INFRA_FLAG without alert; skip verification step gracefully |
| **Deferred** | `xcodebuild`, `swift`, Apple Watch toolchain | Only when Mac available | INFRA_FLAG + logged; never alerts |

### Applicability check pattern

Before running any verification command, the review loop MUST check the command is applicable:

```python
# pseudocode for review loop's Step 2 dispatcher

def applicable(command, repo):
    if command.startswith("pnpm "):
        script = command.split()[1]
        return script in read_json(f"{repo}/package.json")["scripts"]
    if command.startswith("./gradlew "):
        task = command.split()[1]
        return task in run(f"cd {repo} && ./gradlew tasks --no-daemon").stdout
    if command == "uv sync":
        return Path(f"{repo}/pyproject.toml").exists()
    if command.startswith("mypy "):
        return Path(f"{repo}/mypy.ini").exists() or has_mypy_config_in_pyproject(repo)
    # ... etc
    return True

for cmd in verification_matrix[repo]:
    if not applicable(cmd, repo):
        log(f"INFRA_FLAG: {cmd} not applicable (scaffolding not yet landed)")
        continue
    if not tool_on_path(cmd):
        log(f"INFRA_FLAG: {cmd} tool missing on review host")
        if cmd_is_hard_required(cmd):
            increment_cycle_miss_counter(cmd)
            if cycle_miss_counter(cmd) >= 3:
                fire_alert("pause-triggered", f"hard-required tool '{cmd}' missing for 3 cycles")
                write_pause_entry()
        continue
    run_and_verify(cmd)
```

### Revert-vs-flag decision

| Failure mode | Behavior |
|---|---|
| Test fails on code that exists | REVERT |
| Code doesn't compile | REVERT |
| Lint error in new code | REVERT |
| Secret detected in diff | REVERT (critical) |
| Scope blowup >1500 LOC | FLAG (accept, tag `[SCOPE_FLAG]`) |
| Tool not in PATH | INFRA_FLAG (accept, log, maybe alert) |
| Task doesn't exist (conditionally-required) | INFRA_FLAG (accept silently, log only) |
| Cross-repo contract test fails | FLAG (ambiguous attribution) |

### Escalation

The review loop fires `pause-triggered` alert (via `ops/send_alert.py`) when:
- A hard-required tool is missing for 3 consecutive cycles (6 hours).
- The cumulative count of INFRA_FLAG commits exceeds 20 in any repo without the underlying gap being fixed.

These triggers exist because "tool should be installed" is a human action the loop can't take itself.

### What this ADR does NOT authorize

- It does NOT allow the review loop to skip verification for convenience.
- It does NOT allow the review loop to ignore secret-leak or code-fail.
- It does NOT allow any loop to `pip install` or `choco install` new tools on the host (those are user actions).
- It does NOT extend to production — production verification is still full-strict, and a tooling gap in prod blocks deployment.

### Review-host bootstrap requirement

To close the hard-required gap, the user must install on the Windows host:

```powershell
# Install uv (adds to user PATH automatically)
irm https://astral.sh/uv/install.ps1 | iex

# Set JAVA_HOME for current user
[Environment]::SetEnvironmentVariable('JAVA_HOME', 'C:\Program Files\Microsoft\jdk-21.0.10.7-hotspot', 'User')

# Add Java bin to PATH
$currentPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($currentPath -notlike '*jdk-21*') {
  [Environment]::SetEnvironmentVariable('Path', $currentPath + ';C:\Program Files\Microsoft\jdk-21.0.10.7-hotspot\bin', 'User')
}

# Optionally: set ANDROID_HOME if Android Studio didn't
# [Environment]::SetEnvironmentVariable('ANDROID_HOME', "$env:LOCALAPPDATA\Android\Sdk", 'User')

# Close and reopen the review terminal after this runs.
```

After user runs this, the review loop resumes full-strict verification on hard-required tools. Conditionally-required tools continue to be tolerated until their sprint task lands.

### Status

Accepted. Implemented in `loop-review.md` Step 2 + Step 2.5 (applicability check) + Hard NEVER rules update. Flexible on the specific tool list — can add/remove as sprint scope evolves.

---

## ADR-016 — What the audits got wrong

Q197 asked for this. My read, to be validated with you:

1. **The audits treat "desktop should not do coaching" as absolute.** It's wrong. Desktop must do rule-based coaching locally for latency. The ADR-009 compromise (rules authored server, executed client) is the correct boundary, and the audits didn't name it.
2. **The audits underweight the value of the existing `LapCoachLogger_sessions/` archive.** You have Sebring, Silverstone, Nürburgring VLN, Laguna Seca, Red Bull Ring, Lime Rock, Ledenon sessions already captured. This is training data for the coaching library and transfer model — reprocess it, don't discard it.
3. **The audits recommend "strip all business rules from Next.js" without acknowledging that some of those rules encode user-trusted behavior.** E.g., the readiness label thresholds users recognize — if we flip them without notice, trust breaks. ADR-009 rules-as-versioned-bundle plus a release note on the first threshold change handles this.
