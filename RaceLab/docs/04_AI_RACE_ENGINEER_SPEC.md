# 04 — AI Race Engineer · Spec

> The #1 differentiator. This spec defines the V1 behavior (core, committed) and names which parts are exploratory. Mantra: **grounded or silent, one change at a time, learns from every run.**

## 1. What it is / is not

| It IS | It is NOT |
|---|---|
| A race engineer that proposes **one concrete change** and explains the mechanism | A generic chatbot that chats about RC |
| **Condition-aware**: track, surface, weather, grip, time of day | Advice in a vacuum (So Dialed's model) |
| **Grounded** on a curated tuning KB, citing its rules | Freeform LLM knowledge ("trust me bro") |
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
scope: [1/8_offroad]           # some rules are class- or even chassis-specific
```

Targets: **~80 rules** for V1, 1/8 offroad first (D14): diffs, shock oil/pistons/springs, sway bars, camber/toe/droop/ride height, ackermann, tires by surface, wing, gearing, weight distribution. **Engine/needle rules are explicitly excluded in V1** (D13) — those questions get a canned refusal until a per-engine safe-range database exists. Every rule reviewed by William before it can be cited. The KB is versioned in-repo (`packages/kb`) — rules are data, PRs are reviews — **and ships inside the app bundle** for the offline path.

## 4. Pipeline (Théo owns)

```
request → context bundle assembly (local data + weather, cached/backfilled)
        → symptom mapping (tags → KB symptom nodes, deterministic)
        → retrieval = PURE FUNCTION over the YAML KB (symptom × setting-space ×
          conditions × chassis scope filter, capped at N rules) — NO vector store,
          NO embeddings: ~80 structured rules don't need semantic search (D13)
        → engine-scope check: engine/needle symptom → canned refusal, stop here (D13)
        ├─ OFFLINE PATH (no signal — the default at most tracks):
        │    top matched rule(s) → templated recommendation card rendered on-device
        │    (each rule already carries effects, magnitude_guidance,
        │     reversal_cost_minutes, confidence, sources). $0, instant.
        │    Request queued for LLM enrichment when signal returns.
        └─ ONLINE PATH:
             LLM call (Claude, structured output): reason over ONLY retrieved rules
             + bundle + history → multi-factor arbitration, tailored prose
        → guard layer (deterministic, post-LLM):
            · proposed value must exist in the chassis template's enum options /
              numeric range (the template IS the bounds database — D13)
            · race-day mode: reject low-confidence or slow-to-reverse outputs
              → "stick with what you have"
        → response rendered with citations + confidence + revert info
        → outcome capture on next run (better/same/worse) → history store
```

Notes: the LLM **cannot cite a rule that wasn't retrieved** (citation IDs validated against the retrieval set). If retrieval returns nothing relevant → honest refusal template: *"I don't have a verified rule for that. Closest thing I know: …"*. LLM calls are server-side (key security, usage metering for the free-tier cap); the deterministic offline path runs entirely on-device against the bundled KB.

## 5. Output contract (structured, enforced via schema)

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

Hard rules: exactly **one primary**. ≤2 alternatives. `do_nothing_option` replaces everything when confidence is insufficient on race day. Chat is available around the recommendation (follow-up questions, "explain like I'm new"), but advice always lands in this shape.

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

Sonnet-tier model via AI Gateway; context bundle is compact (structured sheet + retrieved rules ≈ small). Estimate ≪ $0.02/recommendation → Pro at $3.99/mo is comfortably margin-positive even at heavy use; free tier capped at 5 recs/month (metered server-side).

## 10. Cold start (no learning data on day 1)

1. KB depth substitutes for learning early — day-one answers are already condition-specific.
2. Condition context **echoed back in every answer** ("on green low-grip clay at 14°C like right now…") so it never *feels* generic.
3. Track profiles pre-seeded for the clubs we race at; learning surfaced visibly as it accrues ("based on your 12 logged runs here").
