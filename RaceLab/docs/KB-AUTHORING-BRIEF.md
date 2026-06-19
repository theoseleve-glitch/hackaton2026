# KB Authoring Brief — for William

> **Owner:** William (RaceLab knowledge-base owner)
> **Scope:** author the three optional physics/number fields the engine is already plumbed to consume, plus ratify three deferred safety bounds.
> **Status:** the engine + UI ship these fields **today** with safe fallbacks. Nothing here needs a code change — you author values in the YAML, run `npm run bundle`, and the advice gets richer automatically.

---

## 1. Intro — what these fields do and why they are safe to author incrementally

The deterministic race-engineer reads the compiled KB (`packages/kb/bundle.json`) and renders setup advice. Three **optional** fields let you enrich that advice:

| Field | Where | Renders as |
|-------|-------|-----------|
| `lap_time_impact_s` | on a rule | a "~Xs/lap potential" line in the rationale **and** the ROI tiebreaker that decides which lever wins when two are otherwise equal |
| `mechanism_brief` | on a rule | the **first sentence of the mechanism** ("`<brief>` This produces: `<effects>`.") instead of the terse "Per `<source>`: `<effects>`." |
| `magnitude_estimate` | on an **effect** | a `[quantified estimate]` bracket appended to that effect in the expected-behaviour list |

**All three are optional and backward-compatible.** A rule with none of them renders exactly as it does today:
- no `mechanism_brief` → mechanism reads `Per HUDY Off-Road Set-Up Book p.XX: <effects>.`
- no `magnitude_estimate` → the effect renders bare, with no bracket
- no `lap_time_impact_s` → no lap-time line, and the ROI tiebreaker yields `0` for that pair (existing order — reversal-cost then id — decides)

So you can author **one rule, one family, or one field at a time** and ship at any point. Absent → current behaviour, always.

**Runtime safety guards keep advice safe regardless of your numbers.** The engine validates every field at load (`packages/engine/src/node-kb.ts`): `lap_time_impact_s` must be a positive finite number or the bundle fails to build; `mechanism_brief` and `magnitude_estimate` must be non-empty strings. The output path rejects non-finite numbers, drops rules whose setting isn't on the active chassis, and refuses rather than guesses when grounding is missing. A wrong *estimate* can make a recommendation slightly mis-ranked or mis-explained; it cannot make the engine emit unsafe or ungrounded advice. The hard physical-harm limits live in the separate `danger` field (see §6), not in these three.

---

## 2. Format spec (per field) + worked example

The canonical template is the **already-seeded** `kb-diff-rear-thinner-005` (in `packages/kb/rules/diffs.yaml`) — it carries all three fields done correctly. Copy its shape:

```yaml
- id: kb-diff-rear-thinner-005
  setting: rear_diff_oil
  direction: decrease
  # mechanism_brief — ONE line, on the RULE (sibling of `setting`/`direction`).
  mechanism_brief: "Thinner rear-diff oil lets the inside rear spin up more freely, so the diff transfers less torque and the rear rotates into the corner instead of pushing."
  effects:
    # magnitude_estimate — on the EFFECT object, only where you can quantify it.
    - { axis: cornering_traction, change: more, magnitude_estimate: "noticeably more rear bite, ~one tyre-width tighter line" }
    - { axis: steering_into_corner, change: more }   # no estimate is fine — renders bare
  addresses:
    - { symptom: understeer, phase: corner_entry }
    # …
  magnitude_guidance: "One step at a time (e.g. 4000 → 3000 cSt)."
  # lap_time_impact_s — number of SECONDS PER LAP, on the RULE.
  lap_time_impact_s: 0.2
  reversal_cost_minutes: 12
  confidence: high
  sources: ["HUDY Off-Road Set-Up Book p.35"]
  scope: [1-8-offroad]
```

