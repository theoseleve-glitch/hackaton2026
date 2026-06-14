# Crowd-Sourced Karting Telemetry — Corrected Plan (master)

> **Status:** the original "7-day crowd-sourced karting telemetry stack" plan was pressure-tested + deep-dived against the real repos (2026-06-02). Verdict: **NO-GO as originally framed → GO on a re-scoped two-lane plan with slack.** This doc is the strategy capture + cross-cutting decisions + task-level lanes. The first executable TDD plan is `2026-06-02-ws2-canonical-track-id-datalogger.md` (Lane A).

> **For agentic workers:** Lane A has a full TDD plan (see above). Lanes B and the research track are captured at task level here and should get their own detailed TDD plans **when scheduled** (Lane B is launch-window-adjacent — see Open Decisions / Launch Safety before touching it).

**Goal:** Ship the crowd-sourced track-grip + canonical-track features by *extending* what already exists across the real repos, not rebuilding a mythical single backend.

**How this was produced:** two multi-agent workflows — a 6-mapper + 6-critic adversarial pressure-test, then 6 deep-dives + synthesis — reading the actual code, migrations, and git history. Evidence is cited by `file:line` throughout the source analyses.

---

## 1. The reality the original plan got wrong

The original plan assumed one backend with denormalized `track_uuid/track_name/layout_id` columns whose canonical-track-id had "drifted three times," plus arq, PostGIS/h3, and user-keyed RLS. **None of that is true.** Capabilities are split across four repos, the drift premise is overstated, and the riskiest pieces are mostly already built.

| Capability | Real home | State |
|---|---|---|
| Canonical resolver + drift ledger (WS2) | `datalogger/backend` (FastAPI/async) | **~85% built**: registry `0002`, session canonical FKs `0003`, append-only-by-convention ledger `0004`, deterministic VALIDATION-mode `resolver.py:47-168`, wired via `routers/bundles.py:111-227`. Only the typed wrapper + DB enforcement are net-new. |
| Cross-session grip + weather (WS4) | `lap_web/telemetry_tool` (Flask, **LIVE prod**) | Publish path works: `track_surfaces_global` (052), Open-Meteo pipeline, condition partitioning (054/055). Needs 2 wiring fixes + a k-anon gate. |
| R3F track renderer (WS5/WS6) | `lap_web/lap-website` (Next.js) | **Shipped & live-verified**: 4-tier render cascade + 3 empty-states + shared-vertex mesh cache + Line2/z-fight pattern. Compare/Aggregate reuse them. |
| Centerline fusion + recognition (WS1/WS3) | `Analysis/V2_claude_ai` + `lap_web/telemetry_tool` geometry | **~70% pre-built** (`centerline.py` 1071 lines, `medial_axis.py` 596, 8 gt anchors, deterministic `track_matcher.py` + 18 tests). A **~2–3 week research track**, not greenfield, not 7-day. |

**Frozen / do not target:** `lap-backend/` (FastAPI/Celery/Clerk) is FROZEN (2026-05-11, ~19% coverage, `FROZEN.md`); its `Session` has no track columns. The original plan's infra assumptions described *this* repo.

**Drift premise:** struck. No repo has `track_uuid/track_name/layout_id`. Exactly **one** real "drift" exists — V2 migration `044`, an RLS GUC string-literal typo (`app.workspace_id` vs `app.current_workspace_id`) — which a type wrapper could not have caught. The real drift `datalogger` handles is desktop-vs-backend LUT skew, already detected + ledgered.

---

## 2. Cross-cutting decisions (resolved against code)

| Decision | Resolution | Rationale |
|---|---|---|
| Scheduler | **Celery + Redis** (arq struck) | `docker-compose.prod.yml` runs celery workers + beat; datalogger is FastAPI/Celery. Pipeline runs synchronously in-request → batch contributor upserts into one multi-row INSERT. |
| Spatial layer | **No PostGIS, no h3, no JSONB-geo** | Existing Frenet `(s,n)` + scipy `cKDTree` + 1D arclength binning already answers every query. `postgres:16-alpine` can't run PostGIS/h3; a swap = ~1wk infra for **zero** functional benefit. |
| RLS grain | **Workspace-keyed** `app.current_workspace_id`; keep `track_surfaces_global` RLS-free as the deliberate cross-tenant publish channel; k-anon counts **distinct hashed `workspace_id`** | ~50 tables RLS-scoped on the workspace GUC; FORCE RLS on owner (`034`). Personal workspace ≈ 1 user → privacy-clean k-anon proxy. `driver_id` isn't threaded into persistence; workspace_id is the only contributor key available without new plumbing. Add a migration-lint test guarding the `044` GUC-typo class. |
| Contract direction | **Pydantic → OpenAPI → generated TS** (`@lap/schemas`); Zod struck | No Zod in the FE. Design `CanonicalTrackId` + new models to emit **byte-identical** OpenAPI (id serializes as plain `string`/uuid) so no regen / FE ripple. |
| k-anon threshold | `GLOBAL_GRIP_K_MIN` env, **default k=3**, per `(track, vehicle_class, condition)`; **404 not 403** below threshold; ships **dark** at launch | ~0 contributors today; launch 2026-06-08. Fail-closed is correct. `session_count` double-counts a user's repeat uploads → must gate on distinct contributors (needs the new contributor table). 404 avoids leaking track existence. Do **not** lower k to 1 (single-competitor grip-line leak). |
| Resolver policy | **SUGGEST / VALIDATION-mode** — record drift, never overwrite the desktop-submitted id | Already the committed design (`resolver.py` D5; `bundles.py` persists submitted id verbatim + writes a drift row). Blind spot to document: `detect_drift` only fires when *both* sides resolve, so a backend-behind-on-LUT case is invisible. |

