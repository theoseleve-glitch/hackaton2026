# Backend Migration Implementation Plan — adopt William's schema/engine/server foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make William's `packages/schema` keystone + `storage`/`account`/`weather`/`speedhive`/`sessions` packages + `server/` the canonical backend of the RaceLab app, **without losing any of theo's shipped features** (social, driver profiles, retention/insights, share/report/profile cards, brand) and **preserving the D18 invariant** (deterministic advisor, grounded-or-silent, zero I/O on the advice path, advisor always free).

**Architecture:** Offline-first Expo app where William's `schema` is the domain contract, `storage` (`openRepos` → `Repos` + same-transaction outbox) is the only local source of truth, and `server/` (Vercel) + `account` give Tier-B backup/sync + entitlements that can be fully down without breaking any flow. The engine stays the shared seam (its `RaceEngineerChat`/`recommend`/`parseFeedback` are common to both forks). **Theo's differentiating code is re-ported onto schema, never deleted.**

**Tech Stack:** TypeScript, Expo SDK 56, React Native, `expo-sqlite` (storage), Vercel functions + Neon Postgres (server), Clerk (auth), tsx test scripts per package.

**Worktrees:** Implement in `C:\Users\Admin\Documents\wt-theo-racelab\RaceLab` (branch `theo/racelab`). William's source is checked out read-only at `C:\Users\Admin\Documents\wt-william-racelab\RaceLab` (branch `william/racelab`, detached) — reference, never edit.

**Integration mechanic (decided):** Do **not** do a full `git merge` (10 conflicts, mostly add/add on divergent models). Instead bring William's **net-new** packages/server into theo's tree via targeted `git checkout origin/william/racelab -- <path>`, then reconcile the **shared** packages (`engine`, `kb`, `sheets`) deliberately, then migrate the app screen-by-screen. This keeps every step buildable and reviewable.

---

## OPEN DECISIONS (resolve before the phase that needs them)

These came out of the mapping. Each blocks a specific phase; Phases 0–2 are unblocked and can start immediately.

1. **The two planners (blocks Phase 3).** Theo's `engine.buildRacePlan` (one qualitative night-before briefing) vs William's split: `engine.planRaceDay`/`RaceDayPlan` (qualitative grounded adjustments) **+** `schema.strategy.planRace` (quantitative fuel/stint/pit + `detectTyreCliff`). **Recommendation:** keep a thin theo-local `buildRacePlan` façade that composes `planRaceDay` + `planRace` (preserves the single-screen UX, gains quantitative strategy). **Needs your ✅.**
2. **`DriverProfile` name collision (blocks Phase 5).** Schema `account.DriverProfile` (onboarding: level/age/country) vs social `DriverProfile` (handle/career/avatar/classes). **Recommendation:** rename schema's to `OnboardingProfile`. **Needs your ✅ (and a heads-up to William since it's his type).**
3. **Schema outbox unfreeze (blocks Phase 5).** `schema.OUTBOX_DOMAINS` is frozen and lacks `follows`/`candidacy`/`reports`/`weather`. Server already accepts arbitrary `domain` strings (forward-compat). **Recommendation:** add the 4 domains to the frozen array (coordinate with William, one-line contract change) rather than the envelope workaround. **Needs William coordination.**
4. **Account split boundary (blocks Phase 5/6).** Entitlement/trial/subscription → `packages/account`; social identity (`handle`/`display_name`/`avatar_uri`/`home_track`/`classes`) + prefs (`lang`/`units`) stay theo-local in a thin `profile` store journaled under the existing `profile` outbox domain. **Recommendation as written; your ✅.**

---

## PHASE ROADMAP (dependency-ordered)

