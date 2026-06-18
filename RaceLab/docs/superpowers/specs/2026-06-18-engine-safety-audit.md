# RaceLab Engine Safety Audit — ship-decision report

> 3-pass audit (KB rules / pipeline / adversarial 3044-input run) + synthesis, 2026-06-18. Verdict: SHIP-WITH-FIXES. Drives the pre-ship safety hardening.

## SHIP-DECISION REPORT

This is a synthesis task — I have all three audits inline. No tool calls needed; I'll reconcile the three sources and produce the ship-decision report.

The key reconciliation point: the pipeline audit says "SAFE TO SHIP (with caveat)" but the adversarial run found 3 invariant FAILURES, and the KB audit says "NOT SAFE." The adversarial run is the ground-truth arbiter on the engine; the KB audit is the ground-truth arbiter on advice content. I weigh those.

---

# SHIP-DECISION SAFETY REPORT — RaceLab Deterministic Race-Engineer

## 1. VERDICT: **SHIP-WITH-FIXES**

Ships tomorrow **only after the 3 engine-robustness fixes + the 3 highest-risk KB content fixes land**. The core architecture is sound — grounded-or-silent, determinism, and do-not-touch invariants held across **3044 inputs + 7 dialogues with zero violations**. There is **no crash on any input the live UI produces today**, and the only fully-mapped production chassis (`kyosho-inferno-mp11`) is **100% clean (0 violations)**.

But three things must not ship as-is: (a) two raw-`Error` throws that break the grounded-or-silent contract at the boundary, (b) `NaN` leaking verbatim into user-facing advice text, and (c) three KB rules that give **physically dangerous advice with no enforceable bound** to people tuning real cars. None are deep architectural problems; all are bounded, concrete, fixable tonight. Hence SHIP-WITH-FIXES, not DO-NOT-SHIP.

Decisive caveat that gates the verdict: **`generic-offroad` must NOT be exposed in the shipped build.** If it is reachable in product, this flips to **DO-NOT-SHIP-UNTIL** that template's fields are remapped (3224 of 3229 violations live there).

---

## 2. MUST-FIX BEFORE SHIP (ordered by risk)

**M1 — Dangerous KB advice with no enforceable limit (rear camber).** `kb-camber-rear-less-negative-210`. *Severity: HIGH (physical-harm).* Guidance says "don't go past ~-1°" — a vague target, not a bound; past the critical angle the rear contact patch collapses and the car snaps loose mid-corner. **Fix:** add an absolute hard limit (`max_rear_camber: -1.5°, never exceed`) surfaced in the advice text + counter-indication, and state the physics (shock-arm-vertical → sudden patch loss). Ship the kit default as the safe anchor.

**M2 — Center-diff overheat risk buried in prose (high-power engines).** `kb-diff-center-thinner-003`. *Severity: HIGH (physical/mechanical-failure).* The "very thin center oil can cook" caveat sits in `magnitude_guidance`, not in `counter_indications`. On a high-power engine this can seize the diff and lose drive at speed. **Fix:** elevate to a structured field (`engine_power_requirement: high` gate) + an explicit `counter_indication`, with a concrete ceiling ("monitor center-diff temp; do not exceed ~120°C"). Must be front-and-center, not advisory.

**M3 — Nose-dive-off-jumps framed as a quirk, not a constraint.** `kb-rideheight-rake-forward-208`. *Severity: HIGH (crash/chassis-break).* Effect is worded "may cause nose-diving off jumps" / `more_likely` — too weak for a crash mode. The `nosedive_jumps` counter-indication exists but the language doesn't gate it. **Fix:** add an explicit scope caveat ("NOT recommended on tracks with big jumps; smooth/flat layouts only") and harden the effect to `nosedive_off_jumps: likely_if_big_jumps`.

**M4 — Unknown chassis template throws a raw Error instead of refusing.** `engineer.ts:18` (`recommend`) and `report.ts:45` (`buildReport`) call `getTemplate()` (`data.ts:35-42`) unguarded. *Severity: HIGH (contract-break).* Confirmed by the adversarial run: trigger `deg:unknown-template` → **2 violations**, raw `Error: Unknown chassis template '…'`. This breaks grounded-or-silent at the boundary, and is **inconsistent with `plan.ts:60`**, which already handles the identical case in-band as a refusal. **Fix:** mirror the `plan.ts:60` guard in both call sites — return a `kind: "refusal"` with `conditions_echo`, never throw.