### `lap_time_impact_s` — `number` (seconds/lap), on the rule
- **Type:** positive finite number, in seconds per lap. Decimals (e.g. `0.15`). Schema rejects `0`, negatives, `NaN`, `Infinity`.
- **Placement:** a top-level key on the rule (same indent level as `setting`, `confidence`).
- **Units:** seconds-per-lap gained when the change is applied well. It is an **estimate**, not a guarantee (state this expectation to yourself when picking the number).
- **What it drives:** (a) renders as `~0.2s/lap potential.` in the rationale; (b) the **ROI tiebreaker** in retrieval (`retrieval.ts`) — among candidates that tie on history-tier, symptom-score **and** confidence, the higher-gain rule sorts first and the report can say so. It fires **only when both candidates carry the field**; otherwise it yields 0 and the old order stands. So your numbers only need to be internally *consistent across the rule set* — see §5 for ranges.
- **Style:** one or two significant figures (`0.05`, `0.1`, `0.2`, `0.35`). Don't over-precision a guess.

### `mechanism_brief` — `string` (one line), on the rule
- **Type:** non-empty single-sentence string. No trailing period needed inside the field — the engine appends ` This produces: <effects>.` after it, so end the sentence with a period and **no** "This produces" of your own.
- **Placement:** top-level key on the rule.
- **Length/style:** ONE line, ~15–35 words. State the **physics cause**, not the symptom. Good shape: "`<what the change physically does>`, so `<the handling consequence>`." Mirror the two seeded examples:
  - rear-diff-thinner-005: *"Thinner rear-diff oil lets the inside rear spin up more freely, so the diff transfers less torque and the rear rotates into the corner instead of pushing."*
  - clutch-softer-009: *"A softer clutch spring engages earlier and more progressively, so torque builds smoothly instead of spiking the rear loose when grip is scarce."*
- **Renders as:** `<mechanism_brief> This produces: <effect a>; <effect b>. ~Xs/lap potential.` So write it to read naturally *before* "This produces:".

### `magnitude_estimate` — `string` (quantified), on the effect
- **Type:** non-empty string, inside the effect object (`{ axis, change, magnitude_estimate }`).
- **Placement:** add the key to whichever effects you can quantify — not every effect needs one.
- **Units/style:** a concrete, bounded quantity. Prefer ranges and signs. Patterns that read well in a `[…]` bracket: `"±5–8% steering response"`, `"~2°C cooler running"`, `"noticeably more rear bite, ~one tyre-width tighter line"`, `"engages a few hundred rpm earlier"`. Keep it short — it renders inline as `Steering: more [±5–8% steering response]`.
- **Renders as:** `<axis>: <change> [<magnitude_estimate>]` in the effect list (`effectsText` in `offline.ts`).

---

## 3. Full rule inventory — all 63 rules, with the fields each still needs

Every rule is `confidence: high`. Legend: **needs** = fields still to author (`lap`=`lap_time_impact_s`, `mech`=`mechanism_brief`, `mag`=`magnitude_estimate`); **addr** = number of symptoms the rule `addresses` (its surfacing frequency — the prioritization driver, see §4). `★` = already-seeded fields done.

### Differentials — `packages/kb/rules/diffs.yaml` (6 rules)
| id | setting · direction | addr | needs |
|----|--------------------|------|-------|
| kb-diff-front-thicker-002 | front_diff_oil · increase | 4 | lap, mech, mag |
| kb-diff-front-thinner-001 | front_diff_oil · decrease | 3 | mech, mag (lap★ = 0.1) |
| **kb-diff-rear-thinner-005** | rear_diff_oil · decrease | 3 | **DONE ★** (lap 0.2, mech, mag) |
| kb-diff-center-thinner-003 | center_diff_oil · decrease | 2 | lap, mech, mag — **has `danger`** |
| kb-diff-center-thicker-004 | center_diff_oil · increase | 2 | lap, mech, mag |
| kb-diff-rear-thicker-006 | rear_diff_oil · increase | 2 | lap, mech, mag |