| Phase | Objective | Unblocked? | Verify |
|---|---|---|---|
| **0** | Import-path aliases + bring William's net-new packages into the tree | ✅ now | `tsc` per package; Metro bundles; emulator boots |
| **1** | Adopt `schema` (+`vocab`/`ids`/`parse`/`bridge`) as the type source; reconcile `engine`/`kb`/`sheets` | ✅ now | `schema` tests; `engine` tests; `tsc` |
| **2** | Migrate stores → `storage` (`openRepos`+outbox), non-destructive legacy migration | ✅ now | `storage` tests; cold-boot no-wipe; outbox accrues |
| **3** | Engine/planner reconciliation (history via `LearningTuple`; planner decision #1) | ⛔ dec #1 | `engine` tests; advisor identical on fixtures; **no-I/O-on-advice-path test** |
| **4** | Sheets + run capture end-to-end on schema (`RunTiming`, `OutcomeRecord`, version attribution) | ✅ after 2 | `sheets`/`runs` tests; apply→log→rate loop |
| **5** | Re-port social, profiles, retention, comparison, insights onto schema | ⛔ dec #2,#3 | mock-determinism snapshots; Feed/share/fork; ProgressCard |
| **6** | Server/sync + entitlements (Tier B) — works fully with tier down | ⛔ dec #4 | `server` tests; airplane-mode full app; push/restore idempotent |
| **7** | Brand re-apply + FR i18n + cleanup of legacy stores | ✅ after 5 | emulator visual pass; FR/EN toggle; `tsc` clean |

> Each of Phases 3–7 gets its **own detailed bite-sized sub-plan** authored just before it runs (its task shapes depend on the preceding phase's real outcomes). Phases 0–2 are detailed below and executable now.

---

## Phase 0 — Aliases + vendor William's net-new packages

**Files:**
- Modify: `apps/mobile/tsconfig.json`, `apps/mobile/metro.config.js`, root `tsconfig.json`
- Create (via checkout): `packages/{schema,storage,account,weather,speedhive,sessions}/`, `server/`, `scripts/assemble-contracts.mjs`, `docs/{07_SKELETON_AUDIT,08_BACKEND_PLAN}.md`, `CONTRACTS.md`

- [ ] **Step 1: Branch-safety checkpoint.** Confirm clean tree on `theo/racelab` and tag a rollback point.

```bash
git -C wt-theo-racelab/RaceLab status --short            # expect empty
git -C wt-theo-racelab/RaceLab tag pre-migration-2026-06-17
```

- [ ] **Step 2: Vendor William's net-new packages (additions only — these paths don't exist on theo).**

```bash
WT=wt-theo-racelab/RaceLab
for p in packages/schema packages/storage packages/account packages/weather packages/speedhive packages/sessions server scripts/assemble-contracts.mjs CONTRACTS.md docs/07_SKELETON_AUDIT.md docs/08_BACKEND_PLAN.md; do
  git -C "$WT" checkout origin/william/racelab -- "RaceLab/$p"
done
git -C "$WT" status --short | head            # all new files staged
```

- [ ] **Step 3: Add a `@racelab/*` path alias** so cross-package imports stop being hand-counted `../../../`.

In `apps/mobile/tsconfig.json` `compilerOptions.paths`:
```json
"paths": { "@racelab/*": ["../../packages/*/src"] }
```
In `metro.config.js`, add the monorepo `extraNodeModules`/`watchFolders` for `packages/*` (it already watches `packages`; add the alias resolver). Keep existing relative imports working — alias is additive for new code.

- [ ] **Step 4: Typecheck each vendored package in isolation** (they should be self-consistent on William's side).

```bash
for p in schema storage account weather speedhive sessions; do
  ( cd wt-theo-racelab/RaceLab/packages/$p && node ../../apps/mobile/node_modules/typescript/bin/tsc --noEmit ) && echo "$p OK" || echo "$p FAILED"
done
```
Expected: all `OK`. Any failure = a missing dep or a cross-package import that needs the alias — fix before proceeding.

- [ ] **Step 5: Run William's package test suites** that don't touch the app.

```bash
( cd wt-theo-racelab/RaceLab/packages/schema && npx tsx src/test-schema.ts )
( cd wt-theo-racelab/RaceLab/packages/storage && npm test )
( cd wt-theo-racelab/RaceLab/packages/account && npm test )
```
Expected: green.

- [ ] **Step 6: Commit.**

```bash
git -C wt-theo-racelab/RaceLab add -A
git -C wt-theo-racelab/RaceLab commit -m "feat(migration): vendor William's schema/storage/account/weather/speedhive/sessions + server (Phase 0)"
```

## Phase 1 — Adopt `schema` as the type source; reconcile engine/kb/sheets

**Files:**
- Modify: `packages/engine/src/*` (reconcile vs William's engine), `packages/kb/*`, `packages/sheets/src/*` (repoint imports), `packages/engine/package.json` (test script)
- Reference: `wt-william-racelab/RaceLab/packages/{engine,kb,sheets}/src`

- [ ] **Step 1: Diff theo vs William for the shared packages** to see exactly what reconciles.

```bash
for p in engine kb sheets; do
  echo "=== $p ==="; diff -rq wt-theo-racelab/RaceLab/packages/$p/src wt-william-racelab/RaceLab/packages/$p/src
done
```

- [ ] **Step 2: Sheets is byte-identical per the map — adopt William's and repoint its `ChassisTemplate`-from-engine import.** Replace theo `packages/sheets/src` with William's, then fix the one engine edge. Verify:

```bash
git -C wt-theo-racelab/RaceLab checkout origin/william/racelab -- RaceLab/packages/sheets/src
( cd wt-theo-racelab/RaceLab/packages/sheets && npm test )   # expect green
```

- [ ] **Step 3: Reconcile the engine.** Adopt William's engine modules (`chat`, `engineer`, `plan`, `reports`, `planner`, `history`) as canonical; confirm `RaceEngineerChat`/`recommend`/`parseFeedback` signatures are unchanged (shared seam). Bring `engine.historyFromTuples` (consumes `schema.LearningTuple`). Defer the `buildReport`→`analyzeRuns` reshape and the planner decision to Phase 3 — for now keep theo's `report.ts`/`planner.ts` ALSO present under temporary names so nothing that imports them breaks yet.

- [ ] **Step 4: Make `schema/vocab` the single source for shared unions.** In `engine`/`sheets`/`logbook`, replace duplicated `Grip`/`Surface`/`Outcome`/`PowerType` definitions with `import { ... } from "@racelab/schema"`.

- [ ] **Step 5: Typecheck the whole package set.**

```bash
( cd wt-theo-racelab/RaceLab/packages/engine && node ../../apps/mobile/node_modules/typescript/bin/tsc --noEmit )
```
Expected: clean (app not yet migrated — that's Phase 2+).

- [ ] **Step 6: Run engine tests** (the deterministic eval must stay 10/10).

```bash
( cd wt-theo-racelab/RaceLab/packages/engine && npm test )
```
Expected: green incl. `eval` 10/10.

- [ ] **Step 7: Commit.**

```bash
git -C wt-theo-racelab/RaceLab commit -am "feat(migration): schema as type source; reconcile engine/kb/sheets (Phase 1)"
```

## Phase 2 — Migrate stores to `packages/storage`

**Files:**
- Modify: `apps/mobile/src/{store,garagestore,logstore,trackstore,reportstore}.ts`, `apps/mobile/App.tsx`
- Reference: `packages/storage/src/{repos,migrate}.ts`

- [ ] **Step 1: Construct storage at app boot.** In `App.tsx`, build `expoSqliteExecutor → openSqliteStorage → openRepos → Repos` once, provide via context.
- [ ] **Step 2: One-time non-destructive legacy migration.** Call `migrateLegacyBlobs(kv)` (reads exact `racelab:sheets:*`/`racelab:sessions*`/garage/logbook keys) → `applyMigration(repos, lifted, now)`; preserve the `MP11` legacy seed (`car-legacy-mp11`) and never-wipe via storage `quarantine` (replaces `:backup:<reason>`).
- [ ] **Step 3: Rewire `useGarage`/`useLogbook`/`useTracks`** to `Repos.cars`/`.runs`/`.tracks`; convert the `update(fn)` functional-setState pattern to `repo.put(value, now)`.
- [ ] **Step 4: Verify cold-boot reads existing on-device data with no wipe** (emulator, against real blobs) and the outbox accrues an entry on every mutation.
- [ ] **Step 5: Commit** `feat(migration): stores on storage+outbox, non-destructive legacy migration (Phase 2)`.

> **Detailed bite-sized steps for Phases 3–7 are authored as separate sub-plans** (`docs/superpowers/plans/2026-06-..-migration-phaseN.md`) immediately before each runs, because their task shapes depend on the prior phase's real diffs and the open decisions above. Their objectives/files/risks/verification are the roadmap table + the full mapping analysis in `docs/superpowers/specs/2026-06-17-backend-migration-analysis.md`.

---

## PRESERVATION CHECKLIST (must still work at the end — copied into each phase's verify)

- [ ] **Advisor (D18):** fully offline, grounded-or-silent, **zero I/O on the advice path, advisor always free.**
- [ ] **Social share:** `griplab://import?d=` deep link, `.griplab` export, QR scan-import, `payloadToLink`/`linkToPayload`, fork-into-garage, `forkProvenanceLine`.
- [ ] **Follows / Feed / Discover / You:** `follow`/`unfollow`/`isFollowing`, deterministic `socialnet` mock (5-driver roster incl. `theo-pro`).
- [ ] **Driver profiles:** public `DriverProfile` (handle/career/avatar/classes), header avatar disc → Social.
- [ ] **Retention/insights:** `ProgressCard`, `driverStats` palmarès, `carStatus`/`seasonStats`/`nextMilestone`/`computeAchievements`.
- [ ] **Run comparison:** `compareRuns`/`RunComparison` in `CompareScreen`.
- [ ] **PNG cards:** `ShareCard`, `ProfileCard`, `RunReportCard`, `ReportCard` (rn-svg `toDataURL`).
- [ ] **Provenance:** `withAuthor` stamps `account.handle` on shared payloads.
- [ ] **Track candidacy:** `submitCandidacy`/`getCandidacy`, OfficialTracks flow.
- [ ] **Garage/sheets/runs/tracks:** multi-car, D21 versioning, full run log, track records, MP11 migration, never-wipe.
- [ ] **Account/entitlements:** 15-day trial, web-checkout (no IAP), valid offline through expiry + `GRACE_DAYS=7`, GDPR delete.
- [ ] **Engineer history:** saved reports/race-plans/strategy → storage `reports` repo.
- [ ] **Brand + i18n:** RaceLab palette (`#E10600`/steel/gold), "Race**Lab**" wordmark, card watermark, FR/EN.
- [ ] **Data-capture (Tier B, off advice path):** Speedhive (`SPEEDHIVE_MOCK`), Open-Meteo weather fill, server backup/restore.

---

## RISKS (top)

- **D18 advice-path purity** — weather/speedhive/server must never leak onto `recommend`/`planRaceDay`/`RaceEngineerChat.handle`. Add an explicit "no network on advice path" test.
- **Never-wipe during Phase 2** — test cold-boot against real on-device blobs; preserve MP11 seed + quarantine.
- **Mock determinism** — `SOCIAL_MOCK`/`SPEEDHIVE_MOCK` fixed timestamps must stay byte-stable through re-port.
- **Import-path churn** — Phase 0 alias first to avoid repeated breakage.
- **Scope** — this is a multi-week, multi-session migration; logo + French work is paused behind it per your call.
