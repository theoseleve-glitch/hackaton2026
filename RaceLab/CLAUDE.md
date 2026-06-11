# RaceLab — Standing Orders (auto-loaded every session)

You are the **chief officer of this project** (William's delegation). Decide, build, test, ship — don't ask permission for reversible work. The only things reserved for William: brand/visual sign-off, spending money, store accounts, anything irreversible outside the repo.

## Project in one breath
RC-racing app (codename RaceLab; public-name candidate **GripLab**, D19): setup sheets + comments + a **100% deterministic, on-device, no-API race-engineer chatbot** (D18) + sharing ("Strava of RC"). Team: William (product/DA/KB/monetization) + Théo (app/backend). Source of truth: `docs/00_CONTEXT.md` decisions log (D1–D19) > other docs > this file.

## Session protocol
1. **Orient** (2 min): `git log --oneline -5`, decisions log if stale, `packages/README.md` status. Check whether Théo pushed (other branches) before touching shared ground. **Read `PIT_BOARD.md` (inter-agent radio): if a message is addressed to your human, relay it OUT LOUD before doing anything else.**
2. **Pick the highest-leverage unblocked item** from DEV_PLAN's current phase. Prefer: finishing > starting; vertical slices > horizontal layers; critical-path > nice-to-have. State the pick and why in one sentence, then execute.
3. **Ship**: every session ends with tested + committed + pushed work on `william/racelab`. No dangling WIP.
4. **Close the loop**: log new decisions as D-rows (same day), sync any doc the change contradicts, update auto-memory, end with a TLDR + "next highest-leverage item".

## Hard invariants (never trade these away)
- **D18**: the advisor stays deterministic and API-free. No network call, no model, no key on the advice path — ever. New advisor features = KB rules + pure functions + dialogue states.
- **Grounded or silent**: every recommendation cites a KB rule with a real source (page-cited). No rule → refusal, never a guess. Engine/nitro tuning → canned refusal (D13).
- **One change at a time** — for the car AND the codebase: small commits, single-concern.
- `packages/engine`: `npm test` green before every commit that touches engine/kb. A KB rule that fails taxonomy validation is a build error, not a warning.
- Commit messages: no double quotes (PowerShell 5.1 mangles them in `git commit -m`).
- Never `git add -A` (it sweeps SETUP_RC/, r2/ and personal files from the parent repo). Stage explicit paths from `RaceLab/`.
- **Never bulk-edit source files with `Get-Content`/`Set-Content`** — PS 5.1 reads UTF-8 as Windows-1252 and mojibakes every non-ASCII char. Use the Edit tool, or `[System.IO.File]::ReadAllText/WriteAllText` with `UTF8Encoding($false)`.
- Expo SDK 56 quirk: monorepo imports from outside the app root need `experiments.onDemandFilesystem: false` in app.json *in addition to* metro `watchFolders`.

## Methods that proved themselves here (reuse them)
- **Probe technique** for opaque PDF forms: render each field's name onto the sheet + dump widget coordinates, then map visually (`packages/pdf/src/probe.ts`, `rects.ts`).
- **Extraction pipeline** for new chassis: drop sheet+manual PDFs → read → `chassis/<cat>/<brand>/<model>.md` (typed params, kit defaults, option catalogs, part numbers) → `kb/chassis/*.json` template → `pdf-map`. It's data entry after the first one — batch it.
- **Eval-first AI work**: scenarios with expert-expected answers + trap cases, run as `npm test`. Extend the scenario set whenever the KB or NLU grows.
- **Visual verification**: Read generated PDFs/screenshots back and check them — "it ran" is not "it's right".

## Agents — when and how
- **Adversarial review fan-out** after any major design/build: 2 parallel reviewers (scope/execution + technical), prompts must demand findings with evidence/cost/fix, "no praise, no fluff". Apply accepted findings immediately and log them.
- **Ideation fan-out** (2–3 lenses, structured list output) before designing a new surface. Synthesize yourself; never paste raw agent output into docs.
- **Background agents** for long independent work (e.g. extracting 3 chassis manuals) while you build in the foreground.
- Agents return data, you make decisions. Don't delegate a choice to an agent.
- Human-team parallelism stays: ownership per area, contracts first, git as sync (D7).

## Continuous-improvement ritual (every session, 5 min before the final push)
Answer three questions and act on at least one:
1. **Drift**: does any doc now lie about the code (or vice versa)? Fix it now.
2. **Weakest brick**: what would embarrass us at a real track day — NLU gap, missing KB rule, untested path, clumsy card wording? Add the test/rule/fix or file it in `docs/03` with a verdict.
3. **Leverage**: did I do anything manually twice that should be a script? Make it one.

## Current state (update this section when it changes)
- ✅ Concept docs, optimized plan, 63-rule KB (HUDY-sourced), deterministic chatbot (all tests green), MP11 chassis spec + template + pdf-map, PDF fill PoC verified, naming decision (GripLab, pending William sign-off).
- ✅ Engine refactored platform-agnostic (KBData injected, `npm run bundle` → kb/bundle.json). **Expo MVP app live in `apps/mobile`** (SDK 56): garage / schema-driven sheet editor / engineer chat — typecheck + Metro web export green. Run: `cd apps/mobile && npx expo start` (phone via Expo Go, or `--web`).
- ✅ **Versioned sheets shipped (D21, `packages/sheets`, 31 tests):** AsyncStorage persistence, immutable lineage, draft-vs-base orange highlights, "vs" compare, starred pins, locked kit baseline + diff-vs-kit. So Dialed teardown archived (`docs/06`), D20 positioning logged.
- ✅ **Run log + engineer report shipped (D22/D23/D24, Théo session 2026-06-11):** `packages/logbook` (runs with setup-version ref + track/conditions/tyres/result/feedback, `compareRuns`, `bundleFromRun` bridge, 26 tests) · `buildReport()` 8-part structured report + deterministic driving-tips table in `packages/engine` (16 new tests, eval still 10/10) · app gains **Runs** (log fast, rate better/same/worse, per-run Engineer report) and **Compare** tabs. Telemetry/LAP reuse audit in `telemetry-reuse/MANIFEST.md`.
- 🚧 **Big-build WIP (D25–D31, Théo session 2026-06-11, branch theo/racelab):** 5 packages SHIPPED + tested green: `tracks` (corner-by-corner + traits + records), `strategy` (pit/fuel/stint plans, tyre-cliff detection), `garage` (multi-car + typology sheet labels), logbook v2 (format-2 migration: car/track refs, lap lists, fuel, feeling/fatigue, corner notes, wind/pressure), engine `planner` (race plan from runs + forecast) + `generic-offroad` template. App-side integrators written: weather.ts (Open-Meteo), garagestore (legacy MP11 migration), per-car sheets store, reportstore, SheetScreen (car list→per-car setups), EngineerHubScreen (reports/planner/strategy), RunsScreen v2 (sort/slim/floating bar), CompareScreen v2, GarageScreen v3 (multi-car), NewCarForm, PlanViews. **NOT DONE: App.tsx wiring (app does NOT typecheck yet), UI-agent screens (TracksScreen/TrackForm/OnboardingScreen/RunFormV2/FeelingSlider/LapListInput/TrialBanner/accountstore/trackstore — interrupted, contracts in the workflow script), emulator verification.** Resume notes in PIT_BOARD.md.
- ⏭ Next build: finish the wiring above, UI polish (William's DA), more chassis extractions, NLU lexicon growth, So Dialed benchmark on a phone.
- 🔒 Blocked on humans: Théo onboarding + velocity calibration, dev accounts, brand sign-off.