### Gearing — `diffs.yaml` (2 rules)
| id | setting · direction | addr | needs |
|----|--------------------|------|-------|
| kb-gearing-shorter-007 | gearing · decrease_fdr_speed | 2 | lap, mech, mag |
| kb-gearing-taller-008 | gearing · increase_fdr_speed | 0 | lap, mech, mag |

### Clutch — `diffs.yaml` (2 rules)
| id | setting · direction | addr | needs |
|----|--------------------|------|-------|
| **kb-clutch-springs-softer-009** | clutch_spring · decrease | 2 | **DONE ★** (lap 0.15, mech, mag) |
| kb-clutch-springs-stiffer-010 | clutch_spring · increase | 0 | lap, mech, mag |

### Shocks — `packages/kb/rules/shocks.yaml` (8 rules)
| id | setting · direction | addr | needs |
|----|--------------------|------|-------|
| kb-shock-rear-softer-damping-103 | rear_shock_oil · decrease | 3 | lap, mech, mag |
| kb-shock-front-softer-damping-101 | front_shock_oil · decrease | 2 | lap, mech, mag |
| kb-shock-pistons-larger-holes-106 | shock_pistons · larger_or_more_holes | 2 | lap, mech, mag |
| kb-shock-more-inclined-111 | shock_mounting_inclination · more_inclined | 2 | lap, mech, mag |
| kb-shock-front-harder-damping-102 | front_shock_oil · increase | 1 | lap, mech, mag |
| kb-shock-pistons-smaller-holes-105 | shock_pistons · smaller_or_fewer_holes | 1 | lap, mech, mag |
| kb-shock-less-inclined-112 | shock_mounting_inclination · less_inclined | 1 | lap, mech, mag |
| kb-shock-rear-harder-damping-104 | rear_shock_oil · increase | 0 | lap, mech, mag |

### Springs — `shocks.yaml` (4 rules)
| id | setting · direction | addr | needs |
|----|--------------------|------|-------|
| kb-spring-rear-softer-109 | rear_spring · decrease | 3 | lap, mech, mag |
| kb-spring-front-softer-107 | front_spring · decrease | 2 | lap, mech, mag |
| kb-spring-front-stiffer-108 | front_spring · increase | 2 | lap, mech, mag |
| kb-spring-rear-stiffer-110 | rear_spring · increase | 1 | lap, mech, mag |

### Anti-roll bars — `packages/kb/rules/bars-wing.yaml` (4 rules)
| id | setting · direction | addr | needs |
|----|--------------------|------|-------|
| kb-swaybar-front-stiffer-302 | front_sway_bar · increase | 3 | lap, mech, mag |
| kb-swaybar-rear-softer-303 | rear_sway_bar · decrease | 3 | lap, mech, mag |
| kb-swaybar-rear-stiffer-304 | rear_sway_bar · increase | 3 | lap, mech, mag |
| kb-swaybar-front-softer-301 | front_sway_bar · decrease | 2 | lap, mech, mag |

### Rear wing — `bars-wing.yaml` (6 rules)
| id | setting · direction | addr | needs |
|----|--------------------|------|-------|
| kb-wing-rearward-305 | wing_position · rearward | 2 | lap, mech, mag |
| kb-wing-steeper-307 | wing_angle · increase | 2 | lap, mech, mag |
| kb-wing-forward-306 | wing_position · forward | 1 | lap, mech, mag |
| kb-wing-flatter-308 | wing_angle · decrease | 1 | lap, mech, mag |
| kb-wing-higher-309 | wing_height · increase | 1 | lap, mech, mag |
| kb-wing-lower-310 | wing_height · decrease | 1 | lap, mech, mag |