**M5 — `NaN` flows verbatim into user-facing advice.** *Severity: MED-HIGH (user-trust / nonsense advice).* Adversarial trigger `deg:nan-setup` → **3 violations**: `weather.air_temp_c: NaN` renders into `conditions_echo` ("…NaN°C…") and report `diagnosis` ("…medium grip clay, NaN°C.") in both `recommend` and `buildReport`. **Fix:** sanitize numeric inputs at the boundary (coerce non-finite → `undefined`/omit) before they reach echo/diagnosis strings; add `isFinite()` guards where temps/laps are formatted (e.g. the `?? "?"` fallback path, `reports.ts:286`, and `race-plan.ts:121`).

**M6 — `generic-offroad` template/KB vocabulary desync (gated, not fixed).** *Severity: HIGH if exposed, else N/A.* Adversarial run: **3224 violations, all on `generic-offroad`** — 18 recommended settings name fields the template lacks (`front_spring`/`front_springs`, `front_camber`/`camber_front`, missing `caster`, `*_track_width`, `*_roll_center`, `front_kickup`, `rear_anti_squat`, `wheelbase`, `ackermann`, `wing_height`). On that chassis "(currently X)" can't resolve and the change can't be looked up. **Fix for ship: confirm `generic-offroad` is NOT selectable in the shipped build** (it's a placeholder; MP11 is the only mapped chassis). If it cannot be hidden, remap its `fields` to the KB rule settings — and that is a blocker, not a follow-up.

---

## 3. SHOULD-FIX / FOLLOW-UP (real, non-blocking)

- **Activate the two dead guards.** `settingUnknownToTemplate()` (`guard.ts:28`) and `invalidCitations()` (`guard.ts:20`) exist but are **never called**. Wire `settingUnknownToTemplate` into `offline.ts:9` (`ruleToOption`) / `plan.ts:102-112` to filter or degrade rules whose setting isn't on the template — this is the proper engine-level fix for M6 and would have caught all 3224. Build-time validation (`data.ts`) currently masks this.
- **KB MED items.** `kb-shock-pistons-smaller-holes-105` (open-ended "one step" with no max — add range + "don't exceed 3 steps"); `kb-shock-pistons-larger-holes-106` (`reduced_on:[smooth,big_jumps]` contradicts its own jump-landing use case — split into rough-track vs. smooth-jump rules); `kb-gearing-taller-008` (engine-temp caveat in a chassis-scoped rule risks violating `engine_scope_refusal` — move or reframe).
- **KB LOW items.** `kb-spring-rear-softer-109`, `kb-diff-front-thicker-002` (counter-indication `understeer` self-contradicts its exit-understeer fix → rename to `understeer_entry`), `kb-camber-front-more-negative-209` (add saturation guidance ~-2°). Clarity, not safety.
- **Explicit NaN/Infinity guards on all numeric outputs** (`avg_lap_s`, `race_avg_lap_s`, temp deltas) even where current guards make them unreachable — brittle today (`race-plan.ts:121`).

---

## 4. WHAT IS ALREADY SAFE (the floor)

Proven by the adversarial run across **3044 inputs + 7 dialogues** (these invariants HELD with zero violations) and corroborated by the pipeline audit:

- **Grounded-or-silent holds.** Every setup change carries ≥1 citation; **all citations resolve to a known KB rule**. Empty KB match → `do_nothing` (race-day) / `refusal` (practice), never a guess. No-rule surface/condition → explicit `OUT_OF_KB_MESSAGE`. `proposePlan()` is the single recommendation entry point.
- **No self-contradiction.** Never the same setting in opposite directions; **`do_not_touch` never overlaps a recommendation**; primary always present; every refusal/do-nothing carries a message.
- **Determinism (D18) verified.** Same bundle twice → **byte-identical JSON**. No I/O, no `Date.now()`, no `Math.random()`, no entitlement/paywall gates on advice (`test-d18-purity.ts`). Pure function of `KBData` + `ContextBundle`.
- **Engine-scope refusal works.** Needle/glow-plug/carb/temp text → hard `engineScopeViolation()` refusal *before* retrieval.
- **Edge cases handled.** Empty feedback → asks for clarification (no recommendation); no history → tier 0 (no re-rank); missing setup values guarded (`offline.ts:15`); empty conditions array `.join()` safe; div-by-zero guarded in `conditionsShift()` (`race-plan.ts:157`).
- **Production chassis is clean.** `kyosho-inferno-mp11` — the only fully-mapped, shippable chassis — produced **0 violations** of any kind.

---

## 5. RECOMMENDED GUARDS (cheap, shipped invariants so unsafe advice can never reach a user)

Add these as **runtime assertions in the output path** (fail closed → refusal, never throw to the user) plus the matching adversarial test as a CI gate. Promote `packages/engine/src/test-safety-adversarial.ts` from untracked to a committed CI test.

1. **`assertGroundedOrRefuse(output)`** — every emitted change has ≥1 citation AND every citation id ∈ retrieved-rule ids (this is what `invalidCitations()` already computes). On violation → return refusal.
2. **`assertSettingOnTemplate(setting, template)`** — call `settingUnknownToTemplate()` before emitting any option; if the setting isn't on the active template, drop the option (would have blocked all 3224 `generic-offroad` violations at runtime).
3. **`assertFiniteNumbers(output)`** — reject/omit any non-finite numeric in user-facing fields (`conditions_echo`, `diagnosis`, `avg_lap_s`, `race_avg_lap_s`, temp deltas). Closes M5 permanently regardless of input.
4. **`assertNoThrowBoundary`** — wrap `recommend()`/`buildReport()` template lookup so an unknown template returns refusal, mirroring `plan.ts:60` (closes M4).
5. **KB build-time bound check** — assert every rule with magnitude guidance carries an enforceable numeric/categorical bound and that physical-risk rules (`*camber*`, `*diff*thinner*`, `*rake*`) declare a `counter_indication` or `danger` field. This makes M1-M3 class regressions fail the build, not the race.
6. **`assertNoOppositeDirections` + determinism snapshot** — keep the two invariants the adversarial run already exercises as standing CI gates so future KB edits can't regress them silently.

**Bottom line:** the floor is solid and the failures are bounded. Land M1-M5, confirm `generic-offroad` is hidden (M6), and add guards 1-4 tonight → safe to ship. Leave `generic-offroad` exposed, or skip the three HIGH KB content fixes, and it is not safe to put in racers' hands tomorrow.

---

## KB RULE AUDIT

Now I have all the rule data. Let me analyze for safety and soundness issues:

## SAFETY AUDIT: RaceLab Knowledge-Base Rules

| Rule ID | Issue | Severity | Why | Suggested Fix |
|---------|-------|----------|-----|---------------|
| kb-camber-rear-less-negative-210 | Dangerous magnitude guidance with insufficient safety bounds | HIGH | The rule warns "don't go past ~-1°" but offers no absolute limit nor clarifies what "letting go abruptly" means mechanically. On real vehicles, loss of traction past a critical camber angle can cause crashes. The ~-1° is a vague target, not an enforceable boundary. | Add explicit maximum camber (e.g., "absolute limit -1.5°; never exceed") and explain the physics: shock arm angle approaching vertical causes tire contact patch to collapse suddenly. Include kit defaults and why they exist. |
| kb-diff-center-thinner-003 | Dangerous condition with overheat risk under-documented | HIGH | The magnitude guidance warns "very thin center oil can overheat ('cook')" but this is buried in guidance text, not in counter_indications. A racer on a high-power engine could push the oil to failure without understanding the risk. No temperature warning or threshold is given. | Elevate the engine-power caveat to a new field: "engine_power_requirement: high" with a note that low/mid-power engines are safe to thin. Add: "Monitor center diff temperature; do not exceed 120°C." |
| kb-rideheight-rake-forward-208 | Dangerous side-effect inadequately warned | HIGH | The rule addresses understeer but states "May cause nose-diving off jumps" as though it's merely a handling quirk. Nose-diving from high-altitude jumps can lead to crashes or chassis breakage. The counter_indication lists nosedive_jumps, but the effect is only probabilistic ("more_likely"), not guaranteed. | Strengthen language: "counter_indications: [nosedive_jumps]" alone is insufficient. Add explicit scope caveat: "NOT recommended on tracks with big jumps; only for smooth/flat layouts." Reframe effect as "nosedive_off_jumps: likely_if_big_jumps". |
| kb-shock-pistons-smaller-holes-105 | Magnitude guidance open-ended; can cause over-application | MED | The rule says "One hole-size step" but does not specify: how many hole sizes exist, what the extremes are, or when to stop. A racer could keep going to maximum pack and bottom out chronically without knowing the limit. | Add: "Shock pistons typical range: 1.2x5 to 1.5x8 holes. Each step reduces rebound speed ~10%. Do not exceed 3 steps from baseline." Include kit defaults in bundle. |
| kb-gearing-taller-008 | Temperature warning is vague and unsupported by rule scope | MED | The magnitude guidance says "watch engine temperature when gearing taller" but this rule is chassis-scoped (differential oil & gearing), not engine-scoped. Engine temperature monitoring is engine tuning and violates the engine_scope_refusal. This creates confusion about whether the rule is giving engine advice. | Move the engine-temperature caveat to a separate engine-scope refusal note, OR remove it entirely and note: "Gearing affects top speed; tall gearing may reduce cooling airflow. If engine runs hotter, re-lean needles per engine manual." Keep chassis rule clean. |
| kb-spring-rear-softer-109 | Magnitude guidance references external document without bounds | LOW | The rule says "Often paired with more anti-squat if the rear squats too much (HUDY p.30)" but does not specify: how much anti-squat, under what conditions, or what "too much squat" means quantitatively. | Expand magnitude_guidance: "One spring step softer. If rear squats >3mm under acceleration, pair with one anti-squat step increase (rule kb-antisquat-more-228). Monitor via slow-motion video or squat gauge." |
| kb-diff-front-thicker-002 | Counter-indication self-contradicts primary use case | LOW | The rule addresses "understeer, phase: corner_exit/on_power" by thickening front diff oil, but lists "counter_indications: [understeer]". This is confusing: thicker front oil is meant to fix understeer exit, but the counter-indication says "don't apply if already pushing". Clarify: the counter-indication means "entry understeer", not exit. | Rename counter_indication and clarify scope: "counter_indications: [understeer_entry]" with comment: "Do not thicken front diff if you already have mid-corner understeer; address mid-corner first." Or: split into two rules (entry vs. exit understeer). |
| kb-camber-front-more-negative-209 | No guidance on detecting saturation (when camber becomes ineffective) | LOW | The rule says "Front camber should make tires wear flat" but does not explain what to do if going more negative stops improving steering and tires start wearing on the inner edge (camber saturation). A racer could keep going negative thinking more is better. | Add: "Front camber effect saturates around -2° on most 1/8 buggies. If more negative does not improve mid-corner turn-in, stop and adjust roll center or track width instead. Tire wear should be flat across the tread; inner-edge wear indicates over-camber." |
| kb-shock-pistons-larger-holes-106 | Conditional conflict: "reduced_on: [smooth, big_jumps]" contradicts use case | MED | The rule is meant for bumpy/rough tracks but is "reduced_on: [smooth, big_jumps]". This means on a smooth track with big jumps (a common pro layout), the rule is actively discouraged, yet the rule is supposed to help with down-ramp landings. A racer on a mixed layout could be confused about whether to apply it. | Clarify conditions: split into two use cases: (1) bumpy/rough → larger holes for better rebound; (2) big jumps with smooth surfaces → smaller holes for pack. Current rule conflates them. Recommend: "Use larger holes on rough tracks; use smaller holes on smooth jump tracks." Create separate rule for jump-landing pack. |

### OVERALL VERDICT

**The rule set is NOT SAFE TO SHIP AS-IS.** Three rules (kb-camber-rear-less-negative-210, kb-diff-center-thinner-003, kb-rideheight-rake-forward-208) pose direct physical risk if followed without understanding the limits:

1. **kb-camber-rear-less-negative-210**: A racer could increase rear camber past the point where traction collapses suddenly, causing an unexpected spin or crash mid-corner. The "~-1°" guidance is too vague for safety on a real car.

2. **kb-diff-center-thinner-003**: On a high-power engine, center-diff oil overheat ("cook") can cause gear failure or seizure during a race, leading to loss of drive. The caveat is buried in guidance, not in front-and-center conditions or counter-indications.

3. **kb-rideheight-rake-forward-208**: Nose-diving off jumps is described as a side effect ("may cause"), not a constraint. On a track with big jumps, applying this rule could result in a crash. The counter-indication exists but the effect language is too weak.

**Required fixes before shipping:**
- Add explicit bounds to all magnitude guidance (e.g., "maximum -1.5° camber; never exceed").
- Elevate overheat/failure risks (center-diff oil, spring preload extremes) to counter-indications or new "danger" fields.
- Split rules that conflate multiple conditions (e.g., kb-shock-pistons-larger-holes-106 should be two rules: bumpy vs. jump-landing).
- Remove or clarify engine-related warnings (engine temperature in gearing rule) to avoid violating engine_scope_refusal.
- Add quantitative thresholds for squat, wear patterns, and saturation effects.

The HUDY Off-Road Set-Up Book sources are solid, but the rules as compiled lack the safety margins and clear limits needed for real-world racer application.

---

## ADVERSARIAL TEST RUN

Done. The script is at `C:/Users/Admin/Documents/wt-theo-racelab/RaceLab/packages/engine/src/test-safety-adversarial.ts` (untracked, not committed).

## What was run

`npx tsx packages/engine/src/test-safety-adversarial.ts` against the **real** KBData (`loadKBData()`, 63 rules, 2 templates). It tested **3044 inputs** through both `recommend()` and `buildReport()`, plus **7 `RaceEngineerChat.handle` dialogues**:
- A dense sweep: 21 symptom combos (single/multi/conflicting) × 4 grips × 9 condition profiles (hot/cold/wet/dusty/bumpy/bluegroove/fastopen/techtight/none) × practice+race_day × both chassis, with sampled surface/tyre-state/evolution/weather.
- 13 degenerate bundles: empty feedback, everything-empty, unknown symptom, garbage out-of-taxonomy conditions, conflicting symptoms on race-day, engine-scope text (needle/glow-plug/carb/temp), NaN setup+weather, unknown chassis template, whitespace-only text, history spam with bogus citations.

## Invariant results (EXACT output)

**HELD (7):**
- Every change has ≥1 citation (grounded-or-silent) — PASS
- All citations resolve to a known KB rule — PASS
- Report/recommendation kind always valid, primary present — PASS
- Refusal/do-nothing always carries a message — PASS
- Never same setting in opposite directions (no self-contradiction) — PASS
- do_not_touch never overlaps a recommendation — PASS
- Determinism: same bundle twice → byte-identical JSON — PASS

**FAILED (3) — 3229 violations total:**

1. **No throw on any input — 2 violations.** An unknown `chassis_template_id` makes `recommend()` and `buildReport()` throw a raw `Error: Unknown chassis template '…'` (via `getTemplate`). Inconsistent with `proposePlan()`, which handles the same case in-band as a refusal. Trigger: `deg:unknown-template`.

2. **No NaN/undefined in user-facing fields — 3 violations.** `weather.air_temp_c: NaN` flows verbatim into `conditions_echo` ("…NaN°C…") and report `diagnosis` ("…Context: medium grip clay, NaN°C."), in both `recommend` and `buildReport`. Trigger: `deg:nan-setup`. No undefined/[object Object]/empty-string hits anywhere.

3. **Recommended setting within chassis scope — 3224 violations, ALL on `generic-offroad` only; `kyosho-inferno-mp11` is 100% clean (0 violations).** Root cause: the `generic-offroad` template's field vocabulary is desynced from the KB rule settings. Retrieval gates only on scope-tags (`1-8-offroad`), so rules match, but 18 distinct recommended settings name fields that don't exist on that template: it uses `front_springs`/`camber_front`/`toe_front`/`droop_front` where rules say `front_spring`/`front_camber`/`front_toe`/`front_downstop`, and entirely lacks `caster`, `*_track_width`, `*_roll_center`, `front_kickup`, `rear_anti_squat`, `wheelbase`, `ackermann`, `wing_height`. Consequence on that chassis: the "(currently X)" value won't resolve and the change can't be looked up by field name. The guard `settingUnknownToTemplate` exists to catch exactly this but is **never called by the engine pipeline** (dead-but-intended code). Production is unaffected — the app's only fully-mapped chassis, MP11, passes cleanly.

## Notes for the reviewer
- Findings 1 and 2 are surfaced by deliberately degenerate inputs (unknown template, NaN weather) that the current UI may never produce; they are robustness gaps, not production crashes.
- Finding 3 is the substantive one: it is a template-data/KB-vocabulary mismatch confined to the placeholder `generic-offroad` template, not a per-input logic bug. If `generic-offroad` is ever exposed in product, its `fields` must be renamed to match the KB rule settings (or the engine should call `settingUnknownToTemplate` to filter/translate before emitting advice).
- The opposite-direction, citation, kind, message, do_not_touch-overlap, and determinism invariants held across all 3044 inputs.