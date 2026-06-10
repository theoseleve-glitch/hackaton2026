# RaceLab packages

## `sessions/` — Race log + learning loop (D22)

Pure data + pure functions, no I/O. A session = one track day: TrackInfo (name/surface/grip/conditions) + append-only **runs** (setup version raced, laps, feedback) + **outcome records** (the engineer's better/same/worse verdicts). Hardened invariants: frozen per-record **track snapshots at log time** (changing grip never falsifies history), denormalized `setup_name`, discriminated `addRun`/`recordOutcome` results (dropped data is impossible to miss), write-time NaN guards, deep-freeze surviving deserialize, never-wipe discriminated persistence. `npm test` = 57 checks.

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