### Geometry — `packages/kb/rules/geometry.yaml` (31 rules)
| id | setting · direction | addr | needs |
|----|--------------------|------|-------|
| kb-rideheight-higher-206 | ride_height · increase | 3 | lap, mech, mag |
| kb-caster-more-215 | caster · increase | 3 | lap, mech, mag |
| kb-toe-rear-more-218 | rear_toe · increase | 3 | lap, mech, mag |
| kb-rollcenter-rear-higher-224 | rear_roll_center · higher | 3 | lap, mech, mag |
| kb-rollcenter-rear-lower-225 | rear_roll_center · lower | 3 | lap, mech, mag |
| kb-antisquat-less-229 | rear_anti_squat · decrease | 3 | lap, mech, mag |
| kb-wheelbase-shorter-230 | wheelbase · decrease | 3 | lap, mech, mag |
| kb-wheelbase-longer-231 | wheelbase · increase | 3 | lap, mech, mag |
| kb-downstop-front-higher-201 | front_downstop · increase | 2 | lap, mech, mag |
| kb-downstop-front-lower-202 | front_downstop · decrease | 2 | lap, mech, mag |
| kb-downstop-rear-higher-203 | rear_downstop · increase | 2 | lap, mech, mag |
| kb-downstop-rear-lower-204 | rear_downstop · decrease | 2 | lap, mech, mag |
| kb-rideheight-lower-205 | ride_height · decrease | 2 | lap, mech, mag |
| kb-rideheight-rake-rearward-207 | ride_height_rake · front_higher_than_rear | 2 | lap, mech, mag |
| kb-rideheight-rake-forward-208 | ride_height_rake · front_lower_than_rear | 2 | lap, mech, mag — **has `danger`** |
| kb-camber-front-more-negative-209 | front_camber · decrease | 2 | lap, mech, mag |
| kb-camber-rear-less-negative-210 | rear_camber · increase | 2 | lap, mech, mag — **has `danger`** |
| kb-trackwidth-front-wider-211 | front_track_width · increase | 2 | lap, mech, mag |
| kb-trackwidth-front-narrower-212 | front_track_width · decrease | 2 | lap, mech, mag |
| kb-trackwidth-rear-wider-213 | rear_track_width · increase | 2 | lap, mech, mag |
| kb-caster-less-214 | caster · decrease | 2 | lap, mech, mag |
| kb-toe-front-less-216 | front_toe · decrease | 2 | lap, mech, mag |
| kb-toe-front-more-217 | front_toe · increase | 2 | lap, mech, mag |
| kb-ackermann-forward-220 | ackermann · forward_holes | 2 | lap, mech, mag |
| kb-rollcenter-front-lower-222 | front_roll_center · lower | 2 | lap, mech, mag |
| kb-kickup-more-226 | front_kickup · increase | 2 | lap, mech, mag |
| kb-antisquat-more-228 | rear_anti_squat · increase | 2 | lap, mech, mag |
| kb-ackermann-rearward-221 | ackermann · rearward_holes | 1 | lap, mech, mag |
| kb-rollcenter-front-higher-223 | front_roll_center · higher | 1 | lap, mech, mag |
| kb-kickup-less-227 | front_kickup · decrease | 1 | lap, mech, mag |
| kb-toe-rear-less-219 | rear_toe · decrease | 0 | lap, mech, mag |

**Totals:** 63 rules. 2 fully done (`kb-diff-rear-thinner-005`, `kb-clutch-springs-softer-009`). 1 partially done (`kb-diff-front-thinner-001` — needs mech + mag). **60 rules need all three fields.**

---

## 4. Prioritization — author in this order

All rules are `confidence: high`, so the discriminator is **how often a rule surfaces** = how many symptoms it `addresses` (the `addr` column). The rules with `addr ≥ 3` are the ones a racer sees most, so their numbers and explanations matter most. Author in waves, **one family at a time** so magnitudes stay internally consistent within a family.

