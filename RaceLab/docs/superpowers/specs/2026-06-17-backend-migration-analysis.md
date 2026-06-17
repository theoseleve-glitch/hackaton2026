# RaceLab Backend Migration — Architecture Analysis

> Source: a 6-reader mapping pass over both worktrees (`wt-theo-racelab` = theo/racelab, `wt-william-racelab` = william/racelab) + synthesis, 2026-06-17. Feeds `docs/superpowers/plans/2026-06-17-backend-migration.md`.

## 1. Target architecture

A single offline-first Expo app where **William's `packages/schema` is the canonical domain contract** (cars, tracks, runs, weather, account, strategy, outbox, branded ids, vocab, parse, bridge), **`packages/storage` (`openRepos` → `Repos` + same-transaction outbox journal) is the only local source of truth**, and **`server/` Vercel functions + `packages/account` provide Tier-B backup/sync + entitlements** — all of which can be fully down without breaking any client flow. The **engine stays the shared, stable seam** (`RaceEngineerChat`/`recommend`/`parseFeedback` are already common to both forks), upgraded to consume `historyFromTuples` from schema `LearningTuple`s. **All of theo's differentiating surface is re-ported on top of this schema, not deleted**: the entire `social` package, the `logbook` insight/comparison layer, the PNG share/report/profile cards, provenance/`@handle` attribution, and the RaceLab brand. The deterministic advisor keeps its **D18 "grounded or silent / no-API on the advice path"** invariant.

## 2. Old → new mapping (highlights)

- `logbook.RunEntry` → `schema.RunEntry` + `bridge.liftTheoRunEntry` (lift-migrate; required ids, `track:TrackSnapshot`, `result`→`RunTiming`, confidence→`DriverState`).
- `logbook.LogbookState`/`garagestore`/`trackstore` → `storage.Repos.{runs,cars,tracks}` (+ outbox). MP11 legacy via `migrateLegacyBlobs`/`applyMigration`.
- outcome-in-RunEntry → `schema.OutcomeRecord` + `LearningTuple` (adopt William — separates advised-change attribution from self-rating).
- `engine.RaceEngineerChat`/`recommend`/`parseFeedback` → **keep (shared seam)**; feed `ContextBundle.history` via `historyFromTuples`.
- `engine.buildReport`/8-part report → `engine.analyzeRuns`/`EngineerReport` (reshape adapter or re-port card renderers).
- `engine.buildRacePlan` → `engine.planRaceDay` **+** `schema.strategy.planRace` (**split — human decision, see plan OPEN DECISIONS #1**).
- `packages/sheets` → William's `sheets` (byte-identical; just repoint imports).
- `logbook.compareRuns`, insights (`carStatus`/`seasonStats`/`driverStats`/`computeAchievements`/`nextMilestone`/`checkRecords`) → **theo-only; re-port over `schema.RunEntry[]`**.
- **whole `social` package** (`SharedPayload`, `payloadToLink`/`linkToPayload`, `buildSetupPayload`, follows, candidacy, feed) → **William has nothing; keep + repoint at schema**.
- `social.DriverProfile` vs `schema/account.DriverProfile` → **name collision; rename schema's to `OnboardingProfile`** (decision #2).
- `accountstore` → split: entitlement/trial/subscription to `packages/account`; identity (`handle`/`avatar`/`classes`) + prefs (`lang`/`units`) stay theo-local (decision #4).
- `speedhive.ts`/`weather.ts` → `packages/speedhive`/`packages/weather` (adopt, keep mock flags).
- no sync → `server/` 5 endpoints + outbox push/restore loop (Tier B).

## 3. Gaps — William lacks (port, don't delete)

Social graph + share primitives; follows/feed/discover + deterministic `socialnet` mock; track candidacy; public career `DriverProfile`; `compareRuns`; garage-mood/season insights/achievements; outbox domains for `follows`/`candidacy`/`reports`/`weather` (frozen `OUTBOX_DOMAINS` — decision #3); engineer-reports history taxonomy; social identity + prefs on account; PNG card rig; (`pdf` is CLI-only — defer).

## 4. Phasing

0 aliases + vendor net-new packages · 1 adopt schema + reconcile engine/kb/sheets · 2 stores→storage+outbox · 3 engine/planner reconciliation · 4 sheets+runs on schema · 5 re-port social/profiles/retention/comparison/insights · 6 server/sync+entitlements · 7 brand re-apply + FR i18n + cleanup. (Detail + verify per phase in the plan.)

## 5. Risks & decisions

- **D18 advice-path purity** (biggest correctness risk) — entitlements/weather/speedhive/server must never touch `recommend`/`planRaceDay`/`RaceEngineerChat.handle`; add a no-network test.
- **Two-planner reconciliation** — recommend a thin theo `buildRacePlan` façade composing `planRaceDay` + `planRace`.
- **`DriverProfile` collision**, **outbox unfreeze** (William coordination), **account split boundary** — see plan OPEN DECISIONS.
- **Never-wipe** during store migration; **mock determinism** byte-stability; **import-path churn** (alias first).

## 6. Preservation checklist

Advisor (D18, always free) · social share (deep link/.griplab/QR) · follows/feed/discover/you · driver profiles/career card · retention insights · run comparison · PNG cards · provenance · track candidacy · garage/sheets/runs/tracks (D21 versioning, MP11, never-wipe) · account/entitlements (15-day trial, web checkout, offline grace) · engineer history · brand + FR/EN · Tier-B data capture (Speedhive/weather/server).
