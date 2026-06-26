# RaceLab — Feature & Changes Specification

> The authoritative list of everything RaceLab does and is meant to do, reconciled
> against the actual codebase (worktree `theo/racelab`, 2026-06-13). Built from
> Théo's pilot feedback across every round + a 5-domain code audit.

**RaceLab** (public-name candidate **GripLab**, D19) is an RC-racing companion: a
**run log** (L1) → **run comparison** (L2) → a deterministic 8-part **engineer report**
(L3) → **driving-adaptation tips** (L4), wrapped around a multi-car garage, a track
library, versioned setup sheets, a race planner and a pit-strategy calculator.

**Hard invariant — D18:** the advisor is **100% deterministic, on-device, no API on the
advice path**. Every recommendation cites a page-sourced KB rule (grounded or silent).
The autofill datasets are bundled, never fetched, so they don't break D18. Team: William
(product / DA / KB / monetization) + Théo (app / backend).

### Legend

| | Meaning |
|---|---|
| ✅ | Shipped and working in the app |
| 🟡 | Partial — built but incomplete, behind a flag, or not fully wired |
| ⬜ | Planned — specified, not yet built |

---

## 1 · Onboarding & Account

| Feature | Status | Where / Notes |
|---|---|---|
| **First-launch gate** — app blocks on onboarding until done | ✅ | `App.tsx` (`account.onboarded` gate); `screens/OnboardingScreen.tsx` |
| **Step 1: pitch + email** (optional) | ✅ | Email optional; "I'll connect later" ghost button |
| **Step 2: quick profile** — age, country, experience level | ✅ | Levels: beginner / club / regional / pro → stored on the account |
| **Web-first account** — created on griplab.app, not in-app (avoids the store cut) | ✅ | "Cheaper on the web" card in onboarding + Settings; `Linking` to griplab.app |
| **15-day free trial** | ✅ | `accountstore.ts` `PRICING.trial_days = 15`, `trialDaysLeft()`; `TrialBanner` |
| **Pricing 9.99 €/mo · 99.99 €/yr** | ✅ | `PRICING = { monthly_eur: 9.99, annual_eur: 99.99 }` (D29 — awaiting William's final sign-off) |
| **Trial enforcement** — lock premium when trial expires | ⬜ | Countdown is cosmetic only; no entitlement gating yet |
| **In-app purchase flow** | ⬜ | Intentionally web-first; no StoreKit/IAP by design |

## 2 · Settings (built from scratch)

| Feature | Status | Where / Notes |
|---|---|---|
| **Gear entry, tab bar stays live** | ✅ | `App.tsx` header gear → `SettingsScreen` in an in-body Overlay |
| **Driver profile** — level (editable), country, age | ✅ | `screens/SettingsScreen.tsx` |
| **Career stats + yearly stats** (runs/tracks/races/podiums/wins/best lap) | ✅ | `driverStats(logbook, year?)` in `packages/logbook` |
| **Account & billing** — trial countdown, web subscription link | ✅ | Web-first copy, `Linking` to griplab.app, warn colour ≤ 3 days |
| **Preferences — language (en/fr), units (metric/imperial)** | 🟡 | Persisted in `accountstore` `prefs`; **not yet applied screen-by-screen** (i18n/units rollout pending) |
| **Data & privacy + about** copy | ✅ | On-device promise, version, grounded-or-silent note |

## 3 · Garage

| Feature | Status | Where / Notes |
|---|---|---|
| **Multi-car garage** | ✅ | `packages/garage` `CarEntity`/`GarageState`; `screens/GarageScreen.tsx` |
| **Precise car ID card** | ✅ | brand/model/category/scale/drivetrain/power/engine|motor/esc/battery/transponder |
| **Typology custom labels & badges** (nitro/EP sections, brand/scale/category badges) | ✅ | `sheetProfile(car)` in `packages/garage` drives sheet section hiding + label overrides + badges |
| **Fuel tank in cL** (not cc) | ✅ | `CarEntity.fuel_tank_cl`; `fuel_tank_cc` deprecated + auto-migrated (125cc→12.5cL) |
| **Weight field removed** | ✅ | dropped from `NewCarForm` |
| **"Options installed" moved to the Sheet section** | ✅ | edited in `SheetScreen` SetupList, persisted to `CarEntity.options` |
| **Autofill brand / model / engine / motor** | ✅ | `AutofillInput` + `rcdata` (24 brands / 274 models / 28 engines / 29 electric) |
| **Engineer button removed from car cards** | ✅ | redundant CTA dropped (was just a tab jump) |
| **Ranking in competitive sessions** (P + field size) | ✅ | `RunFormV2` captures `position`/`entrants` for quali/main |
| **Podium animation** on a recorded P1–P3 | ✅ | `components/PodiumSplash.tsx` (Animated trophy + confetti, self-dismiss) |
| **Per-car mood line + season odometer** | ✅ | `carStatus` / `seasonStats` derived from that car's runs |
| **Log-run from a car card pre-selects that car** | 🟡 | `onLogRun(carId)` is plumbed but `App.tsx` ignores the id; form defaults to last/first car |

## 4 · Setup Sheet

| Feature | Status | Where / Notes |
|---|---|---|
| **Garage "Setup sheet" → that car's sheets directly** | ✅ | `focusCarId` opens the car; `SheetScreen` |
| **Direct entry → car list (name + setup count) → setups** | ✅ | `CarPicker` → `CarSheets` |
| **Setup list; tap a setup to see its detail** | ✅ | `SetupList` (working draft + saved versions, KIT badge) → `SheetEditorScreen` |
| **Custom labels by brand & car type** | ✅ | `sheetProfile` label overrides + section hiding |
| **Geometry ranges widened to real pilot values** | ✅ | ride height 15–40, camber 0–5°, toe ±4°, drop ≤130mm, sway 2.0–3.2, shock 100–2000, diff 1k–1M |
| **Pistons + drop moved into the Shocks section** | ✅ | `SheetEditorScreen` section matchers |
| **"droop" renamed to "Drop"** | ✅ | labels say Drop (field ids stay `droop_*` — KB rules cite ids) |
| **Oil-brand choice for diffs & shocks** | 🟡 | fields exist in KB templates (`diff_oil_brand`, `front/rear_shock_oil_brand`) but render as plain text, **not autofill-backed** yet |
| **Tires: brand / profile / hardness via autofill** | 🟡 | fields exist (`tires_*_brand/profile/compound`); dataset ready (`tireBrands` 14/57 lines), but the sheet renders them as text — autofill wiring pending |
| **Immutable versioning + diff vs kit / vs version** | ✅ | `packages/sheets` (`saveVersion`, `diffValues`, locked kit baseline) |

## 5 · Tracks

| Feature | Status | Where / Notes |
|---|---|---|
| **Standalone Tracks section** | ✅ | `screens/TracksScreen.tsx` |
| **Corner-by-corner (optional)** — direction, shape, features (bump/dip/kerb/slope/off-camber/banked/jump/rut), surface override, note | ✅ | `TrackForm` corner editor; `CornerSpec` in `packages/tracks` |
| **Quick traits checklist** (ergonomic default) | ✅ | `TRACK_TRAITS` multi-chips |
| **Corner name field** next to direction | ✅ | `CornerSpec.name`; shown as "#3 L hairpin « le triple »" |
| **Multiple surface choice** (not unique) | ✅ | `TrackEntity.surfaces[]`; `surface` stays primary for the engine |
| **Public / private** | 🟡 | flag captured & badged; **public library needs sync** (not shipped) |
| **Track photos** | ✅ | expo-image-picker thumbnails |
| **GPS via current location / map pin** | ✅ (location) / ⬜ (map) | `expo-location` "use my current location"; map-dot picker not built |
| **Manual lat/lon/length/width removed** | ✅ | replaced by the location pin; length/width dropped |
| **Lap records by category/conditions, auto-updated from runs** | ✅ | `upsertRecord` on run save (keeps the fastest) |

## 6 · Run Log

| Feature | Status | Where / Notes |
|---|---|---|
| **Car selector + "new car" popup** | ✅ | `RunFormV2` controlled selectors; `NewCarForm` in an Overlay |
| **Track selector + "new track" popup** | ✅ | `TrackForm` reused as a popup |
| **Setup selector + "new setup" popup** | ✅ | `NewSetupPopup` (kit-baseline init even for never-opened cars) |
| **Date + time, before session type** | ✅ | "When" section; ISO composed at save |
| **Session type** (practice/qualifier/main) | ✅ | chips |
| **Session duration** field (below type) | ✅ | `duration_min` |
| **"Add weather" via meteo API; greyed auto fields, tap to override** | ✅ | `weather.ts` (Open-Meteo, keyless); per-field auto/touched state; needs track GPS |
| **Conditions chips** (grip/bumpiness/dusty/sky/evolution) | ✅ | from v1 idioms |
| **Speedhive lap import via transponder** | 🟡 | client done (`speedhive.ts`); **mock flag on** until a real chip is linked |
| **Manual best lap + avg lap + lap list (+)** | ✅ | `LapListInput`, derived best/avg via `lapStats` |
| **Big feedback block** — free-text general notes, NLU auto-tagging | ✅ | `parseFeedback` engine NLU, additive symptom/phase chips |
| **Per-corner notes** (per the track's corners) | ✅ | rendered when the track has corners |
| **Note-by-corner autofill** | ✅ | `AutofillInput` over a pit-lane phrase lexicon |
| **Driver feeling colour slider** (red→green→violet) | ✅ | `FeelingSlider` |
| **Fatigue removed** (feeling only) | ✅ | fatigue dropped from the form |
| **Fuel-used / laps-in-run removed; "Autonomy test" fold** (time + laps) | ✅ | nitro only; feeds the pit strategy (`result.autonomy_test`) |

## 7 · Runs Recap

| Feature | Status | Where / Notes |
|---|---|---|
| **Sort: date / best / avg / feeling / by-setup** | ✅ | `sortRuns` + `groupBySetup` |
| **Slim, identifiable run cards** | ✅ | `SlimRunCard` |
| **Compare & Engineer in a floating action bar** (not per-card) | ✅ | select 1 → rate + Engineer; select 2 → Compare |

## 8 · Compare

| Feature | Status | Where / Notes |
|---|---|---|
| **Two-run comparison** — setup changes vs condition drift vs tyre changes + verdict | ✅ | `compareRuns` (`packages/logbook`); `CompareScreen` |
| **"Compare" as a verb** — opens from run selection, not a tab | ✅ | floating bar → body overlay; resolves setups across both cars |

## 9 · Engineer

| Feature | Status | Where / Notes |
|---|---|---|
| **3 tools lead the UI as feature cards** (setup engineer / race planner / pit strategy) | ✅ | `EngineerHubScreen` FeatureCards |
| **Past reports with a category tag, after the tools** | ✅ | tagged history (REPORT / RACE PLAN / STRATEGY) |
| **New report = pick a run + optional notes** | ✅ | `RunPicker` |
| **8-part deterministic report** (diagnosis→primary→secondary→don't-touch→expected→tips→confidence→why) | ✅ | `buildReport` in `packages/engine` (eval 28/28) |
| **"Couldn't ground it → add more notes" ask** | ✅ | shown when the engine can't cite a rule |
| **Iterative loop** (test → come back with 2 sessions → refine) | 🟡 | history accumulates + one-shot from a run; explicit multi-session refine flow not built |
| **Pit Board report layout** — verdict-first, tiles, folds, colour/weight hierarchy | ✅ | `RunReportCard` (Théo's chosen architecture) |
| **Interactive engineer chat** | ⬜ | `EngineerScreen.tsx` exists but is **dead code** (unrouted); superseded by the report-first hub (D28) |

## 10 · Race Planner

| Feature | Status | Where / Notes |
|---|---|---|
| **Compound training runs + race-day forecast → setup + technique adjustments** | ✅ | `buildRacePlan` in `packages/engine` |
| **Select ≥1 run, race date/time/length/type** | ✅ | `RunPicker` (multi) |
| **Track-first selection** (runs shown relate to the race) | ✅ | track chips filter the run list |
| **Button to race strategy** | ✅ | CTA under the verdict |
| **Pit Board plan layout** (redesign — was the ugliest) | ✅ | `RacePlanView` (verdict + pace/confidence/tips tiles + folds) |

## 11 · Race Strategy

| Feature | Status | Where / Notes |
|---|---|---|
| **Time-first pit plan** — talks TIME, not laps | ✅ | `packages/strategy` `pit_at_s` ("Box at 5:50, 12:05…"); `PitPlanView` timeline |
| **Prefilled from the race plan** (length / type / pace) | ✅ | `openStrategyFromPlan` |
| **Autonomy = time to burn a full tank** (tank & per-lap consumption removed) | ✅ | `StrategyInputs.autonomy_s` only |
| **Autonomy autofill from a practice autonomy test** (same track/conditions) | ✅ | `bestAutonomy(runs, …)` greyed autofill, tap to override |
| **Direct entry → pick practice runs on a track** | ✅ | `strategy_pick` track-first picker |
| **Pit-loss input + margin selector** (none / 1 lap / 2 laps / 30s) | ✅ | `pit_loss_s`, `margin_s` |
| **Endurance stint-stretch options** (+1/+2 laps, reduces stops) | ✅ | `stretchOptions` |
| **Tyre-cliff detection → pit decider** (endurance, if fuel window allows) | ✅ | `detectTyreCliff`; `pit_driver: "tyre_cliff"` |
| **+2s start buffer removed** | ✅ | dropped per pilot feedback |
| **Explanations kept, raw calculations removed** | ✅ | `notes[]` in pilot language; no lap math shown |
| **Auto-compound "the weekend / last 5 closest-condition trainings"** | 🟡 | user selects practice runs manually; automatic weekend/closest-condition selection not built |

## 12 · Speedhive

| Feature | Status | Where / Notes |
|---|---|---|
| **Link once by transponder, poll on app open** | ✅ | `App.tsx` launch check; transponder on `CarEntity` |
| **"NEW RUN DETECTED" banner → prefilled log form** | ✅ | banner → `RunFormV2` with best/avg/date/time |
| **Real practice-api client** (public, Origin-header gated) | ✅ | `speedhive.ts`; verified live in `docs/research/speedhive-api.md` |
| **Live backend on by default** | 🟡 | `SPEEDHIVE_MOCK = true` until a real chip is tested (code flag, no UI toggle) |
| **Queue multiple new sessions** | ⬜ | only the newest unlogged session is surfaced per launch |
| **Account-lookup / Event Results API / OAuth (private sessions)** | ⬜ | researched, not implemented (practice path only) |

## 13 · Global UX

| Feature | Status | Where / Notes |
|---|---|---|
| **Tab bar always functional from any form** | ✅ | every form is an in-body `Overlay` (no `Modal`); tab bar is a sibling of the body |
| **Cross-tab intents reset on direct tab entry** | ✅ | runs-in-form / engineer-run / compare / settings / prefill all cleared |
| **Android hardware-back handling for overlays** | ⬜ | back is only the in-screen "‹" chevrons; OS back is unmanaged |

---

## 14 · Reference data & research (`docs/research/`)

| Dataset | Status | Contents |
|---|---|---|
| **RC catalog** (`rc-catalog.json`) | ✅ | 25 categories · 24 brands / 274 recent models · 11 engine + 11 electric brands |
| **Setup fields** (`rc-setup-fields.json`) | 🟡 | 16 category groups · ~900 fields (type/unit/min/max/step). **Researched but not yet wired into the runtime KB** — app ships MP11 + generic-offroad templates only |
| **Surfaces & gear** (`rc-surfaces-gear.json`) | ✅ | 25 surfaces · 14 tire brands / 57 lines · 9 oil systems · 5 spring systems |
| **Speedhive API** (`speedhive-api.md`) | ✅ | endpoint tables, auth model, live JSON samples |
| **Bundled autofill** (`apps/mobile/src/rcdata.json`, 18KB) | ✅ | flattened subset feeding `AutofillInput` (offline, D18-safe) |

## 15 · Business model

- **Web-first subscription** on griplab.app — avoids the 30% app-store cut (the whole reason
  account creation is pushed to the web).
- **15-day free trial**, then **9.99 €/month** or **99.99 €/year** (D29, pending William sign-off).
- The app shows pricing and links out; it never takes payment in-app.

## 16 · Engineering invariants & architecture

- **D18** — deterministic, on-device advisor; no network on the advice path (autofill/weather are
  data-capture only, never feed the engine).
- **D13** — engine/nitro-tuning questions are refused (canned), grounded-or-silent everywhere else.
- **Pure-function packages** imported by relative path into the Expo SDK 56 app:
  `engine` · `logbook` · `sheets` · `garage` · `tracks` · `strategy` · `kb`. Each: `npm test` green,
  corrupt-safe persistence with format migrations. Engine eval **28/28**.
- **Stores** (`apps/mobile/src/*store.ts`): AsyncStorage, never-wipe `:backup` on corrupt blobs.

---

## 17 · Still to do (backlog)

**Wire the data we already have**
- ⬜ Load `rc-setup-fields.json` (16 category groups / ~900 fields) into the runtime KB so sheets
  match each car's category/scale/motorisation — today only MP11 + generic-offroad ship.
- 🟡 Make the new sheet fields autofill-backed: **oil brands** (diffs/shocks) and **tires
  brand/profile/hardness** currently render as plain text instead of `AutofillInput`.
- 🟡 Surface the richer oil/spring guidance (`rc-surfaces-gear.json` keeps 9 oil systems + 5 spring
  systems; the bundle drops them to 8 oil names).

**Finish partially-built features**
- 🟡 Apply **language/units prefs** across screens (currently stored, not applied).
- 🟡 Flip Speedhive off mock (`SPEEDHIVE_MOCK = false`) once a real transponder is tested; add a
  settings toggle; queue multiple new sessions.
- 🟡 Engineer **iterative loop** ("bring me 2 more sessions and I'll refine").
- 🟡 Race-strategy **auto-compounding** (weekend / last-5 closest-condition selection).
- 🟡 Log-run from a car card should **pre-select that car** (`onLogRun(carId)` is ignored today).

**Planned**
- ⬜ Trial **entitlement gating** (expiry currently cosmetic).
- ⬜ **Public track library** sync (visibility flag has no effect yet).
- ⬜ Track location **map-pin** picker (only current-location is wired).
- ⬜ Android **hardware-back** handling for overlays/Compare.

**Cleanup (audit findings)**
- 🧹 `screens/EngineerScreen.tsx` — dead code (the interactive chat is unrouted; hub superseded it).
- 🧹 `components/FeelingSlider.tsx` `FatigueRow`/`Battery` — orphaned since fatigue was removed.
- 🧹 `apps/mobile/src/carstore.ts` — legacy single-car profile, superseded by the multi-car garage.
- 🧹 Confirm `components/RunForm.tsx` (legacy v1) is unrouted; remove if so (RunFormV2 is the live one).
- 🧹 `reportstore.ts` has lighter validation + no `:backup` stash vs the other stores.

---

## 18 · Decisions reference

| D# | Topic |
|---|---|
| D13 | Engine/nitro tuning → canned refusal |
| D18 | Deterministic, on-device, no-API advisor (hard invariant) |
| D19 | Public name candidate: GripLab |
| D21 | Versioned setup sheets (`packages/sheets`) |
| D22 | Run log + garage-as-pit-wall + 8-part report |
| D23/D24 | Driving-adaptation tips · Android-emulator-first |
| D25 | Tracks as first-class entities |
| D26 | Multi-car garage + typology sheet labels |
| D27 | Run form v2 (the data gold mine) |
| D28 | Engineer hub, report-first |
| D29 | Pricing 9.99/99.99 + 15-day trial (awaiting William) |
| D30 | Race planner + time-first pit strategy |
| D31 | Speedhive integration (transponder, practice API) |

*Generated 2026-06-13 from the codebase audit + the full pilot-feedback history.*