### Wave 1 — highest-surfacing rules (addr ≥ 3), do these first
These appear in the most recommendations; get their `lap_time_impact_s` right so the ROI ranking is meaningful from day one.
- **Differentials:** kb-diff-front-thicker-002 (addr 4), kb-diff-front-thinner-001 (3, mech+mag only)
- **Geometry:** kb-rideheight-higher-206, kb-caster-more-215, kb-toe-rear-more-218, kb-rollcenter-rear-higher-224, kb-rollcenter-rear-lower-225, kb-antisquat-less-229, kb-wheelbase-shorter-230, kb-wheelbase-longer-231 (all addr 3)
- **Shocks/springs:** kb-shock-rear-softer-damping-103 (3), kb-spring-rear-softer-109 (3)
- **Anti-roll bars:** kb-swaybar-front-stiffer-302, kb-swaybar-rear-softer-303, kb-swaybar-rear-stiffer-304 (all addr 3)

### Wave 2 — the mid-frequency body (addr = 2)
Author family-by-family so each family's magnitudes are consistent:
1. Differentials (center-thinner-003 **[danger]**, center-thicker-004, rear-thicker-006) + Gearing (shorter-007)
2. Shocks & mounting (front-softer-101, pistons-larger-106, more-inclined-111) + Springs (front-softer-107, front-stiffer-108)
3. Anti-roll bars (front-softer-301)
4. Geometry — downstops (201–204), ride-height (lower-205, rake-rearward-207, rake-forward-208 **[danger]**), camber (front-209, rear-210 **[danger]**), track-width (211–213), caster (less-214), toe (front 216/217), ackermann-forward-220, rollcenter-front-lower-222, kickup-more-226, antisquat-more-228
5. Rear wing (rearward-305, steeper-307) + Clutch already done

### Wave 3 — low-frequency tail (addr ≤ 1)
The single-symptom and "preference"/no-symptom rules (gearing-taller-008, clutch-stiffer-010, shock-rear-harder-104, the `addr 0`/`addr 1` wing, geometry, and shock entries, etc.). Still worth a `mechanism_brief`; `lap_time_impact_s` matters least here because they rarely tie a higher-surfacing rule.

---

## 5. `lap_time_impact_s` calibration guidance

These are **estimates, not guarantees** — the engine renders them as "~Xs/lap potential" and uses them only to break ties among already-equal candidates. What matters is **internal consistency across the rule set**, so a bigger lever always outranks a finer one. Suggested bands (anchored to the seeded values: rear-diff-thinner 0.2, clutch-softer 0.15, front-diff-thinner 0.1):

| Change character | Typical `lap_time_impact_s` | Examples |
|------------------|----------------------------|----------|
| **Big handling lever** — fixes a dominant, lap-wide problem (major balance shift, traction unlock) | **~0.3–0.5** | a diff/spring/sway-bar change that turns a pushing car neutral |
| **Standard adjustment** — a normal one-step setup tweak | **~0.1–0.2** | most diff-oil, shock-oil, roll-center, camber moves (matches the seeds) |
| **Fine-tune** — small refinement or comfort/stability tweak | **~0.05–0.15** | toe, ackermann, wing height/position, kick-up |
| **Marginal / preference** — barely moves the clock | **omit, or ~0.03–0.05** | rear-toe-less, wing-lower, niche `addr 0` rules |

Rules of thumb:
- Keep a family's values **ordered by how much each direction actually changes the car** — e.g. within diffs, a rear-diff change (0.2) should out-rank a front-diff fine-tune (0.1) as already seeded.
- Don't invent precision: one or two sig figs.
- When unsure, **leave it absent** — a missing value is safer than a wrong one (the tiebreaker just falls through to the existing order). Author the high-surfacing rules first (§4) where the number actually changes what a racer sees.

---

## 6. Three deferred safety bounds — also need your ratification

