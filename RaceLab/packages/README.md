# RaceLab packages

> **Contract reference: `../CONTRACTS.md`** — the frozen surface of every package below (what the frontend may import, result shapes, stability promises). This file is the narrative status; CONTRACTS.md is the API.

> **D-number note:** William's backend packages were renumbered D32–D39 at the B0 merge (mapping in `../docs/00_CONTEXT.md`); the refs below use the canonical post-merge numbers.

## `schema/` — Unified domain contract (keystone)

THE source of truth for every domain shape: branded ids, Théo's logbook vocabulary verbatim, cars + chassis registry + dynamic class labels + conditional sheet sections (D34), tracks with turn-by-turn snapshots, weather observations (Patm included) with manual-override provenance, the ultimate run log (discriminated laps-vs-summary timing, tyres, fuel, driver state, per-turn feedback), outcome records with trial-time attribution, account/trial/entitlements (D36), race strategy math (`planRace`, `detectTyreCliff` — D37), the append-only outbox (D39), load-path `parse.ts` validators, and `bridge.ts` lifts for both legacy models (makes B0 mechanical). Pure data + pure functions, zero deps. `npm test` = 203+ checks.

## `storage/` — D11 storage core (D39)

Injected drivers (AsyncStorage-shaped KV / SQL executor / device-only expo-sqlite glue), typed repos for every schema entity, **every mutation journals one OutboxEntry in the same logical transaction**, all reads parse-validated with quarantine-never-wipe, deterministic idempotent legacy-blob migration (never deletes the originals). The outbox is the future backup protocol. `npm test` = 137 checks incl. fault-injection sweeps at every write offset.

## `weather/` — Open-Meteo adapter (B3, Tier B)

Forecast auto-fill + historical backfill for offline-logged sessions, no API key, all I/O injected. Station-level `surface_pressure` = the nitro Patm. Cache with stale-if-offline; archive publication delay handled; manual override wins per-field with provenance. The advisor never imports it (D18). `npm test` = 129 checks against real recorded fixtures. ⚠ free tier non-commercial — licensing call before launch.

## `speedhive/` — Unofficial MYLAPS adapter (B9, D38)