---

## 3. The 7-day plan — two independent lanes

### Lane A — `datalogger/backend` WS2 hardening · ~2.5–4d · launch-safe · no FE dependency
**Full TDD plan: `2026-06-02-ws2-canonical-track-id-datalogger.md`.** Summary:
- **WS2-A:** `CanonicalTrackId` (uuid.UUID subclass) + opt-in `TypeDecorator` on `Session.canonical_track_id` + typed read schemas. Byte-identical OpenAPI.
- **WS2-B:** migration `0005` append-only (UPDATE-blocking) trigger on `canonical_drifts` (plpgsql, alpine-safe). *Decision flagged:* UPDATE-only vs hard-immutable (CASCADE interaction).
- **WS2-C:** real invariant meta-test (determinism, drift symmetry, append-only) — replaces the struck `grep track_uuid`. Plus dead-code cleanup (`resolver.py` lru_cache, `backfill_resolver.py` docstring drift).

### Lane B — `lap_web/telemetry_tool` (backend) + `lap_web/lap-website` (R3F) · WS4 → WS6 → WS5
> ⚠️ **Touches live launch-path code. Do not deploy without the diff-confirmation gate (see §5). Recommended: schedule after the 2026-06-08 launch.**

**Critical correctness note:** the deployed copy is **`lap_web/telemetry_tool`** (deploy.sh scp's it), **not** `Analysis/V2_claude_ai/telemetry_tool` (a divergent fork). Prod alembic head = **060** (chain 055→059→060). Migrations **056/057/058 are orphaned/unapplied** (056 has a `session_id` INTEGER-vs-TEXT FK type bug, documented in the 059/060 headers). **Any new migration MUST chain off 060** or it creates a third head and the upgrade fails.

- **WS4-A** (~1–1.5d): new RLS-free `track_surface_global_contributors(track_id, distance_m, vehicle_class, condition, contributor_workspace_id, first/last_seen, PK incl. contributor)` so `COUNT(DISTINCT contributor)` = distinct_user_count. **Store hashed workspace_id** (global table has no RLS). Online averaging can't recover distinct counts — a set/side-table is mandatory. Chain off head 060.
- **WS4-B** (~0.5–1d): two real wiring fixes. (1) Thread `workspace_id` (`g.workspace_id`) into `upsert_global_grip`, batched. (2) **Bug:** the grip upsert at `orchestrator.py:910` hardcodes `condition=meta.get('track_state','dry')`, but `classify_conditions` runs *later* (`:1265`) and its `{dry,damp,wet,greasy}` label **never reaches the upsert** → everything lands `'dry'`. Defer the global upsert to after `summary['conditions']` is set; reconcile vocab (map `heavy_wet → wet`).
- **WS4-C** (~0.5d): k-anon read gate on `get_global_surface` (`data_v2.py:5789`, currently has **none**) — `get_global_distinct_contributors()` helper, gate on `GLOBAL_GRIP_K_MIN` (default 3), 404 below. Expose `distinct_user_count` + `condition` + `vehicle_class` for FE trust/condition UI. Add the RLS-GUC migration-lint test.
- **WS6 Aggregate** (~1.5–2d): new `GET /tracks/{canonical_id}/aggregate-surface?sessions=...` reusing `get_triangulated_surface_cached` (shared vertex set) + `_per_vertex_grip_measured` on concatenated arrays; cache key `agg:{cid}:{vclass}:{cond}:{sha256(sorted(ids))}` so `{A,B}=={B,A}`. FE feeds into the **existing** `makeColorBuffer` swap — near-zero renderer change.
- **WS5 Compare** (~2.5–3d): K (≤8) color racing-line overlays (drei `Line2` + existing z-fight pattern + chart-kit palette). **Critical frame fix:** each session projects its GPS to *its own* best-lap ref — for overlay, all K lines MUST project to the **one shared canonical mesh ref** (new `GET /sessions/{id}/surface-line?ref_lat=&ref_lon=&lap=N`), else overlays are silently offset/rotated. Track-FILTERED multiselect (cross-track can't share a mesh), `useQueries`, per-line dispose-on-unmount (else GPU leak), HTML hover-legend. The 4-tier cascade + empty-states already ship — **do not rebuild**. Drop the plan's Zod validator.

**True critical path:** confirm/target the deployed copy (done: `lap_web/telemetry_tool`, head 060) → then WS4 condition/contributor correctness gates WS6, and WS6's shared-mesh ref-return gates WS5's frame alignment. Lane A is fully independent and can run in parallel from day 1.

---

## 4. Research track (multi-week, OUT of the 7-day window)

- **WS1 centerline fusion** — ~70% built (`centerline.py`: out-lap rejection, FFT circular lap alignment, pointwise median, curvature-regularized periodic B-spline, arclength reparam; `medial_axis.py`; 8 gt anchors; CI determinism gate). Remaining ≈ pick ONE impl (recommend telemetry-only B-spline default + gt-anchored medial-axis refinement), vendor into a shared module importable by datalogger (adds numpy/scipy — manylinux wheels, `python:3.12-slim` fine), build a synthetic harness. ~1.5wk.
- **WS3 recognition** — ship `track_matcher.py` (deterministic curvature-fingerprint + cross-correlation, 18 tests) as **v1**; defer LCSS/Platt/MAPIE/HDBSCAN. Build a real-track eval set (8 gt anchors + cross-sim exports) to validate the `0.85` similarity / `5%` length thresholds **before** declaring done; add a fingerprint registry table + recognize-then-resolve writing `canonical_track_id` + a recognition-confidence drift flag, reusing the VALIDATION-mode pattern. ~1.5wk.
- **Cut entirely (not deferred):** PostGIS/h3 enablement; per-driver (vs per-workspace) k-anon identity plumbing; cohort/benchmark aggregation (roadmapped to Month 4, needs ≥20 drivers/{track,car_class}); synthetic-only precision/recall/ECE launch gates (keep only as labeled, non-predictive regression tripwires; cap recognition at SUGGEST, not AUTO_ACCEPT, until validated on real traces).

---

## 5. ⚠️ Launch-window safety (today 2026-06-02; launch 2026-06-08)

Lane B touches the **live, traffic-collecting** V2. Per project policy, behavior-changing deploys to a live endpoint during a launch window need **explicit diff confirmation** — no autonomous deploy. Lane A (datalogger) carries none of this risk.

**Verify before Lane B touches prod:**
1. Is `GET /tracks/<id>/global-surface` consumed by the live FE yet, or dark? (If live, adding the k-anon gate is a behavior change.)
2. Does prod actually connect as the RLS-enforced `telemetry_app` role (`SET LOCAL ROLE`)? If it still connects as owner, RLS is bypassed and the global table is trivially writable cross-tenant — fix before layering k-anon.
3. Is `meta['track_state']` ever populated in prod uploads, or always absent (⇒ everything `'dry'`)? Determines whether wiring the classifier changes existing aggregates (backfill?) or only future ones.
4. Is the `cross_session_accumulator` npz/Parquet path actually run in prod? It already has per-cell distinct-contributor attribution — if it runs, it could be the contributor source instead of the new SQL column.

---

## 6. Open decisions (need a human call)

1. **Append-only ledger:** UPDATE-only (recommended default — preserves GDPR/cascade delete) vs hard-immutable incl. DELETE (switch `canonical_drifts.session_id` FK to `RESTRICT` + explicit archival). Gates migration `0005`.
2. **Compare scope:** K laps within one session, K sessions at one track, or both? Backend supports both; the picker UI + day-1 lock differ. And: a mode inside `TrackSurfacePanel` or a dedicated `/app/compare/track-surface` route?
3. **WS6 aggregate source:** cross-workspace `track_surfaces_global` (k-anon gated) vs workspace-scoped only — a product/privacy decision, not just engineering.
4. **Where WS1 runs:** vendored into datalogger (adds scipy/scikit-image to a lean dep surface) vs left in V2/lap_web and consumed via API/artifact.
5. **Reconcile the two `telemetry_tool` copies?** Will orphaned 056/057/058 ever be merged/fixed? If `057_bundles` is needed in prod, the 056 FK type bug must be fixed first.

---

## 7. Suggested sequencing

- **Now → launch (2026-06-08):** Lane A only (datalogger WS2). Safe, isolated, high-value, no live-endpoint risk. Resolve Open Decision #1 before WS2-B.
- **Post-launch:** verify the 4 Lane-B prerequisites (§5), resolve Open Decisions #2–#3, then Lane B (WS4 → WS6 → WS5) with diff-confirmed deploys.
- **Parallel/background:** kick off the WS1/WS3 research track whenever capacity exists; do **not** block the 7-day deliverables on it.