The 2026-06-18 engine safety audit (`docs/superpowers/specs/2026-06-18-engine-safety-audit.md`) hardened three physical-risk rules with **provisional** numeric bounds, surfaced verbatim to the user via the `danger` field. They are live but explicitly marked *pending William/domain ratification*. Please confirm or correct each number — this is part of your single to-do list.

1. **Rear-camber −1.5° hard limit** — `kb-camber-rear-less-negative-210` (`geometry.yaml`).
   Current `danger`: *"ABSOLUTE LIMIT: do not set rear camber less negative than −1.5°. Past this the rear lets go abruptly (sudden spin/crash). Start from the kit default and move toward 0 in 0.5° steps; if grip stops improving before −1.5°, stop there."*
   **Ratify:** is −1.5° the right absolute floor for 1/8 off-road, or should it be class/chassis-specific?

2. **Centre-diff thin-oil floor + temp ceiling** — `kb-diff-center-thinner-003` (`diffs.yaml`).
   Current `danger`: *"…On high-power engines do NOT thin the centre diff below ~3000 cSt, and check the diff is not running hot (warm is fine, too-hot-to-touch is not) after each run. Low/mid-power engines have more margin but still re-test."*
   **Ratify:** is ~3000 cSt the right floor on high-power engines? Do you want a concrete temperature number (the audit proposed ~120°C) instead of the "too-hot-to-touch" heuristic?

3. **Rake-forward big-jump caveat** — `kb-rideheight-rake-forward-208` (`geometry.yaml`).
   Current `danger`: *"NOT recommended on tracks with big jumps — a lowered nose dives on landing (crash / broken chassis). Use only on smooth, flat layouts; if the track has big jumps, fix the understeer with a different lever (front camber, roll center, or diff)."*
   **Ratify:** confirm the "smooth/flat only" scope and the suggested alternative levers are correct.

> Note: `danger` is a **separate field** from the three in §1–2. The physical-harm limits live there and are already rendered. Your job on these three is to confirm/correct the *numbers and scope*, not to re-author them from scratch.

---

## 7. How to apply + verify

The KB source is YAML; the engine consumes the compiled `bundle.json`. After **every** edit:

```bash
# 1. Edit the YAML rule(s) in packages/kb/rules/{diffs,shocks,bars-wing,geometry}.yaml

# 2. Regenerate the compiled bundle (the bundle script lives in the engine package)
cd packages/engine
npm run bundle      # → "bundled 63 rules, N template(s) → …/packages/kb/bundle.json"

# 3. Run the engine tests — eval + adversarial safety must stay green
npm test            # runs nlu, chat, plan, reports, planner, report, race-plan,
                    # d18-purity, safety-adversarial, and eval in sequence
```

What the tests protect:
- **`npm run bundle`** runs the Zod schema (`node-kb.ts`) — a bad value (non-positive/non-finite `lap_time_impact_s`, empty string) **fails the build** before it can ship.
- **`test-safety-adversarial.ts`** re-runs the 3044-input + 7-dialogue invariant sweep: grounded-or-silent, no self-contradiction, no NaN in user text, determinism. Your field additions must keep all of these green.
- **`eval.ts`** checks the recommendation quality fixtures. If you change a `lap_time_impact_s` that flips a tiebreaker, an eval case may move — review the diff and confirm the new ranking is the intended one.

Commit the YAML **and** the regenerated `bundle.json` together (they must not drift).

---

### Your single to-do list, in order
1. **Wave 1** (§4): author `lap`/`mech`/`mag` on the ~16 highest-surfacing rules — finish `kb-diff-front-thinner-001` (mech+mag only) first since its `lap` is already seeded.
2. **Wave 2 → 3** (§4): work family-by-family down to the tail.
3. **Ratify the 3 safety bounds** (§6): rear-camber −1.5°, centre-diff ~3000 cSt / temp ceiling, rake-forward big-jump scope.
4. After each batch: `cd packages/engine && npm run bundle && npm test`, then commit YAML + `bundle.json`.