Event results (verified live) + practice API (from William's intercept) behind one isolation layer: URL drift → `ENDPOINTS` only, payload drift → `types.ts`/`import.ts` only. Bearer scoped to the practice host; 401/403 → `auth_required`, never retried; `politePoll` hard 30 s floor; path-unverified endpoints quarantined behind `api.unverified.*`. Lap import is the only producer of `{kind:'laps'}` timing. `npm test` = 130 checks, fully offline.

## `account/` + `../server/` — Trial, subscription, deletion (B5/B6, D36)

Client: 15-day once-ever offline-capable trial, tamper-guarded clock, advisor structurally free, external-web subscribe URL (NO IAP), account deletion with offline tombstone retry. Server (Vercel functions, code-ready/NOT deployed): subscription status, first-seen trial registry, idempotent backup push/restore over the outbox, GDPR-atomic account wipe. `npm test` = 135 checks across both.

## `kb/src/` — KB data validators (B10)

`parseChassisRegistry`/`parseClassDecl` gates over `kb/chassis/registry.json` (11-entry 1/8 TT competition buggy class, identity-facts-only `pending_pdf` entries with provenance) and `kb/classes/1-8-tt-buggy.json`. Malformed KB data is a build error. Canonical facet vocabulary (`offroad`/`1/8`/`buggy`) lives here. `npm test` = 93 checks.

## `sessions/` — Race log + learning loop (D32, William's run-log model; see `logbook/` for Théo's live app model)

Pure data + pure functions, no I/O. A session = one track day: TrackInfo (name/surface/grip/conditions) + append-only **runs** (setup version raced, laps, feedback) + **outcome records** (the engineer's better/same/worse verdicts). Hardened invariants: frozen per-record **track snapshots at log time** (changing grip never falsifies history), denormalized `setup_name`, discriminated `addRun`/`recordOutcome` results (dropped data is impossible to miss), write-time NaN guards, deep-freeze surviving deserialize, never-wipe discriminated persistence. `npm test` = 57 checks.

## App-tier packages (Théo-owned — the live app data layer; surface = each one's `index.ts`)

> These four ship inside the Expo app today. They are Théo's zone (handoff-only for the backend team). The B0 plan is to converge their domains onto `schema` over time (`bridge.ts` already lifts `logbook` → the canonical run model); until then they are the source of truth the app reads/writes.

### `garage/` — Multi-car garage (D26)
`CarEntity` with full typology (brand/model/category/scale/drivetrain/power/engine|motor/esc/battery/tank/transponder); `sheetProfile(car)` derives sheet section visibility + label overrides + badges deterministically; `generic-offroad` fallback template; per-car sheet storage with legacy-MP11 migration.

### `logbook/` — Run log v2 + compare + report bridge (D27)
The app's live run model (format-2 migration: car/track refs, lap list, fuel in cL, feeling slider + fatigue, per-corner notes, extended weather); `compareRuns` (setup-vs-condition-vs-tyre drift + verdict); `bundleFromRun` bridges a run into the engine's `ContextBundle`. `driverStats` (career/yearly/podiums). **Converges onto `schema` runs via `schema/bridge.ts` (`liftTheoRunEntry`).**

### `tracks/` — First-class tracks (D25)
Quick traits checklist + optional corner-by-corner editor (`CornerSpec`: direction/shape/features/surface/note), multi-surface, GPS, lap records auto-maintained from runs; traits map deterministically to engine condition tags.

### `strategy/` — TIME-first pit strategy (D30)
Pit/stint plans that talk TIME not laps (`pit_at_s`, autonomy-from-a-practice-test, pit-loss + margin, endurance stint-stretch, tyre-cliff as pit decider). **Théo's app-tier predecessor of `schema/strategy.ts`** (`planRace`/`detectTyreCliff` = the canonical unified math the schema-rewire retires this duplicate for.)

## `sheets/` — Setup versioning + diff (D21)

Pure data + pure functions, no I/O — bundles into the app unchanged. Immutable, deep-frozen, append-only `versions[]` with `parent_id` lineage (kit baseline = locked root, globally-unique ids); ONE mutable `draft` branched from a base version; **diffs always computed, never stored** — draft-vs-base IS the editor's orange highlights, the same function powers "vs" compare and diff-vs-kit. Versioned serialization with a discriminated result (`corrupt` / `unknown_format` / `wrong_template`) so a format bump can never silently wipe history. Survived an adversarial review fan-out (3 ⛔ findings fixed pre-commit). `npm test` = 31 checks.

## `pdf/` — Setup-sheet PDF export (D12: fill, never redraw)

Reference implementation of the per-chassis `pdf_map` pipeline against the real Kyosho MP11 editable sheet:

- `src/list-fields.ts` — enumerate a blank sheet's AcroForm fields
- `src/probe.ts` — render every field's own name onto the sheet (how the map was built)
- `src/rects.ts` — dump checkbox widget coordinates (column/row matching for opaque names)
- `src/fill.ts` — **the demo**: canonical setup JSON + `kb/chassis/inferno-mp11.pdf-map.json` → filled, flattened official sheet (`npm run fill` → `out/demo-setup.pdf`). Verified pixel-faithful: 51 fields land exactly where they belong, including the diff-table checkboxes.

Finding: only ~49 of the MP11 sheet's visual boxes are real form fields — the rest (bushing grids, hub widths, clutch springs…) need D12's overlay mode. Completing the map is data entry, not code.

## `kb/` — Tuning Knowledge Base (data only)

The AI race engineer's brain (docs/04 §3). Pure data, reviewed by William, ships inside the app bundle for the offline path (D13).

- `taxonomy.yaml` — feedback-tag taxonomy (symptom × phase × evolution), condition vocabulary, and the engine-scope refusal keywords/text (D13)
- `rules/*.yaml` — **63 cause→effect tuning rules**, every one sourced from the HUDY Off-Road Set-Up Book (page-cited) with effects, conditions, counter-indications, magnitude guidance, reversal cost and confidence
- `chassis/inferno-mp11.json` — machine-readable MP11 template (canonical setting ids + legal values); **the template IS the guard layer's bounds database**

Adding a rule = adding YAML; the engine validates every rule against the taxonomy at load time (unknown symptom/condition = hard error).

## `engine/` — Race Engineer chatbot (deterministic, no API — D18)

TypeScript implementation of the docs/04 §4 pipeline. **Zero external dependencies at advice time**: no LLM, no API key, no server — it runs entirely on-device.

```
driver text → deterministic NLU (nlu.ts: pit-lane vocabulary → symptom × phase
tags + condition hints) → engine-scope refusal (D13) → dialogue state machine
(chat.ts: asks the one clarifying question, runs the better/same/worse loop)
→ pure-function KB retrieval (retrieval.ts) → race-day filter (guard.ts)
→ templated card rendered from the rule itself (offline.ts)
```

### Run it

```sh
cd packages/engine
npm install
npm run chat                # interactive chatbot REPL (talk to your race engineer)
npm run chat -- scenarios/01-push-mid-corner-low-grip.json   # with that session context
npm run cli -- scenarios/01-push-mid-corner-low-grip.json    # one-shot card
npm run bundle              # recompile packages/kb/bundle.json (run after ANY KB change)
npm test                    # NLU cases + scripted conversations + 10 eval scenarios
```

**Architecture (since the app refactor):** the core (`index.ts` surface — chat, engineer, nlu, retrieval, guard, offline, data) is pure data + pure functions with zero node built-ins, so it bundles into React Native unchanged. All knowledge is injected as `KBData`; node tooling loads it via `node-kb.ts` (fs/yaml/zod live only there), the app imports the pre-compiled `packages/kb/bundle.json`.

### Status

- ✅ **NLU 19/19** pit-lane phrasings parsed ("loose under braking" ≠ "loose on power")
- ✅ **Conversation tests green**: clarifying question, outcome loop (worse → revert + next), race-day mode, engine-question refusal, new-problem interrupt
- ✅ **Eval 10/10** (8 real scenarios + 2 nitro-engine traps)
- ✅ Citations valid by construction — the card IS the retrieved rule, rendered
- 🗃 An LLM-backed variant existed and was removed per D18 (git `d8a8b81`) — possible V2 premium prose layer, never a dependency
- ⏳ Next (Gate A): run the same scenarios against So Dialed's AI Mechanic and compare
