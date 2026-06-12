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
- ✅ **Big-build shipped (D25–D31, Théo sessions 2026-06-11, branch theo/racelab):** 5 packages tested green: `tracks` (corner-by-corner + traits + records), `strategy` (pit/fuel/stint plans, tyre-cliff detection), `garage` (multi-car + typology sheet labels), logbook v2 (format-2 migration: car/track refs, lap lists, fuel, feeling/fatigue, corner notes, wind/pressure), engine `planner` (race plan from runs + forecast) + `generic-offroad` template. App fully rewired: 5 tabs **Garage·Sheet·Tracks·Runs·Engineer**, Compare as overlay from run selection, onboarding gates first launch (15-day trial, web-first account per pricing D29 ⚠ awaiting William), TrialBanner, RunFormV2 (controlled selectors + popup creation, auto-weather greyed/override, lap list, FeelingSlider, corner notes, nitro fuel block), TracksScreen/TrackForm, EngineerHub (report history/planner/strategy). Verified: `tsc --noEmit` clean, all 6 package suites green (engine eval 10/10), Metro web export green. **NOT DONE: emulator verification, Speedhive (deferred D31).**
- ✅ **Théo's live-test pass (2026-06-11/12, 8 items):** Sheet section lands on the setups LIST (tap → detail editor); fatigue = battery chips (5 discharge levels); TrackForm gains 📍 use-current-location (expo-location — nobody knows GPS numbers by heart); NewSetupPopup works for never-opened cars (kit-baseline init); Engineer hub leads with 3 feature cards (setup engineer / race planner / pit strategy), tagged history after; garage Engineer button removed (redundant); competitive runs take position+field size, podiums (P1-3 in quali/main) trigger a confetti splash and feed `driverStats` (career/yearly, tested); ⚙ Settings from scratch (driver profile + stats, account & billing web-first, language/units prefs, data promise, about).
- ✅ **Pilot pass v3 (Théo's deep feedback, 2026-06-12, 7-agent wave + integration):** research datasets in `docs/research/` (25 RC categories + 274 models/24 brands, 897 setup fields/16 category groups, 25 surfaces + 14 tire brands + oils/springs, Speedhive API verified live — practice-api public with Origin header, transponder-linked). App: offline autofill everywhere (`rcdata.json` 18KB + AutofillInput — brand/model/engine/motor/tires/corner-notes), fuel in cL (garage format 2 migration), multi-surface tracks + named corners (tracks format 2), run form gains date/time + session length + autonomy-test fold (replaces fuel/laps; fatigue dropped), strategy package rewritten TIME-first (autonomy_s, pit_at_s, no start buffer; 47 hand-computed checks), engineer hub track-first + strategy prefilled from race plan + bestAutonomy autofill, pit plan = verdict + stint timeline + explanations (no raw math), KB ranges widened to real pilot values + oil-brand/tire-detail fields (eval still 10/10), tab bar ALWAYS functional (Modal→Overlay everywhere), Speedhive check on launch → NEW RUN DETECTED banner → prefilled log form (mock flag on until a real transponder is linked).
- ⏭ Next: engineer-report + race-planner visual redesign (3-4 architectures proposed to Théo), replace deprecated SafeAreaView, real Speedhive transponder test, UI polish (William's DA), more chassis extractions.
- 🔒 Blocked on humans: Théo onboarding + velocity calibration, dev accounts, brand sign-off.
