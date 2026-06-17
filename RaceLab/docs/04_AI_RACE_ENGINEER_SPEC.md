# 04 — Race Engineer Chatbot · Spec

> The #1 differentiator. This spec defines the V1 behavior (core, committed) and names which parts are exploratory. Mantra: **grounded or silent, one change at a time, learns from every run.** Per **D18** the whole advisor is **deterministic, on-device, and API-free** — built and passing tests in `packages/engine`.

## 1. What it is / is not

| It IS | It is NOT |
|---|---|
| A race engineer that proposes **one concrete change** and explains the mechanism | A generic chatbot that chats about RC |
| **Condition-aware**: track, surface, weather, grip, time of day | Advice in a vacuum (So Dialed's model) |
| **Our own deterministic dialogue over a curated KB**, citing its rules | An LLM, an API dependency, or freeform model knowledge ("trust me bro") |
| **Learning**: closes the loop on every recommendation | Stateless Q&A |
| Humble: confidence levels, refusals, "stick with what you have" | Always-has-an-answer |

## 2. Inputs (the context bundle)

Assembled automatically for every request — the user never retypes context:

1. **Setup state** — the active sheet (structured JSON), its version history on this car, and the user's own comments.
2. **Track** — surface type, indoor/outdoor, layout notes; current **grip level** (user-set: green / medium / high / blue groove) and track temp if entered.
3. **Weather** — live + race-window forecast (Open-Meteo: air temp, humidity, wind, rain risk). Morning ≠ afternoon; the engineer reasons about evolution.
4. **Driver feedback** — structured tags (taxonomy below) + free text + (exploratory C1) voice-note transcription.
5. **History** — this driver's past `(change, conditions, outcome)` triples on this track and globally; lap data when present.
6. **Skill signal** — self-declared level at onboarding; later inferred from lap consistency (exploratory C8).

### Feedback tag taxonomy (William owns; v0 draft)
Axis 1 — *symptom*: understeer/push · oversteer/loose · bouncy · bottoming · traction roll · unstable in braking · no forward bite · sluggish steering response.
Axis 2 — *phase*: corner entry · mid-corner · corner exit · on power · off power · braking · jumps/landing · rough sections.
Axis 3 — *evolution*: from lap 1 · appears as tires heat up · appears as track grips up · only when pushing.
A tag = (symptom, phase[, evolution]) → maps deterministically to KB symptom nodes.

## 3. The Tuning Knowledge Base (KB)

The product's brain, and **William's main content job**. Seeded from the SETUP_RC MP11 nomenclature work, manufacturer tuning guides, and team drivers' published guides.

**KB rule format:**
```yaml
id: kb-diff-front-thicker-001
setting: front_diff_oil
direction: increase            # e.g. 5000 → 7000 cSt
effects:
  - { axis: on_power_steering,  change: more }
  - { axis: off_power_steering, change: less }
  - { axis: stability_bumps,    change: slightly_more }
conditions:                    # when the effect is amplified/reduced
  amplified_on: [high_grip, blue_groove]
  reduced_on:   [wet, very_low_grip]
counter_indications: [already_pushing_entry]
magnitude_guidance: "one step (≈2000 cSt) at a time on race day"
reversal_cost_minutes: 12      # front diff out on an MP11
confidence: high               # high = physics+consensus, medium = common practice, low = anecdotal
sources: ["Kyosho MP11 manual p.34", "Tekno tuning guide §diffs"]
scope: [1-8-offroad]           # canonical hyphen dialect from taxonomy.scopes — a
                               # tag NOT in taxonomy.scopes is a build error (the old
                               # slash form "1/8_offroad" would have silently matched
                               # zero models); class- or even chassis-specific
```

Coverage (as of the D50 grounded-rules build): **417 LIVE rules** in `kb/bundle.json` across the competitive classes — 1/8 offroad first (D14), now also 1/10 2WD/4WD, short course, truggy, GT, stadium, touring and nitro on-road — covering diffs, shock oil/pistons/springs, sway bars, camber/toe/droop/ride height, ackermann, tires by surface, wing, gearing, weight distribution. (The original V1 target was ~80; the grounded Tier-A authoring pass overshot it.) **Engine/needle rules are explicitly excluded in V1** (D13) — those questions get a canned refusal until a per-engine safe-range database exists. Every rule reviewed by William before it can be cited. The KB is versioned in-repo (`packages/kb`) — rules are data, PRs are reviews — **and ships inside the app bundle** for the offline path.

## 4. Pipeline (Théo owns)

**One path, fully on-device, fully deterministic (D18). No API, no model, no server.**

```
driver text → deterministic NLU (pit-lane vocabulary → symptom × phase tags
              + condition hints; longest/most-specific patterns first so
              "loose under braking" ≠ "loose on power")
            → engine-scope check: needle/plug/mixture keywords → canned refusal (D13)
            → dialogue state machine:
                · no symptom found → re-prompt with examples
                · symptom but no phase → ask the ONE clarifying question
                  a real engineer asks ("when does it do that?")
            → retrieval = PURE FUNCTION over the YAML KB (symptom × phase ×
              conditions × chassis scope; counter-indicated rules excluded;
              NO vector store, NO embeddings)
            → race-day filter: only high-confidence + fast-reversible rules
              survive; empty result → "stick with what you have"
            → templated card from the top rule (each rule already carries
              effects, magnitude_guidance, reversal_cost_minutes, confidence,
              sources — the card is the rule, rendered). $0, instant, offline.
            → outcome loop: better → keep + log to sheet · worse/same →
              revert + next ranked option (distinct setting), until the
              list is dry → "look at tires"
            → every (setup delta, conditions, outcome) stored → history store
```

Notes: citations are valid **by construction** — the card is rendered from the retrieved rule itself, so there is nothing to hallucinate and nothing to guard post-hoc. If retrieval returns nothing → honest refusal: *"I don't have a verified rule for that — check tires/inserts for this surface first."* The implementation lives in `packages/engine` (`nlu.ts`, `chat.ts`, `retrieval.ts`, `guard.ts`, `offline.ts`). An LLM-backed variant existed and was removed per D18 (git `d8a8b81`) — a possible V2 premium layer for richer prose, never a dependency.

## 5. Output contract (produced directly from KB rule fields — D18)

```json
{
  "primary": {
    "setting": "front_diff_oil",
    "change": "7000 → 5000 cSt",
    "mechanism": "Lighter front diff frees the front on corner entry off-power, countering your mid-corner push as grip is still green.",
    "expected_effect": "More steering entry/mid; slightly less on-power steering.",
    "confidence": "high",
    "citations": ["kb-diff-front-thicker-001"],
    "revert": "Swap back to 7000; ~12 min.",
    "if_it_does_not_help": "If push persists, likely cause is front tires too hard for this surface — that's the next change."
  },
  "alternatives": [ { "...": "max 2, same shape, ranked" } ],
  "do_nothing_option": null
}
```

Hard rules: exactly **one primary**; ranked alternatives are held in reserve and surfaced one at a time by the outcome loop. `do_nothing_option` replaces everything when confidence is insufficient on race day. The dialogue around the card (clarifying questions, mode switches, outcome capture) is the deterministic state machine in `packages/engine/src/chat.ts` — advice always lands in this shape.

## 6. Learning loop

After the next logged run, the app asks: **better / same / worse** (+ optional note). Stored as:
`(driver, track, conditions_snapshot, setup_delta, recommendation_id, outcome)`
Used three ways: (1) injected into future prompts for this driver/track — *"last time here, going softer front rated 'better'"*; (2) per-driver re-ranking (exploratory C8); (3) anonymized fleet aggregation (exploratory C9, V2 flagship). Outcome capture must be one tap from the session screen — if rating a change takes >5 seconds, the flywheel dies.

## 7. Modes

| | **Practice mode** | **Race-day mode** |
|---|---|---|
| Suggestions | Exploratory allowed (medium confidence OK) | High-confidence only |
| Reversibility | Any | Fast-reversible preferred; reversal cost always shown |
| Goal | Learn the car/track (pairs with A/B planner C10) | Protect the result; "stick with what you have" is a valid answer |

## 8. Evaluation (gate before launch — William owns)

- **Eval set: 25 real scenarios** (setup + conditions + symptom → known-good expert answer) **+ 5 out-of-KB traps** (D14), built from our own racing + 2 club fast-guys recruited as reviewers by week 2 (the same people who become founding creators — one ask, two roles).
- Pass bar: ≥80% expert-rated "would help or neutral", **0** dangerous outputs, 100% citation validity (every cited rule exists and was retrieved), refusal triggers correctly on all 5 traps (incl. engine-tuning questions).
- Benchmark: same scenarios fed to So Dialed's AI Mechanic and to vanilla ChatGPT — we publish nothing unless we visibly beat both. **The benchmark starts in week 1–2 with the throwaway AI prototype (D15), not in week 8.**
- The eval harness is built alongside the prototype; re-run on every KB/prompt/model change (CI job).

## 9. Cost & free tier

**$0 per recommendation, by construction (D18).** No model, no API key, no server round-trip, no metering infrastructure. Consequence for monetization: the advisor is **unlimited in the free tier** — it becomes the acquisition hook; Pro sells unlimited cars/setups, full version history and analytics instead of advice quota.

## 10. Cold start (no learning data on day 1)

1. KB depth substitutes for learning early — day-one answers are already condition-specific.
2. Condition context **echoed back in every answer** ("on green low-grip clay at 14°C like right now…") so it never *feels* generic.
3. Track profiles pre-seeded for the clubs we race at; learning surfaced visibly as it accrues ("based on your 12 logged runs here").


---

## 11. Amendments — 2026-06-12 backend overhaul (D27/D29; full surface in /CONTRACTS.md, engine section)

**§4/§5 — multi-change plans (D27).** The engineer now proposes a RANKED PLAN of up to 3 cited canonical changes (`proposePlan`, MAX_PLAN_CHANGES=3, distinct settings) — applied and rated ONE AT A TIME (D6 spirit preserved; trial-time attribution survives each step). Chat protocol: plan presented as a numbered list, each card tagged (change N of M); worse → revert + offer next; same → revert + next; better mid-plan → keep + offer "next" or stop; "next" refused while an outcome is pending; single-candidate symptoms degrade to a 1-change plan with the exact pre-existing presentation. `OutcomeEvent` gained optional `plan_position`/`plan_size`.

**§6 — learning loop READ half is implemented.** `ContextBundle.history` rows (engine `HistoryEntry` = schema `ContextHistoryEntry` + optional `citations`/`track_id`) re-rank retrieval: match by KB rule id in citations; same-track only (unattributable rows ignored); net worse → demoted one tier below clean rules; net better → promoted one tier; mixed → neutral with tally note. GROUNDED-FIRST CAP: history runs after symptom/condition/scope filters, can never promote a rule the KB does not ground, influence bounded to +/-1 tier. Cards surface it via a deterministic `history_note`. Populate via engine `historyFromTuples(learningTuples(runs, outcomes), { track_id, limit })` — NOT schema `toEngineHistory` (drops citations/track_id; works but inert).

**NEW — run analysis.** `analyzeRuns(runs, data, {outcomes})` → deterministic `RunAnalysisReport` (B0 rename, to disambiguate from `report.ts`'s app-facing single-run `EngineerReport`): sections summary / conditions / pace via lapStats / tyre cliff via detectTyreCliff / setup-change timeline / recommended next plan. Every line cited or explicitly an observation/refusal; JSON-clean; persistence is storage's job.

**NEW — race-day planner (D29).** `planRaceDay({practice, forecast, track, chassis_template_id, current_setup?}, data)` maps forecast to taxonomy tags (rain/rain_risk>=30% → wet; air>=30C → hot; air<=10C → cold), proposes only race-day-safe amplified-on rules (max 2 per tag, cheapest-revert first), excludes rules rated worse at this track in practice, and emits EXPLICIT refusals for ungrounded aspects (no hot/cold KB rules yet; wind has no taxonomy tag). Deterministic, offline, zero I/O.

**§8 — eval set has grown to 26 scenario files** (`packages/engine/scenarios/*.json`, run by `eval.ts`; **23 currently asserted green** after the D50 LIVE-rule promotion). Beyond the original symptom cases it now covers: history-demotion / -promotion / -track-isolation, an understeer-vs-oversteer conflict, model gating (`pending` model gets category-template advice, capability gate drops an absent part, unknown-chassis refusal), and per-class LIVE coverage (2WD/4WD/stadium/short-course/truggy/touring/GT/nitro-on-road). Traps: engine-needle, glow-plug, `leans`-not-engine-scope. Harness expectations include `primary_cites` / `primary_cites_not`.