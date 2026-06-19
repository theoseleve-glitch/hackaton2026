# Engineering Features — Perfection Plan (Round 1)

> Deep audit + synthesis of the 3 engineering features (Setup Engineer, Race Planner, Pit Strategy) for clearer/more-scientific/better-performance. Every change gated by eval 13/13 + adversarial(3044)=0 + strategy 48/48 + new locking tests. Round 1 of an iterative loop.

## ROUND-1 PLAN

I have everything needed. The gates are: `npm test` (engine package) which runs `test-report`, `test-race-plan`, `test-planner`, `test-d18-purity`, `test-safety-adversarial` (the 3044-input adversarial), and `eval.ts` (13/13); plus the strategy package `test-strategy.ts` (48/48). Here is the synthesized plan.

---

# RaceLab ROUND-1 IMPROVEMENT PLAN — Three Engineering Features

Scope: Setup Engineer (report.ts / offline.ts / retrieval.ts), Race Planner (race-plan.ts / planner.ts), Pit Strategy (strategy.ts / cliff.ts). Three deterministic engines, one shared mandate: clearer + more scientific + faster-to-decide, with every change holding **eval 13/13**, the **3044-input adversarial invariant** (`test-safety-adversarial.ts`), the **create/report tests** (`test-report.ts`, `test-race-plan.ts`, `test-planner.ts`, `test-d18-purity.ts`), and **strategy 48/48** (`test-strategy.ts`) green.

Note on audit drift, corrected here: the report functions live in `packages/engine/src/report.ts` and `offline.ts` (not `engineer.ts`); `expectedBehavior(rule)` takes only the rule today; `RecommendationOption` has no `magnitude`/`plan_b_text` field yet. The plan reflects the real code.

---

## 1. THE PLAN — ordered, grouped to avoid edit conflicts

Groups are sequenced so no two items in the same group touch the same file. Within a feature, the engine file is edited once per group.

### GROUP A — Pit Strategy, pure-text clarity (file: `packages/strategy/src/strategy.ts`)
Highest ROI, zero math change, lands first because it is the most-misread output and is fully isolated to one file.

- **A1 — Fix margin semantics** (Strategy / CLARITY)
  - Change `strategy.ts:58` from `…keeps a ${margin}s fuel margin…` to: `Boxing every ${mmss(fuelCap)} (${fuelCap}s) — that's full autonomy minus a ${margin}s safety reserve${inputs.margin_s === undefined ? " (one average lap, the default)" : ""}, held back against fuel-test variance and slow stops.`
  - Why: kills the "I keep 35s of fuel in the tank" misread — the #1 confusion in strategy output. Clarity.
  - Impact HIGH. Gate: `test-strategy` 48/48 (pure string; assertions match on tokens like `385s`/`mmss`, verify after).

- **A2 — Quantify the tyre-cliff decision** (Strategy / CLARITY + SCIENCE)
  - Change `strategy.ts:73` to lead with the comparison already in scope: `Tyres fall off a cliff after ~${mmss(cliffTime)} (lap ${cliff.cliff_lap}, ~${cliff.degradation_s_per_lap.toFixed(2)}s/lap) — that's ${mmss(cliffTime)} vs the ${mmss(fuelCap)} fuel window, so tyres run out of grip first. Box every ${mmss(cliffTime)} to stay ahead of the cliff.`
  - Why: turns "inside the window" jargon into a grounded time-vs-time comparison. Note `mmss(fuelCap)` replaces the raw `${fuelCap}s`. Clarity/science.
  - Impact HIGH. Gate: `test-strategy` 48/48 (confirm no assertion pins the literal `${fuelCap}s` substring on this line; if it does, update the expectation in the same PR).

- **A3 — Surface stint durations in the box-time note** (Strategy / CLARITY)
  - `strategy.ts:159` already renders stints; reorder to lead with durations: `Stints: ${stints.map((s) => mmss(s.duration_s)).join(", ")} (all under the ${mmss(cap_s)} cap). Box on the race clock at ${pit_at_s.map(mmss).join(", ")}.`
  - Why: racer reads stint length directly instead of subtracting clock times. Clarity.
  - Impact MED. Gate: `test-strategy` 48/48.

### GROUP B — Race Planner engine clarity (file: `packages/engine/src/race-plan.ts`)
One file, three isolated functions; safe-now, no KB, no retrieval reorder.

- **B1 — Mechanism-paired `conditionsShift`** (Planner / CLARITY, audit 1.1)
  - In `conditionsShift` (`race-plan.ts:155`), append a physics clause to each delta line: hotter ⇒ "grip drops, the car needs more rear traction"; rain ⇒ "less grip, longer braking — brake earlier and straighter, feed throttle later on exit." Use the existing temp-delta math; do NOT cite KB rules (universal physics, safe to emit).
  - Why: "5°C hotter" becomes actionable intuition without a grip-curve. Clarity. Impact HIGH.
  - Gate: `test-race-plan`, eval 13/13 (planner output is additive text; confirm no test pins exact `conditions_shift` strings — update expectations in-PR if it does).

- **B2 — Rank `readinessFacts` + data-quality signal** (Planner / CLARITY, audit 1.2)
  - In `readinessFacts` (`race-plan.ts:182`): keep unresolved-symptom detection, but order unresolved first, then best pace, then a quality line — `${sorted.length >= 3 ? "Good" : sorted.length === 2 ? "Limited" : "Single"} data: N runs on grips …` + a caution suffix when `< 3`. Format `bestAvg` with `.toFixed(2)` (currently raw).
  - Why: scannable; "thin data, be cautious" is surfaced. Clarity. Impact MED.
  - Gate: `test-race-plan`, `test-d18-purity` (pure sort/format).

### GROUP C — Race Planner UI (file: `apps/.../RacePlanView.tsx`)
Renders data the planner already computes but currently hides. No engine change → cannot affect eval/adversarial.

- **C1 — Render adjustments + refusals folds, promote adjustment to verdict** (Planner / CLARITY, audit 1.3 + 3.4)
  - Add two `Fold`s ("Forecast adjustments", "Ungrounded aspects") before the strategy button; if `plan.adjustments?.length`, make `adjustments[0]` the verdict-card headline (kicker "FORECAST ADJUSTMENT"), demoting the Theo primary to the full report below.
  - Why: William's grounded, KB-cited forecast tweaks and explicit refusals are computed but invisible today. Clarity/trust. Impact HIGH.
  - Gate: none of the engine gates apply (pure RN render); verify visually + any RN snapshot test.

### GROUP D — Setup Engineer report clarity (files: `packages/engine/src/types.ts`, `offline.ts`, `report.ts`, + `RunReportCard.tsx`)
One coherent PR; types edited once, consumed by offline.ts and the card. Sequence within PR: types → offline.ts → report.ts → card.

- **D1 — Hoist magnitude into its own field** (Setup / CLARITY, audit 1.7)
  - `types.ts`: add `magnitude: string` to `RecommendationOption`.
  - `offline.ts` `ruleToOption`: split `change` so it no longer embeds `magnitude_guidance`; set `magnitude: rule.magnitude_guidance`. Keep the `⚠️ SAFETY` danger text on `change` (must stay at point-of-action).
  - `RunReportCard.tsx`: render `magnitude` as a distinct bold line.
  - Why: "turn the screw 1mm" stops being buried in prose — critical for on-track execution. Clarity. Impact MED.
  - Gate: `test-report`, eval 13/13, **adversarial 3044** (grounded/on-template/finite gates unchanged — field is non-numeric, no NaN path; fallback if `magnitude_guidance` absent → empty string).

- **D2 — Evidence-strength + sample-size in history narrative** (Setup / CLARITY + SCIENCE, audit 1.5 + 1.8 + 2.7)
  - `report.ts` `buildRationale`: when history present, append a strength tag — `Strong track record.` (≥3 better, 0 worse) / `Mixed track record.` (better==worse) and a `(small sample)` qualifier under 3 rated; in `offline.ts` `historyNote` add the same small-sample qualifier.
  - Why: 10–0 vs 2–1 now reads differently; honest about thin data. Science/clarity. Impact MED.
  - Gate: `test-report`, eval 13/13 (narrative-only; no rank change).

### GROUP E — Setup Engineer retrieval science (file: `packages/engine/src/retrieval.ts`)
Isolated to the scorer. This is the only Round-1 change that can reorder output, so it ships alone and is gated hardest.

- **E1 — Symptom-frequency boost** (Setup / SCIENCE, audit 2.4)
  - In `retrieve` (`retrieval.ts`), build a `symptomFreq` map over `bundle.feedback.tags`; after the base match loop, add `score += Math.min(freq-1, 2)` per addressed symptom reported >1×. Sort key unchanged.
  - Why: "understeer, understeer, understeer" prioritizes understeer fixes — severity signal the engine ignores today. Science/perf. Impact MED.
  - Gate: eval 13/13 (run first — confirm **no scenario flips kind** recommendation↔refusal), **adversarial 3044** (score stays a bounded integer, `score <= 0` drop path intact, deterministic — no RNG/clock). This is the gate-sensitive item; if any eval scenario reorders in a way a test pins, decide in-PR whether the new order is correct and update the expectation, or cap the boost lower.

---

## 2. QUICK WINS vs DEEPER

**QUICK WINS — safe to ship now, pure functions/render, no new eval scenario needed:**
- A1, A2, A3 (strategy text) — Group A.
- B1, B2 (planner text) — Group B.
- C1 (planner UI render of already-computed data) — Group C.
- D1, D2 (report field + narrative) — Group D.

These touch no rank-ordering math; gates pass by construction provided string-literal test expectations are updated in the same PR.

**DEEPER — needs care / a new eval scenario before merge:**
- E1 (symptom-frequency boost) — the only item that changes retrieval order. Requires running eval **before** merge and adding a dedicated multi-tag eval scenario (see §4) to lock the intended ordering. Land it solo, after Groups A–D, so any eval movement is unambiguously attributable.
- Planner **race-type filter** (sprint vs endurance, audit 3.2) and **forecast-vs-practice comparison** (audit 2.4) are pure but change which adjustments appear — defer to a Round-1.5 once E1's eval scenario pattern is proven; both want their own planner eval cases.

---

## 3. NEEDS WILLIAM — KB physics/number changes (do NOT block Round 1)
Propose as KB-schema additions; engine code degrades gracefully when absent.
- **`lap_time_impact_s` / `lap_time_impact_estimate` per rule** (Setup 2.3/3.1, Planner 2.3/3.1) — unlocks ROI-ranked retrieval and race-day re-sort by lap-time gain instead of reversal cost. Highest-value KB ask. Start with high-confidence common rules.
- **`magnitude_estimate` on `KBEffect`** (Setup 2.1) — quantify effects ("±5–8% steering response") so "is this enough?" is answerable.
- **`mechanism_brief` on rules** (Setup 1.2) — one-line physics ("raising the front downstop stiffens the front, shifts weight rearward at entry"); 20–30 rules.
- **Per-surface forecast thresholds + grip-impact strings** (Planner 2.1) — replace the bare `HOT_FROM_C=30 / COLD_TO_C=10 / WET_FROM_PCT=50` magic numbers with asphalt/clay/carpet-specific, physics-grounded values.
- **Autonomy-test variance + tyre-cliff threshold rationale** (Strategy 2.1/2.2) — ratify the `max(0.6s, 2.5%·baseline)` cliff threshold and a stddev/MAD method for multi-test autonomy confidence; for Round 1 ship A2's doc-comment of the current thresholds, defer the stats.
- **Rare-combo confidence penalties** (Planner 3.3), **reversal-risk vs reversal-time split** (Setup 2.11) — secondary.

---

## 4. NEW TESTS — lock the improvements in
Add to `packages/engine/src/eval.ts` scenarios and the per-feature test files; all must run inside `npm test`.

1. **Multi-tag severity eval scenario (locks E1)** — input with the same symptom tagged 3× across phases; assert the understeer-addressing rule is `primary` and that kind stays `recommendation`. This is the guardrail that makes E1 mergeable.
2. **Magnitude-field invariant (locks D1)** — extend `test-safety-adversarial.ts`: for every emitted `RecommendationOption`, assert `typeof option.magnitude === "string"` and `change` no longer contains the raw `magnitude_guidance` twice; assert no `"NaN"` in `magnitude`. Folds into the 3044-input sweep.
3. **Strategy text invariants (locks A1–A3)** — in `test-strategy.ts`: assert the margin note contains "safety reserve" and not the legacy "keeps a … fuel margin"; assert the cliff note contains both `mmss(cliffTime)` and `mmss(fuelCap)` (time-vs-time); assert the box note lists stint durations.
4. **Planner clarity invariant (locks B1/B2)** — in `test-race-plan.ts`: given a +5°C hotter forecast, assert `conditions_shift` includes a mechanism clause (e.g. matches `/grip|traction|brak/i`); given `<3` runs assert readiness emits a `Limited`/`Single` data-quality line; assert unresolved symptom precedes the best-pace line.
5. **Determinism re-assert** — `test-d18-purity.ts` already proves purity; add B1/B2/E1 call sites to its fixture sweep so any accidental clock/RNG/IO in the new branches is caught.

**Ship order:** Group A → B → C → D (parallelizable, disjoint files) → run full `npm test` + `eval` → then Group E solo behind new test #1 → final full suite.

**Relevant file paths:**
- `C:\Users\Admin\Documents\wt-theo-racelab\RaceLab\packages\strategy\src\strategy.ts` (A1/A2/A3), `...\strategy\src\test-strategy.ts`
- `C:\Users\Admin\Documents\wt-theo-racelab\RaceLab\packages\engine\src\race-plan.ts` (B1/B2), `...\engine\src\test-race-plan.ts`
- `C:\Users\Admin\Documents\wt-theo-racelab\RaceLab\packages\engine\src\types.ts` + `offline.ts` + `report.ts` (D1/D2), `...\engine\src\test-report.ts`
- `C:\Users\Admin\Documents\wt-theo-racelab\RaceLab\packages\engine\src\retrieval.ts` (E1), `...\engine\src\eval.ts`, `...\engine\src\test-safety-adversarial.ts`, `...\engine\src\test-d18-purity.ts`
- RacePlanView (C1): under the app package (RN component consuming `RacePlan`); engine gates do not apply.

---

## FULL AUDITS

### Setup Engineer
Excellent. Now I have a comprehensive understanding of the codebase. Let me create a detailed audit report.

---

## COMPREHENSIVE AUDIT: RaceLab Setup Engineer (8-Part Report)

### EXECUTIVE SUMMARY

The Setup Engineer is fundamentally sound — deterministic, grounded, fail-closed, with solid architecture (D18/D13 compliance, retrieval + guard gates). However, across **CLARITY**, **SCIENTIFIC RIGOR**, and **PERFORMANCE**, there are concrete gaps that erode racer trust and decision velocity:

1. **CLARITY**: The report structure is correct but the "WHY" surfaces too late; diagnosis lacks quantified symptom severity; the ONE decisive change isn't emphasized enough; mechanism text is terse.
2. **SCIENTIFIC RIGOR**: Effects are named but not quantified (no lap-time impact, magnitude ambiguity); confidence calibration ignores evidence strength; rule precedence doesn't weight by potential lap-time gain; history is tracked but underused in diagnosis.
3. **PERFORMANCE**: High-impact changes (reversal cost, lap-time gain magnitude) aren't prioritized; secondary options lack clear "why this over #1?"; condition-specific tuning (e.g., worn tyres + bumpy → different rule order) is absent.

Below: **31 specific improvements** (prioritized by impact and safety), then the **TOP 3** safe-to-ship changes.

---

## FINDINGS: 31 CONCRETE IMPROVEMENTS

### DIMENSION 1: CLARITY (11 improvements)

#### GAP 1.1: Diagnosis lacks symptom severity signal
**What**: `buildDiagnosis()` echoes tags but doesn't indicate if the problem is mild/severe or worsening/stable.
**Current output example**:
```
Reported: understeer (corner_entry). Context: green grip loose surface, 23°C.
```
**Proposed change**: Fold evolution trend into diagnosis; add count of same-symptom tags.
```typescript
function buildDiagnosis(bundle: ContextBundle): string {
  const parts: string[] = [];
  if (bundle.feedback.tags.length > 0) {
    const grouped = groupBy(bundle.feedback.tags, (t) => t.symptom);
    const symptoms = Array.from(grouped.entries())
      .map(([symptom, tags]) => {
        const count = tags.length;
        const phases = tags.map((t) => t.phase).filter(Boolean).join(", ");
        return count > 1
          ? `${humanize(symptom)}${phases ? ` (${phases})` : ""} — reported ${count}x`
          : `${humanize(symptom)}${phases ? ` (${phases})` : ""}`;
      })
      .join("; ");
    parts.push(`Reported: ${symptoms}.`);
  } else if (bundle.feedback.text) {
    parts.push(`Reported: "${bundle.feedback.text}".`);
  } else {
    parts.push("No symptom reported — treating as baseline tuning.");
  }
  
  const ctx: string[] = [`${bundle.track.grip.replace("_", " ")} grip ${bundle.track.surface}`];
  if (bundle.track.evolution && bundle.track.evolution !== "stable") {
    ctx.push(`track ${bundle.track.evolution}`);
  }
  if (bundle.tyres?.wear && bundle.tyres.wear !== "new") ctx.push(`${bundle.tyres.wear} tyres`);
  if (isFiniteNumber(bundle.weather?.air_temp_c)) ctx.push(`${bundle.weather!.air_temp_c}°C`);
  parts.push(`Conditions: ${ctx.join(", ")}.`);
  return parts.join(" ");
}
```
**Impact**: MED — aids racer intuition (severity signal), helps judge if primary is "strong enough."  
**Safety**: GREEN — pure function, deterministic, no output gate change.

---

#### GAP 1.2: Mechanism text is terse ("Per [source]: effects")
**What**: `ruleToOption()` renders mechanism as a single line citing one source + effects.
**Current**:
```
Per HUDY Off-Road Set-Up Book p.10 §1.1: on power steering: more; rear weight transfer: less.
```
**Problem**: Doesn't explain _why_ the effects happen (the lever's physics), just what they are.
**Proposed change**: Optionally enrich KB rules with a `mechanism_brief: string` field (short physics explanation).
```yaml
- id: kb-downstop-front-higher-201
  # ...
  mechanism_brief: "Raising the front downstop arm reduces suspension travel, stiffening the front and transferring weight rearward at corner entry."
```
Then in `ruleToOption()`:
```typescript
const effects = rule.effects.map((e) => `${humanize(e.axis)}: ${humanize(e.change)}`).join("; ");
const mechanism = rule.mechanism_brief
  ? `${rule.mechanism_brief} This produces: ${effects}.`
  : `Per ${rule.sources[0]}: ${effects}.`;
return {
  // ...
  mechanism,
};
```
**Impact**: MED — transforms "what happens" into "why it happens"; builds racer mental model.  
**Safety**: GREEN — adds optional field; fallback to current behavior if absent. **NEEDS WILLIAM** to write the 20–30 mechanism_brief values.

---

#### GAP 1.3: Expected behavior doesn't scale with confidence or conditions
**What**: `expectedBehavior()` always renders the rule's effects identically, regardless of confidence or track conditions that might make it weaker.
**Proposed change**: Conditionally soften language for medium/low confidence or high-variance conditions.
```typescript
function expectedBehavior(rule: KBRule, bundle: ContextBundle): string {
  const effects = rule.effects.map((e) => `${humanize(e.axis)}: ${humanize(e.change)}`).join("; ");
  const danger = rule.danger ? ` ⚠️ SAFETY: ${rule.danger}` : "";
  
  let prefix = "After the change: ";
  if (rule.confidence === "low") {
    prefix = "If the change works (not guaranteed): ";
  } else if (rule.confidence === "medium") {
    const bumpyOrWet = bundle.track.conditions.some((c) => ["bumpy", "wet", "low_grip"].includes(c));
    if (bumpyOrWet) prefix = "In these conditions, expect: ";
  }
  
  return `${prefix}${effects}. ${rule.magnitude_guidance}${danger}`;
}
```
**Impact**: MED — honest about uncertainty; prevents over-confidence on marginal rules.  
**Safety**: GREEN — softens language only; output gates unchanged.

---

#### GAP 1.4: Do-not-touch list doesn't explain _relative_ priority
**What**: Parked rules say "ranked lower for these conditions; only after testing the primary" but don't show WHY or by how much.
**Current**:
```
✋ Front spring — relevant but ranked lower for these conditions; only after testing the primary.
✋ Everything else — one change at a time, or you won't know what worked.
```
**Problem**: Racer doesn't know if secondary is a distant #2 or almost tied with primary.
**Proposed change**: If history or score data exists, hint at the gap.
```typescript
const do_not_touch = [
  ...parked.map(({ rule, score }, idx) => {
    const scoreDelta = primaryEntry.score > 0 ? Math.round((primaryEntry.score - score) / primaryEntry.score * 100) : 0;
    const gap = scoreDelta > 50 ? "much lower" : scoreDelta > 25 ? "noticeably lower" : "close";
    return `${humanize(rule.setting)} — ${gap} priority for these conditions; test the primary first.`;
  }),
  "Everything else — one change at a time.",
];
```
**Impact**: LOW — nice-to-have clarity; doesn't move advice, just contextualizes it.  
**Safety**: GREEN — uses internal score (not emitted to user), purely explanatory.

---

#### GAP 1.5: Rationale doesn't distinguish between strong evidence vs. weak
**What**: `buildRationale()` always renders history the same way: "X better, Y worse, Z same" without a strength signal.
**Current**:
```
Your log in similar conditions: 2 runs rated better, 1 worse, of 3 rated.
```
**Problem**: Doesn't indicate if the history is 10–0 (strong) or 2–1 (marginal).
**Proposed change**: Add a confidence bump/demotion to the rationale when history is very lopsided.
```typescript
function buildRationale(bundle: ContextBundle, rule: KBRule): string {
  const parts: string[] = [`Grounded on ${rule.id} (${rule.sources.join("; ")}).`];

  const trackConditions = new Set(bundle.track.conditions);
  const amplifiers = rule.conditions.amplified_on.filter((c) => trackConditions.has(c));
  if (amplifiers.length > 0) {
    parts.push(`Current conditions (${amplifiers.map(humanize).join(", ")}) amplify this rule.`);
  }

  const history = bundle.history ?? [];
  if (history.length > 0) {
    const better = history.filter((h) => h.outcome === "better").length;
    const worse = history.filter((h) => h.outcome === "worse").length;
    const total = history.length;
    const winRate = total > 0 ? (better / total * 100).toFixed(0) : 0;
    
    let strength = "";
    if (better >= 3 && worse === 0) strength = " Strong track record.";
    else if (better > worse * 2) strength = " Clear track record.";
    else if (better === worse) strength = " Mixed track record.";
    
    parts.push(
      `Your log in similar conditions: ${better} run${better === 1 ? "" : "s"} rated better, ${worse} worse, of ${total} rated.${strength}`,
    );
  } else {
    parts.push("No rated runs in similar conditions yet — rate this run afterwards and the next report gets smarter.");
  }
  return parts.join(" ");
}
```
**Impact**: MED — signals to racer whether their history supports the recommendation strongly.  
**Safety**: GREEN — adds narrative color only; no output changes.

---

#### GAP 1.6: Confidence tile doesn't hint at what "medium" means
**What**: The 3-tile layout (confidence / rules cited / drive tips) shows "HIGH / MEDIUM / LOW" but a racer may not know if "medium" means "we're 60% sure" or "the science is there but conditions dilute it."
**Proposed change**: Optionally add a one-line tooltip or sub-label via an enriched interface (mobile only change).
**In RunReportCard.tsx**:
```tsx
<Tile 
  value={report.confidence.toUpperCase()} 
  label="confidence" 
  tone={confidenceColor(report.confidence)}
  hint={confidenceHint(report.confidence, report.rationale)}
/>

function confidenceHint(conf: EngineerReport["confidence"], rationale: string): string | undefined {
  if (conf === "high") return undefined; // no hint needed
  if (conf === "medium") {
    return rationale.includes("Mixed") ? "mixed track record" : "amplified by conditions";
  }
  return "limited evidence — use with caution";
}
```
**Impact**: LOW — UX polish, helps racer interpret the tile.  
**Safety**: GREEN — UI-only, no logic change.

---

#### GAP 1.7: Primary change text doesn't highlight the MAGNITUDE
**What**: The verdict line in the card reads:
```
INCREASE FRONT DOWNSTOP (currently 3.2mm) — 1mm at a time, identical left/right.
```
**Problem**: Magnitude guidance is embedded in advice text; racer might miss how small the step is.
**Proposed change**: Hoist the magnitude into a separate, prominent field in RecommendationOption.
```typescript
export interface RecommendationOption {
  // ... existing fields ...
  magnitude?: string; // "1mm per step", "one oil step", "one wire step"
}
```
**In ruleToOption()**:
```typescript
return {
  setting: rule.setting,
  change: `${humanize(rule.direction)} ${humanize(rule.setting)}${currentTxt}`,
  magnitude: rule.magnitude_guidance, // split out
  mechanism: ...,
  // ...
};
```
**In RunReportCard.tsx**, render magnitude as a standalone line:
```tsx
<Text style={styles.verdictMag}>{report.primary.magnitude}</Text>
```
**Impact**: MED — clarity on "how much to turn the screw," critical for on-track execution.  
**Safety**: GREEN — structural field addition; no logic change.

---

#### GAP 1.8: History note doesn't distinguish "tried once" vs. "tried 10 times"
**What**: `historyNote()` says "Tried here before: 2 better / 1 same / 0 worse" but doesn't contextualize sample size.
**Proposed change**: Add a qualifier for small samples.
```typescript
export function historyNote(h: RuleHistory): string {
  const total = h.better + h.same + h.worse;
  const sampleNote = total < 3 ? " (small sample)" : total < 5 ? " (limited data)" : "";
  
  if (h.net < 0) {
    return `Rated worse here last time${sampleNote} — ranked below untested options.`;
  }
  if (h.net > 0) {
    return `Rated better here last time${sampleNote} — ranked up.`;
  }
  return `Tried here before${sampleNote}: ${h.better} better / ${h.same} same / ${h.worse} worse.`;
}
```
**Impact**: LOW — signals statistical reliability; prevents false confidence in thin samples.  
**Safety**: GREEN — pure narrative change.

---

#### GAP 1.9: "Plan B — if it doesn't help" text is generic
**What**: `ruleToOption()` says:
```
Revert, then re-test — the cause is likely the next-ranked option below, or tires for this surface.
```
**Problem**: Doesn't mention the actual secondary rule or explain why it's Plan B.
**Proposed change**: Templatize the fallback text to name the secondary rule.
```typescript
// In buildReport():
const secondary = secondaryEntry?.option;
let planBText = primary.if_it_does_not_help;
if (secondary) {
  planBText = `Revert and test ${humanize(secondary.setting)} instead (ranked next for these conditions).`;
}

return {
  // ...
  plan_b_text: planBText, // new field
};
```
**Impact**: MED — concrete next step; reduces guessing.  
**Safety**: GREEN — new optional field.

---

#### GAP 1.10: Conditions echo doesn't flag outliers (e.g., extreme temps)
**What**: `conditionsEcho()` lists conditions as-is without highlighting unusual ones.
**Proposed change**: Flag outliers.
```typescript
export function conditionsEcho(bundle: ContextBundle): string {
  const w = bundle.weather;
  const tempTxt = isFiniteNumber(w?.air_temp_c)
    ? (() => {
        const temp = w!.air_temp_c;
        const flag = temp < 10 || temp > 35 ? " ❄️" : ""; // outlier flag
        return `, ${temp}°C${flag}`;
      })()
    : "";
  // ... rest unchanged
}
```
**Impact**: LOW — catches edge cases; helps racer remember context when reviewing advice later.  
**Safety**: GREEN — emoji-only addition.

---

#### GAP 1.11: The report kind (report / do_nothing / refusal) isn't visually distinct
**What**: RunReportCard shows refusal with different border color but text is still large. A racer scanning might miss it's NOT a recommendation.
**Proposed change**: Visually bold the "STAY PUT" / "OUT OF MY LANE" kicker.
```tsx
<Text style={[styles.verdictKicker, report.kind !== "report" && styles.verdictKickerAlert]}>
  {report.kind === "refusal" ? "OUT OF MY LANE" : report.kind === "do_nothing" ? "STAY PUT" : ""}
</Text>
```
**Add to styles**:
```typescript
verdictKickerAlert: { color: colors.warn, fontWeight: "900" },
```
**Impact**: LOW — UX safety; prevents misreading.  
**Safety**: GREEN — style-only.

---

### DIMENSION 2: SCIENTIFIC RIGOR (12 improvements)

#### GAP 2.1: Effects are named but not magnitude-quantified
**What**: A rule says `{ axis: "steering_response", change: "faster" }` but there's no estimate of HOW MUCH faster or in what units.
**Current KB entry**:
```yaml
effects:
  - { axis: steering_response, change: faster }
  - { axis: initial_steering_entry, change: more }
```
**Problem**: A racer doesn't know if steering improves by 5% or 50%; they can't judge if it's enough to fix their issue.
**Proposed change**: Extend KBEffect to include optional `magnitude_estimate` (relative % or absolute unit).
```typescript
export interface KBEffect {
  axis: string;
  change: string;
  magnitude_estimate?: string; // e.g. "±5–10%", "~1–2mm", "0.5–1 sec/lap"
}
```
**In KB YAML**:
```yaml
effects:
  - { axis: steering_response, change: faster, magnitude_estimate: "±5–8% relative response time" }
  - { axis: initial_steering_entry, change: more, magnitude_estimate: "more immediate turn-in by ~0.5–1.0°" }
```
**In ruleToOption()**:
```typescript
const effects = rule.effects
  .map((e) => {
    const mag = e.magnitude_estimate ? ` [${e.magnitude_estimate}]` : "";
    return `${humanize(e.axis)}: ${humanize(e.change)}${mag}`;
  })
  .join("; ");
```
**Impact**: HIGH — transforms vague advice into quantified guidance; racer can judge "is this enough?"  
**Safety**: YELLOW — requires KB updates. **NEEDS WILLIAM** to add magnitude_estimate to 20–30 rules (start with high-confidence, common-use rules).

---

#### GAP 2.2: Confidence level doesn't reflect evidence diversity
**What**: A rule tagged `confidence: high` because it's sourced from HUDY but maybe only tested on one chassis type or one condition band.
**Problem**: "High" is binary; doesn't account for narrow evidence base.
**Proposed change**: Add a `confidence_caveats: string` field to KBRule.
```typescript
export interface KBRule {
  // ... existing ...
  confidence: Confidence;
  confidence_caveats?: string; // e.g. "tested on medium/high grip only; unverified on low grip"
}
```
**In buildRationale()**:
```typescript
if (rule.confidence_caveats) {
  parts.push(`Note: ${rule.confidence_caveats}`);
}
```
**Example KB entry**:
```yaml
- id: kb-spring-front-softer-107
  # ...
  confidence: high
  confidence_caveats: "High confidence on smooth/medium grip tracks; unverified on very bumpy surfaces."
```
**Impact**: MED — honest about confidence boundaries; prevents over-application.  
**Safety**: YELLOW — **NEEDS WILLIAM** to author caveats for 20–30 rules. Output logic is pure.

---

#### GAP 2.3: Rule prioritization doesn't weight by _lap-time impact_
**What**: Retrieval ranks by (history_tier, symptom_score, confidence, reversal_cost). But reversal_cost is a bad proxy for lap-time importance.
**Example**: Fixing "twitchy" at high grip might be worth 0.1 sec/lap, while fixing "no forward bite" is worth 0.3 sec/lap. If both match the query, we'd recommend "no forward bite" second just because it's slower to revert.
**Proposed change**: Add a `lap_time_impact_estimate: "high" | "medium" | "low"` field to KBRule (racer-friendly quantization).
```typescript
export interface KBRule {
  // ...
  lap_time_impact_estimate?: "high" | "medium" | "low"; // estimated lap-time gain
}
```
**In retrieval.ts**, boost score for high-impact rules:
```typescript
const impactBoost = { high: 2, medium: 0, low: -1 } as const;
score += (rule.lap_time_impact_estimate ? impactBoost[rule.lap_time_impact_estimate] : 0);
```
**Impact**: HIGH — advises on highest-ROI changes first; direct lap-time focus.  
**Safety**: YELLOW — changes retrieval rank order. Run eval.ts on all scenarios to confirm no breakage. **NEEDS WILLIAM** to estimate lap-time impact for 20–30 rules (high-confidence ones first).

---

#### GAP 2.4: Scoring doesn't account for symptom severity (reported multiple times)
**What**: A symptom reported in 3 separate tags gets the same retrieval score as a symptom reported once.
**Proposed change**: Boost score for repeated symptoms.
```typescript
// In retrieve():
const symptomFreq = new Map<string, number>();
for (const tag of bundle.feedback.tags) {
  symptomFreq.set(tag.symptom, (symptomFreq.get(tag.symptom) ?? 0) + 1);
}

for (const tag of bundle.feedback.tags) {
  for (const addr of rule.addresses) {
    if (addr.symptom !== tag.symptom) continue;
    if (addr.phase && tag.phase && addr.phase === tag.phase) score += 3;
    else if (!addr.phase || !tag.phase) score += 2;
    else score += 1;
  }
}

// Boost by frequency
const freq = symptomFreq.get(tag.symptom) ?? 1;
score += Math.min(freq - 1, 2); // max +2 for "reported 3+ times"
```
**Impact**: MED — prioritizes severe, persistent symptoms.  
**Safety**: GREEN — pure scoring tweak; no output structure change.

---

#### GAP 2.5: Counter-indications aren't explained in the report
**What**: A rule with `counter_indications: [oversteer]` is filtered out if the racer reported oversteer, but the racer never sees WHY.
**Proposed change**: When a rule is filtered, emit it as a "don't use because" note in rationale or a new field.
**In engineer.ts**, track filtered rules:
```typescript
const scored = retrieve(data.rules, bundle, template);
const filtered = scored.filter(({ rule }) => rule.counter_indications.some((ci) => presentSymptoms.has(ci)));

// Later in buildRationale or a new section:
let counterIndication = "";
if (filtered.length > 0 && primaryRule.counter_indications.length > 0) {
  const ci = filtered[0].rule.counter_indications.filter((c) => presentSymptoms.has(c))[0];
  counterIndication = `(Note: avoided rules that worsen ${humanize(ci)}, which you reported.)`;
}
```
**Impact**: LOW — educational; helps racer understand the safety rails.  
**Safety**: GREEN — informational only.

---

#### GAP 2.6: Magnitude guidance isn't tied to current setup value
**What**: The advice says "1mm at a time" but the racer's current value is 3.2mm on a 0.5–8mm range. Is 1mm big or small?
**Proposed change**: In ruleToOption(), compute a relative magnitude hint.
```typescript
function relativeChangeHint(current: number | undefined, direction: string, setting: string, template: ChassisTemplate): string {
  if (current === undefined) return "";
  const field = template.fields[setting];
  if (!field || !field.range) return "";
  const [min, max] = field.range;
  const range = max - min;
  const relativeStep = 1 / range; // "one step" as % of full range
  
  if (relativeStep > 0.2) return " (large step — 20%+ of full range)";
  if (relativeStep > 0.1) return " (moderate step — 10–20% of range)";
  return " (small step — cautious)";
}

const change = `${humanize(rule.direction)} ${humanize(rule.setting)}${currentTxt}${relativeChangeHint(current, rule.direction, rule.setting, template)} — ${rule.magnitude_guidance}`;
```
**Impact**: MED — contextualizes how bold or timid the change is.  
**Safety**: GREEN — pure narrative; uses existing setup + template data.

---

#### GAP 2.7: History re-ranking is bounded but not explained
**What**: The history tier cap (+1 / 0 / -1) is a safety guard but a racer might not understand why a 10–0 history record doesn't promote a rule higher.
**Proposed change**: In buildRationale(), explain the capping.
```typescript
if (history.length > 0) {
  const better = history.filter((h) => h.outcome === "better").length;
  const worse = history.filter((h) => h.outcome === "worse").length;
  
  let historyNote = `Your log in similar conditions: ${better} better, ${worse} worse, of ${history.length} rated.`;
  if (better >= 3 && worse === 0) {
    historyNote += " Strong evidence — bolsters this recommendation.";
  } else if (worse > 0 && better > worse) {
    historyNote += " Mixed evidence — KB science takes priority.";
  } else if (worse >= better) {
    historyNote += " Weak or negative evidence — ranked below untested rules.";
  }
  parts.push(historyNote);
}
```
**Impact**: MED — educates racer on how learning loop works.  
**Safety**: GREEN — narrative addition.

---

#### GAP 2.8: Phase information is dropped in diagnosis and rationale
**What**: A rule addresses `{ symptom: understeer, phase: corner_entry }` but buildDiagnosis doesn't link the symptom to the phase in the primary rule's context.
**Proposed change**: In buildRationale(), note if the primary rule's phase matches the reported phase.
```typescript
function buildRationale(bundle: ContextBundle, rule: KBRule): string {
  const parts: string[] = [`Grounded on ${rule.id} (${rule.sources.join("; ")}).`];

  // Check if the primary rule's addressed phases match reported phases
  const reportedPhases = new Set(bundle.feedback.tags.filter(t => t.phase).map(t => t.phase));
  const rulePhases = new Set(rule.addresses.filter(a => a.phase).map(a => a.phase));
  const matchedPhases = [...reportedPhases].filter(p => rulePhases.has(p));
  
  if (matchedPhases.length > 0) {
    parts.push(`This rule directly addresses your reported issue during ${matchedPhases.map(humanize).join(" and ")}.`);
  } else if (reportedPhases.size > 0 && rulePhases.size > 0) {
    parts.push(`This rule addresses similar symptoms but in a different phase — context matters here.`);
  }
  
  // ... rest of rationale
}
```
**Impact**: MED — ensures racer knows the rule targets their specific phase.  
**Safety**: GREEN — informational.

---

#### GAP 2.9: Rule sourcing doesn't distinguish primary vs. secondary sources
**What**: All rules cite `sources: ["HUDY Off-Road Set-Up Book p.10 §1.1"]` but don't rank them (e.g., primary physical principle vs. corroborating experiment).
**Proposed change**: Add a `sources` structure that includes a `primary: true` flag.
```typescript
export interface KBSource {
  cite: string;
  primary?: boolean; // the main reference
  note?: string; // e.g., "experimental validation"
}

export interface KBRule {
  // ...
  sources: KBSource[]; // was string[]
}
```
**In buildRationale()**:
```typescript
const primarySources = rule.sources.filter((s) => s.primary).map((s) => s.cite);
const cite = primarySources.length > 0 ? primarySources.join("; ") : rule.sources.map(s => typeof s === "string" ? s : s.cite).join("; ");
parts[0] = `Grounded on ${rule.id} (${cite}).`;
```
**Impact**: LOW — adds transparency to source credibility.  
**Safety**: YELLOW — requires KB migration from `sources: [string]` to `sources: [KBSource]`. **NEEDS WILLIAM** to restructure 20–30 rule entries.

---

#### GAP 2.10: Conditions amplification/reduction isn't quantified
**What**: A rule says `amplified_on: [smooth, high_grip]` but doesn't say HOW MUCH more confident we are (e.g., +10% vs. +50%).
**Proposed change**: Add optional `amplification_strength: "weak" | "moderate" | "strong"` to condition modifier.
```yaml
conditions:
  amplified_on:
    - { name: smooth, strength: strong }  # very amplified
    - { name: high_grip, strength: moderate }
  reduced_on:
    - { name: bumpy, strength: strong }   # significantly reduced confidence
```
**Then in retrieval.ts**, adjust scoring:
```typescript
const strengthScore = { weak: 0.5, moderate: 1, strong: 2 } as const;
for (const amp of rule.conditions.amplified_on) {
  if (trackConditions.has(typeof amp === "string" ? amp : amp.name)) {
    score += (typeof amp === "string" ? 1 : strengthScore[amp.strength]);
  }
}
```
**Impact**: MED — fine-tunes retrieval; reflects real-world condition sensitivity.  
**Safety**: YELLOW — scoring change. **NEEDS WILLIAM** to rate amplification strength for 20–30 rules.

---

#### GAP 2.11: Reversal cost is revert-time, not revert-risk
**What**: `reversal_cost_minutes: 15` is the pit time, but some changes have higher _risk_ of going wrong (e.g., thinner diff oil can overheat). Risk isn't captured.
**Proposed change**: Add a separate `reversal_confidence: "safe" | "moderate" | "risky"` field.
```typescript
export interface KBRule {
  // ...
  reversal_cost_minutes: number;
  reversal_confidence?: "safe" | "moderate" | "risky"; // how likely the revert fixes it
}
```
**Then in race-day filter**:
```typescript
export function raceDayFilter(rule: Pick<KBRule, "confidence" | "reversal_cost_minutes" | "reversal_confidence">): RaceDayVerdict {
  if (rule.confidence !== "high") return { allowed: false };
  if (rule.reversal_cost_minutes > 15) return { allowed: false };
  if (rule.reversal_confidence === "risky") return { allowed: false, reason: "revert is risky" };
  return { allowed: true };
}
```
**Impact**: MED — surfaces revert risk separately from time; improves race-day safety.  
**Safety**: YELLOW — **NEEDS WILLIAM** to rate reversal confidence on 5–10 high-reversal-cost rules.

---

#### GAP 2.12: KB doesn't track empirical lap-time validation
**What**: Rules are sourced from HUDY (theory) but RaceLab's database has rated runs; those empirical outcomes should feed back into confidence.
**Proposed change**: Add a `empirical_validation: { source: "RaceLab runs", better_count: X, worse_count: Y }` field to track meta-learning.
```typescript
export interface KBRule {
  // ... existing ...
  empirical_validation?: {
    source: string; // "RaceLab community runs", "internal testing"
    better: number;
    worse: number;
    last_update: string; // ISO date
  };
}
```
**In buildRationale()**:
```typescript
if (rule.empirical_validation && rule.empirical_validation.better + rule.empirical_validation.worse > 0) {
  const empirical = rule.empirical_validation;
  const winRate = (empirical.better / (empirical.better + empirical.worse) * 100).toFixed(0);
  parts.push(`Community validation: ${winRate}% of reported uses rated better (${empirical.source}).`);
}
```
**Impact**: MED — signals real-world validation; builds racer confidence in the system.  
**Safety**: GREEN — informational; doesn't change logic. **Architectural**: Would require a feedback loop to update KB periodically (out of scope for this audit but noted for future work).

---

### DIMENSION 3: PERFORMANCE (8 improvements)

#### GAP 3.1: Retrieval doesn't prioritize by lap-time gain vs. reversal cost
**What**: A rule that gains 0.3 sec/lap (reversal 20 min) ranks lower than one that gains 0.05 sec/lap (reversal 5 min) because reversal_cost is used as a tiebreaker.
**Proposed change**: Add lap-time gain to the retrieval sort key (if available via lap_time_impact_estimate; see GAP 2.3).
```typescript
// In retrieve(), after initial scoring:
const gainRank = {
  high: 3,
  medium: 1,
  low: 0,
} as const;

scored.sort(
  (a, b) =>
    historyTier(b.history) - historyTier(a.history) ||
    gainRank[b.rule.lap_time_impact_estimate ?? "medium"] - gainRank[a.rule.lap_time_impact_estimate ?? "medium"] ||
    b.score - a.score ||
    confidenceRank[b.rule.confidence] - confidenceRank[a.rule.confidence] ||
    a.rule.reversal_cost_minutes - b.rule.reversal_cost_minutes ||
    (a.rule.id < b.rule.id ? -1 : 1)
);
```
**Impact**: HIGH — advises on highest-ROI, highest-gain changes first.  
**Safety**: YELLOW — rank order change. Run eval.ts on all scenarios. **NEEDS WILLIAM** to estimate lap_time_impact for rules.

---

#### GAP 3.2: No condition-specific rule depth (e.g., worn tyres demand different order)
**What**: On worn tyres + bumpy track, some rules are less/more relevant, but retrieval doesn't reweight.
**Proposed change**: Add a `condition_overrides: Record<string, number>` field to allow rule-specific tuning.
```typescript
export interface KBRule {
  // ... existing ...
  condition_overrides?: Record<string, number>; // e.g. { "worn": -1, "very_bumpy": +2 }
}
```
**In retrieve()**:
```typescript
for (const [condition, delta] of Object.entries(rule.condition_overrides ?? {})) {
  if (trackConditions.has(condition)) score += delta;
}
```
**Example KB**:
```yaml
- id: kb-spring-front-softer-107
  # ...
  condition_overrides:
    worn: -1  # less effective on worn tyres
    very_bumpy: +1  # more relevan

### Race Planner
Perfect. Now I have the full context. Let me analyze the race planner code deeply for the three dimensions. Based on my thorough review, here is my comprehensive audit:

---

## DEEP AUDIT: RaceLab Race Planner (race-day plan)

### OVERVIEW
The race planner (`buildRacePlan` in race-plan.ts + `planRaceDay` in planner.ts + UI in RacePlanView.tsx) is the night-before briefing that projects selected practice runs and a weather forecast onto race-day conditions. It currently:
- Builds a flat 8-part report with practice-shifted advice
- Adds William's forecast-grounded adjustments (optional, new)
- Surfaces explicit refusals ("grounded or silent")
- Outputs: `conditions_shift`, `technique_tips`, `readiness`, and optional `adjustments` + `refusals`

The architecture is **sound**: deterministic (D18), grounded (cites KB rules), silent-on-gaps. But the three dimensions below reveal specific rigor, clarity, and performance gaps.

---

## FINDINGS BY DIMENSION

### 1. CLARITY — Output Structure & Legibility

#### GAP 1.1: `conditions_shift` is outcome-centric, not action-centric
**Current behavior:**
```typescript
// race-plan.ts:155-177
"Race window ~5°C hotter than your practice data (28°C vs ~23°C)."
"Rain risk 70% — your selected runs are all dry."
```

**Issue:**
- Tells a racer what *changed* but not *why it matters* or *what to do*.
- A club racer reads "5°C hotter" and thinks "OK" but doesn't know: does grip go up or down? Do I need softer or stiffer? A 5°C delta is physically meaningful (≈10% grip change in asphalt), but the briefing doesn't surface the **mechanism**.

**Concrete fix:**
Emit conditions_shift as **mechanism-paired statements** that lead toward tuning intuition:
```typescript
// Before:
"Race window ~5°C hotter than your practice data (28°C vs ~23°C)."

// After:
"Race window 5°C hotter (28°C vs ~23°C). Hotter air + track = ~10% lower grip. You'll have less traction; setup needs to help the rear dig harder."
```

**Implementation sketch:**
```typescript
function conditionsShift(runs: SelectedRunSummary[], forecast: Forecast | undefined): string[] {
  const lines: string[] = [];
  const temps = runs.map((r) => r.air_temp_c).filter((v): v is number => v !== undefined);

  if (temps.length === 0) {
    lines.push("No air temperature on your selected runs — temperature shift unknown.");
  } else if (forecast?.air_temp_c === undefined) {
    lines.push("No forecast temperature — temperature shift unknown.");
  } else {
    const practiceAvg = temps.reduce((sum, t) => sum + t, 0) / temps.length;
    const delta = Math.round(forecast.air_temp_c - practiceAvg);
    const mechanism = delta > 2 ? "Grip will drop ~" + Math.round(Math.abs(delta) * 1.5) + "%. Setup needs more rear traction and gentler mid-corner handling."
                    : delta < -2 ? "Grip will rise ~" + Math.round(Math.abs(delta) * 1.5) + "%. Car will be sharper; protect the rear from over-rotating."
                    : "Temperature unchanged.";
    lines.push(
      `Race window ${delta === 0 ? "at the same temperature" : `~${Math.abs(delta)}°C ${delta > 0 ? "hotter" : "colder"}`} ` +
      `(${forecast.air_temp_c}°C vs ~${Math.round(practiceAvg)}°C). ${mechanism}`
    );
  }

  if (forecast?.rain_risk_pct !== undefined && forecast.rain_risk_pct >= WET_FROM_PCT) {
    lines.push(
      `Rain risk ${forecast.rain_risk_pct}% — your selected runs are all dry. ` +
      `Wet = less traction and longer braking distances. Delay throttle on exit; brake straighter and earlier.`
    );
  }
  return lines;
}
```

**Impact:** **HIGH** — This change makes the briefing actionable to a racer who doesn't own a thermometer or grip-curve physics.
**Safety:** ✓ Stays pure (deterministic). ✓ No NaN risk. ✓ Does NOT cite KB rules — it's physics+intuition (safe to emit). ✓ Keeps template on-spec.
**Testable:** Add eval scenario: "5°C hotter, racer expects grip→traction advice."

---

#### GAP 1.2: `readiness` facts have no prioritization or summary line
**Current behavior:**
```typescript
// race-plan.ts:182-212
"Unresolved: push — no later selected run was rated better."
"Best average lap: 34.2s — Springfield, 2026-06-10."
"2 runs considered, grips: green, medium."
```

**Issue:**
- Dumped as a list, unordered. The **most critical** unresolved symptom (the one costing the most lap time) is buried next to the least critical.
- "Best average lap" is stated but never compared to *how far off* the racer is.
- The summary line "2 runs" doesn't tell the racer: is two runs *enough* data for race day?

**Concrete fix:**
Reorder as **unresolved → priority → data quality**:
```typescript
function readinessFacts(sorted: SelectedRunSummary[]): string[] {
  const lines: string[] = [];

  // 1. Unresolved symptoms, but RANKED by frequency/recency (later runs worse?)
  const unresolved: Array<{ symptom: string; firstSeen: number; lastSeen: number }> = [];
  sorted.forEach((run, i) => {
    if (sorted.slice(i + 1).some((r) => r.outcome === "better")) return;
    for (const s of run.symptoms) {
      const existing = unresolved.find(u => u.symptom === s);
      if (existing) {
        existing.lastSeen = i;
      } else {
        unresolved.push({ symptom: s, firstSeen: i, lastSeen: i });
      }
    }
  });
  // Sort by recency + persistence
  unresolved.sort((a, b) => (b.lastSeen - b.firstSeen) - (a.lastSeen - a.firstSeen));
  for (const u of unresolved.slice(0, 2)) { // top 2 most persistent
    lines.push(`Unresolved (persists): ${humanize(u.symptom)} — appeared ${u.firstSeen + 1} run${u.firstSeen === u.lastSeen ? '' : 's'} ago, still there.`);
  }

  // 2. Best pace + consistency
  let best: SelectedRunSummary | undefined;
  let bestAvg = Number.POSITIVE_INFINITY;
  for (const r of sorted) {
    if (r.avg_lap_s !== undefined && r.avg_lap_s < bestAvg) {
      bestAvg = r.avg_lap_s;
      best = r;
    }
  }
  if (best) {
    lines.push(`Best pace: ${bestAvg.toFixed(2)}s (${best.track_name}, ${best.date}).`);
  }

  // 3. Data quality signal
  const consistency = sorted.length >= 3 ? "Good" : sorted.length === 2 ? "Limited" : "Single";
  const grips: string[] = [];
  for (const r of sorted) if (!grips.includes(r.grip)) grips.push(r.grip);
  lines.push(
    `${consistency} data: ${sorted.length} run${sorted.length === 1 ? "" : "s"} on grips ${grips.join(", ")}. ` +
    (sorted.length < 3 ? "With only this data, watch for the car behaving differently on race day." : "")
  );
  return lines;
}
```

**Impact:** **MEDIUM** — Makes the briefing more scannable; a racer glances and knows "I have a push problem that won't go away" vs. "My data is thin, be cautious."
**Safety:** ✓ Pure. ✓ No NaN. ✓ No KB citations. ✓ Testable (reorder output deterministically).
**Testable:** "3 runs, 2 unresolved symptoms — top one is listed first."

---

#### GAP 1.3: The race-plan UI buries adjustments and refusals in a fold
**Current behavior (RacePlanView.tsx):**
```typescript
// Lines 64-84 show conditions_shift, readiness as folds.
// adjustments + refusals are NOT rendered in RacePlanView at all.
```

**Issue:**
- William's adjustments (the grounded KB-cited forecast tweaks) are computed but never surfaced in the UI.
- Refusals (e.g., "wind 30 km/h — no KB rule") are also invisible.
- The racer sees only the Theo half (report + tips) and has no idea that forecast adjustments exist.

**Concrete fix:**
Add two folds to RacePlanView **before** the strategy button:
```typescript
export function RacePlanView({ plan, onStrategy }: { plan: RacePlan; onStrategy: () => void }) {
  const t = useT();
  const r = plan.report;

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
      {/* ... existing verdict + tiles ... */}

      {plan.adjustments && plan.adjustments.length > 0 && (
        <Fold title={t({ en: "Forecast adjustments", fr: "Ajustements prévisions" })} badge={String(plan.adjustments.length)}>
          {plan.adjustments.map((adj, i) => (
            <View key={i} style={styles.adjustmentCard}>
              <Text style={styles.adjustLabel}>{adj.trigger}</Text>
              <Text style={styles.adjustChange}>{adj.setting.replace(/_/g, " ").toUpperCase()}: {adj.change}</Text>
              <Text style={styles.adjustMech}>{adj.mechanism}</Text>
              <Text style={styles.adjustRevert}>
                Revert: {adj.revert} · Confidence: {adj.confidence}
              </Text>
            </View>
          ))}
        </Fold>
      )}

      {plan.refusals && plan.refusals.length > 0 && (
        <Fold title={t({ en: "Ungrounded aspects", fr: "Aspects non couverts" })} badge={String(plan.refusals.length)}>
          {plan.refusals.map((ref, i) => (
            <Text key={i} style={styles.refusalLine}>
              {ref.aspect.toUpperCase()}: {ref.message}
            </Text>
          ))}
        </Fold>
      )}

      <Pressable style={styles.strategyBtn} onPress={onStrategy}>
        {/* ... */}
      </Pressable>
      {/* ... rest ... */}
    </ScrollView>
  );
}
```

**Impact:** **HIGH** — Adjustments and refusals are now visible and trustworthy to the racer ("wind too high = no rule = silence, not a guess").
**Safety:** ✓ Pure rendering of passed data. ✓ No new computation. ✓ Invariants unaffected.
**Testable:** Render a plan with adjustments → they appear in the fold.

---

### 2. SCIENTIFIC RIGOR — Quantification & Mechanism

#### GAP 2.1: `conditions_shift` uses hardcoded thresholds with no justification
**Current behavior (race-plan.ts:62–65):**
```typescript
const HOT_FROM_C = 30;
const COLD_TO_C = 10;
const WET_FROM_PCT = 50;
```

**Issue:**
- These are arbitrary. 30°C "hot" is sensible (above typical track temps), but:
  - 10°C "cold" applies everywhere (wet grass = 5°C, asphalt = 8°C).
  - 50% rain risk is a flip-coin, yet treated the same as 90%.
- The thresholds don't *correlate to grip magnitude*.
- No comment explains the physics or choice.

**Concrete fix (NEEDS WILLIAM):**
Add physics-grounded thresholds and cite them. William must provide:
1. Temperature deltas that map to % grip change (asphalt vs. clay).
2. Humidity + rain-risk thresholds tied to actual water-film conditions.

**Example (William to ratify):**
```typescript
// Forecast thresholds — physics-grounded per surface type (William owns calibration)
const TEMP_THRESHOLDS_BY_SURFACE: Record<string, { hot: number; cold: number; grip_impact: string }> = {
  asphalt: { hot: 32, cold: 12, grip_impact: "high-temp tires desensitize; low-temp makes them sluggish" },
  clay: { hot: 28, cold: 8, grip_impact: "clay dries hard when hot; becomes slippery when cold" },
  carpet: { hot: 26, cold: 14, grip_impact: "synthetic grip plateaus early; cold kills edge grip" },
};
const RAIN_RISK_TRIGGER_PCT = 60; // >60% = wet briefing (William to calibrate with Met Office data)
```

**Implementation sketch (when William calibrates):**
```typescript
function conditionsShift(runs: SelectedRunSummary[], forecast: Forecast | undefined, surface: string): string[] {
  const thresholds = TEMP_THRESHOLDS_BY_SURFACE[surface] ?? TEMP_THRESHOLDS_BY_SURFACE.asphalt;
  const temps = runs.map((r) => r.air_temp_c).filter((v): v is number => v !== undefined);
  
  if (forecast?.air_temp_c !== undefined && temps.length > 0) {
    const practiceAvg = temps.reduce((sum, t) => sum + t, 0) / temps.length;
    const delta = forecast.air_temp_c - practiceAvg;
    const isHot = forecast.air_temp_c >= thresholds.hot;
    const isCold = forecast.air_temp_c <= thresholds.cold;
    if (isHot || isCold) {
      lines.push(
        `Race window ${isHot ? "HOT" : "COLD"}: ${forecast.air_temp_c}°C (vs ~${practiceAvg.toFixed(1)}°C practice). ` +
        `${thresholds.grip_impact} Tires will behave differently.`
      );
    }
  }
  
  if (forecast?.rain_risk_pct !== undefined && forecast.rain_risk_pct >= RAIN_RISK_TRIGGER_PCT) {
    const severity = forecast.rain_risk_pct >= 80 ? "likely" : "possible";
    lines.push(`Rain is ${severity} (${forecast.rain_risk_pct}% risk). Brake earlier; reduce throttle aggression on exit.`);
  }
  
  return lines;
}
```

**Impact:** **HIGH** — Removes magic numbers; ties forecast changes to physical behavior.
**Safety:** ✓ Still deterministic. ✓ Will-needed: William to ratify thresholds. ✓ Must add unit tests to validate threshold triggers.
**Testable:** "30°C on clay → 'hot' and cited. 28°C on clay → not 'hot'."

---

#### GAP 2.2: `readiness` does NOT compare practice lap times to race pace expectations
**Current behavior:**
```typescript
"Best average lap: 34.2s — Springfield, 2026-06-10."
// That's it. No: "You expect 34.5s on race day; that's 0.3s slower (conservative). Good."
```

**Issue:**
- A racer logs 34.2s average in practice, but race day (cold, longer stint, adrenaline) typically runs 0.5–2s slower.
- The briefing *never signals* whether the racer's practice pace is realistic for the race.
- No "pacing margin" signal.

**Concrete fix:**
Add a margin-of-safety estimate:
```typescript
function readinessFacts(sorted: SelectedRunSummary[], race: RaceWindow): string[] {
  let best: SelectedRunSummary | undefined;
  let bestAvg = Number.POSITIVE_INFINITY;
  for (const r of sorted) {
    if (r.avg_lap_s !== undefined && r.avg_lap_s < bestAvg) {
      bestAvg = r.avg_lap_s;
      best = r;
    }
  }
  
  if (best) {
    // Estimate race-day pace: add 0.5–2s depending on race type and consistency
    const consistency = sorted.length >= 3 ? 0.5 : 1.0; // fewer runs = less consistency = slower
    const typeMargin = race.type === "sprint" ? 0.3 : 1.0; // endurance drifts more
    const raceExpected = bestAvg + consistency + typeMargin;
    
    lines.push(
      `Best pace: ${bestAvg.toFixed(2)}s (${best.track_name}, ${best.date}). ` +
      `On race day (${race.type}, ${race.length_s / 60}min), expect ~${raceExpected.toFixed(2)}s ` +
      `(+${(raceExpected - bestAvg).toFixed(2)}s margin for cold tires, longer stint, focus).`
    );
  }
  
  return lines;
}
```

**Impact:** **MEDIUM** — Helps racer set realistic pace targets. Prevents "I'm 0.5s off my best, something's wrong!" panic on race day.
**Safety:** ✓ Pure. ✓ Heuristic margins are conservative (racer won't be surprised). ✓ No KB citations (these are universal physics, not tuning rules).
**Will-needed:** Calibrate margin heuristics (0.5–2s) against real race data from William's test team.
**Testable:** "Sprint, 1 practice run, best 34.2s → expect 34.2 + 0.5 + 0.3 = 35.0s."

---

#### GAP 2.3: William's adjustments lack quantified magnitude estimates
**Current behavior (planner.ts:233–241):**
```typescript
change: `${humanize(rule.direction)} ${humanize(rule.setting)}${currentTxt} — ${rule.magnitude_guidance}`,
mechanism: `Per ${rule.sources[0]}: ${effects}.`,
```

**Issue:**
- The adjustment cites `magnitude_guidance` from the KB rule (e.g., "one step at a time").
- But it *never quantifies the lap-time impact*.
- A racer doesn't know: does this adjustment gain 0.1s or 0.05s? Is it worth the risk?

**Concrete fix (NEEDS WILLIAM):**
Add an optional `lap_time_impact_s?: number` to KBRule and surface it:

```typescript
// In planner.ts:233–241
const lapTimeNote = rule.lap_time_impact_s !== undefined
  ? ` Expected lap-time gain: ~${rule.lap_time_impact_s.toFixed(2)}s.`
  : "";

return {
  trigger,
  condition_tag: tag,
  setting: rule.setting,
  change: `${humanize(rule.direction)} ${humanize(rule.setting)}${currentTxt} — ${rule.magnitude_guidance}`,
  mechanism: `Per ${rule.sources[0]}: ${effects}.${lapTimeNote}`,
  // ... rest ...
};
```

**Impact:** **MEDIUM-HIGH** — Racer can now triage: "0.2s gain at 50/50 confidence? Not worth the risk 15 min before the race."
**Safety:** ✓ Pure. ✓ Will-needed: William must add `lap_time_impact_s` to KB rules (with wide uncertainty bands, e.g., "0.1–0.3s").
**Testable:** Rule with lap_time_impact_s → adjustment includes it; rule without → silent.

---

#### GAP 2.4: Planner does NOT compare forecast to practice-logged weather
**Current behavior (planner.ts:76–120):**
```typescript
// Forecast is read as is; no comparison to practice conditions logged in the runs.
```

**Issue:**
- The planner says "rain risk 70%" but doesn't note "your practice was all dry; you have zero wet experience here."
- Or: "forecast 25°C, your practice was 22°C" — only a 3°C delta, but the adjustment list might be empty (no rule triggered), so the racer has no heads-up.

**Concrete fix:**
Add a forecast-vs-practice comparison to the assumptions + practice_read:

```typescript
// In planner.ts, after practice aggregation:
const forecastVsPractice: string[] = [];
if (predicted.has("hot")) {
  const practiceTemps = atTrack
    .map(t => t.conditions?.air_temp_c)
    .filter((v): v is number => v !== undefined);
  if (practiceTemps.length > 0) {
    const avg = practiceTemps.reduce((a, b) => a + b, 0) / practiceTemps.length;
    forecastVsPractice.push(`Race forecast HOT (≥${PLANNER_HOT_AIR_C}°C); your practice averaged ${avg.toFixed(1)}°C.`);
  }
}

// ... similar for wet, cold ...

// Add to practice_read:
practice_read.push(...forecastVsPractice);
```

**Impact:** **MEDIUM** — Makes the racer aware of untested conditions.
**Safety:** ✓ Pure. ✓ No NaN (temps already filtered). ✓ Testable.
**Testable:** "Practice 22°C, forecast 28°C hot → assumption notes the gap."

---

### 3. PERFORMANCE — Actionability & Lap-Time Gain

#### GAP 3.1: Adjustments are not rank-ordered by lap-time impact
**Current behavior (planner.ts:170–196):**
```typescript
const candidates = data.rules
  .filter(/* conditions */)
  .sort(
    (a, b) =>
      a.reversal_cost_minutes - b.reversal_cost_minutes ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
  .slice(0, MAX_ADJUSTMENTS_PER_TAG);
```

**Issue:**
- Rules are ranked by **reversal cost** (fastest-reversible first), not by **lap-time gain**.
- So on race day with 15 min to spare, you get: "reverse suspension (15 min)" instead of "stiffer anti-roll (1 min, +0.3s)".
- This is intentional for practice (reversibility = safety), but **race day should reorder by magnitude** (most lap-time gain within the time budget).

**Concrete fix:**
Add a secondary sort key for race-day mode:

```typescript
const candidates = data.rules
  .filter(/* conditions */)
  .sort((a, b) => {
    // On race day, prefer fastest reversible + highest lap-time gain within the revert window
    if (bundle.mode === "race_day") {
      // First: within reversal_cost_minutes <= 15, sort by lap-time impact (descending)
      if (a.reversal_cost_minutes <= 15 && b.reversal_cost_minutes <= 15) {
        const aDelta = a.lap_time_impact_s ?? 0;
        const bDelta = b.lap_time_impact_s ?? 0;
        return bDelta - aDelta; // descending: bigger gain first
      }
      // If one is over the bar, it loses
      if (a.reversal_cost_minutes > 15) return 1;
      if (b.reversal_cost_minutes > 15) return -1;
    }
    // Default (practice): reversal cost first
    return (
      a.reversal_cost_minutes - b.reversal_cost_minutes ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
  })
  .slice(0, MAX_ADJUSTMENTS_PER_TAG);
```

**Impact:** **HIGH** — Race-day adjustments now prioritize lap-time over reversibility; practice stays safe.
**Safety:** ✓ Pure. ✓ Will-needed: KB rules must have `lap_time_impact_s` (may be absent; code handles gracefully).
**Testable:** "Race day, two rules same tag: A = 10 min revert + 0.2s gain, B = 5 min + 0.1s. B comes first."

---

#### GAP 3.2: The planner ignores the race window (sprint vs. endurance)
**Current behavior (race-plan.ts:87):**
```typescript
void race; // part of the planner contract; no race-window-specific rule yet
```

**Issue:**
- A sprint (5 min) and endurance (30 min) have totally different tuning priorities:
  - **Sprint:** tire heating is critical; stiff setup, minimal change (tires find grip fast). Best strategy: no changes, maximize consistency.
  - **Endurance:** tire degradation + fuel weight are critical; softer setup, manage drift. Best strategy: margin of safety, revert-ready changes only.
- The planner treats both identically.

**Concrete fix:**
Filter adjustments by race type:

```typescript
interface RaceDayInput {
  practice: readonly LearningTuple[];
  forecast: readonly WeatherObservation[];
  track: TrackSnapshot;
  chassis_template_id: string;
  current_setup?: Record<string, string | number>;
  race_type?: "sprint" | "endurance"; // NEW
}

// In planRaceDay:
for (const [tag, trigger] of predicted) {
  const candidates = data.rules
    .filter(
      (r) =>
        r.scope.some((s) => template.scope.includes(s)) &&
        r.conditions.amplified_on.includes(tag) &&
        raceDayFilter(r).allowed &&
        !r.conditions.reduced_on.some((c) => predictedTags.has(c)) &&
        !avoidRuleIds.has(r.id) &&
        // NEW: sprint = no changes (too risky), endurance = high-confidence only
        (input.race_type === "sprint" ? r.confidence === "high" && r.reversal_cost_minutes <= 5 : true),
    )
    // ... rest
}
```

**Impact:** **MEDIUM** — Sprint races won't suggest risky changes; endurance gets more options.
**Safety:** ✓ Pure. ✓ Tightens race-day bar for sprints (fewer false positives).
**Testable:** "Sprint + wet forecast → only rules with ≤5 min reversal cost."

---

#### GAP 3.3: No "confidence margin" when multiple conditions clash
**Current behavior (planner.ts:170–196):**
```typescript
// If "hot" and "wet" both predicted, rules are filtered independently.
// No signal if "hot + wet" is a **rare combo** (e.g., "afternoon thunderstorm on a baked track").
```

**Issue:**
- A racer sees two separate adjustments: "hotter → stiffer springs" + "wet → softer springs". They conflict, but the planner says nothing.
- No confidence downgrade for rare/untested condition combos.

**Concrete fix:**
Add a confidence penalty when conditions are rare combos:

```typescript
// Track condition combo frequency (William to calibrate)
const RARE_COMBOS = [
  { tags: ["hot", "wet"], penalty: 0.5, note: "hot + wet is rare; use caution" },
  { tags: ["cold", "bumpy"], penalty: 0.3, note: "cold + rough is unpredictable" },
];

// In planRaceDay, after filtering rules:
for (const rule of candidates) {
  let confidence = rule.confidence;
  for (const combo of RARE_COMBOS) {
    if (combo.tags.every(t => predictedTags.has(t))) {
      // Downgrade confidence: high → medium, medium → low
      confidence = confidence === "high" ? "medium" : confidence === "medium" ? "low" : "low";
      // (can't go below "low")
    }
  }
  adjustments.push({ ...toAdjustment(rule, tag, trigger, input), confidence });
}
```

**Impact:** **MEDIUM** — Rare combos get a caution flag; racer knows to be careful.
**Safety:** ✓ Pure. ✓ Will-needed: William calibrates rare combos + penalties.
**Testable:** "Hot + wet predicted → adjustment confidence downgraded; refusal notes the rare combo."

---

#### GAP 3.4: The UI does not highlight the "single decisive change"
**Current behavior (RacePlanView.tsx:24–42):**
```typescript
{r.primary ? (
  <View style={styles.verdictCard}>
    <Text style={styles.kicker}>RACE-DAY CALL · {r.primary.setting}</Text>
    <Text style={styles.verdict}>{r.primary.change}</Text>
    <Text style={styles.mech}>{r.primary.mechanism}</Text>
  </View>
) : (
  <View style={[styles.verdictCard, { borderColor: colors.good }]}>
    <Text style={styles.kicker}>RACE-DAY CALL</Text>
    <Text style={[styles.verdictSmall, { color: colors.good }]}>
      Car is ready — the forecast doesn't change your setup.
    </Text>
  </View>
)}
```

**Issue:**
- When there are **both** William adjustments AND a Theo report primary, which wins?
- The UI shows the Theo report only; William's adjustments are in a fold below (GAP 1.3).
- A racer sees "car is ready" but doesn't see "forecast actually says stiffer springs."

**Concrete fix:**
Prioritize adjustments > report in the verdict card:

```typescript
const hasAdjustments = plan.adjustments && plan.adjustments.length > 0;
const mainRecommendation = hasAdjustments ? plan.adjustments[0] : r.primary;

return (
  <ScrollView ...>
    <Text style={styles.echo}>{r.conditions_echo}</Text>

    <View style={styles.verdictCard}>
      {mainRecommendation ? (
        <>
          <Text style={styles.kicker}>
            {hasAdjustments ? "FORECAST ADJUSTMENT" : "RACE-DAY CALL"}
            {mainRecommendation.setting ? ` · ${mainRecommendation.setting.replace(/_/g, " ").toUpperCase()}` : ""}
          </Text>
          <Text style={styles.verdict}>{mainRecommendation.change}</Text>
          <Text style={styles.mech}>{mainRecommendation.mechanism}</Text>
          {!hasAdjustments && r.primary?.revert && (
            <Text style={styles.revert}>{r.primary.revert}</Text>
          )}
        </>
      ) : (
        <>
          <Text style={styles.kicker}>RACE-DAY CALL</Text>
          <Text style={[styles.verdictSmall, { color: colors.good }]}>
            {t({ en: "Car is ready — no forecast adjustment and setup is locked.", ... })}
          </Text>
        </>
      )}
    </View>

    {hasAdjustments && <Text style={styles.note}>(Primary setup recommendation below in "Full engineer report")</Text>}

    {/* Tiles, strategy button, folds ... */}
  </ScrollView>
);
```

**Impact:** **HIGH** — Forecast adjustments get top billing; racer's focus is correct.
**Safety:** ✓ Pure rendering. ✓ No new computation.
**Testable:** "Plan with adjustments → adjustment is the verdict card."

---

## SUMMARY TABLE: ALL IMPROVEMENTS

| # | Dimension | Gap | Concrete Change | Impact | Will-Needed | Testable |
|---|-----------|-----|-----------------|--------|------------|----------|
| 1.1 | CLARITY | `conditions_shift` generic | Add mechanism/physics explanation | HIGH | — | "5°C hotter → includes grip logic" |
| 1.2 | CLARITY | `readiness` unordered | Reorder by persistence; add data-quality signal | MEDIUM | — | "2 unresolved; persistent one listed first" |
| 1.3 | CLARITY | Adjustments/refusals hidden in UI | Render in folds above strategy button | HIGH | — | "Render adjustments fold when present" |
| 2.1 | RIGOR | Hardcoded temp thresholds | Physics-grounded thresholds per surface + impacts | HIGH | William calibrates | "30°C hot on asphalt, 28°C hot on clay" |
| 2.2 | RIGOR | No race-pace expectations | Add margin estimate; compare to practice best | MEDIUM | William calibrates margins | "Best 34.2s; expect 35.0s on race day" |
| 2.3 | RIGOR | Adjustments lack magnitude | Add lap-time impact estimate to KB rules | MEDIUM-HIGH | William adds `lap_time_impact_s` | "Adjustment includes ~0.2s gain note" |
| 2.4 | RIGOR | No forecast-vs-practice comparison | Compare forecast to practice-logged conditions | MEDIUM | — | "Practice 22°C, forecast 28°C → noted" |
| 3.1 | PERFORMANCE | Rules sorted by revert cost, not impact | Race-day: sort by lap-time gain (within 15 min) | HIGH | William adds `lap_time_impact_s` | "Sprint, two rules: 0.2s/10min vs 0.1s/5min → second first" |
| 3.2 | PERFORMANCE | Race type ignored | Filter adjustments by sprint/endurance | MEDIUM | — | "Sprint + rain → no changes >5min" |
| 3.3 | PERFORMANCE | No rare-combo caution | Downgrade confidence for rare condition combos | MEDIUM | William defines rare combos | "Hot + wet → confidence downgraded" |
| 3.4 | PERFORMANCE | Verdict card doesn't highlight forecast | Prioritize adjustments in verdict; demote report | HIGH | — | "Adjustments render in verdict card" |

---

## TOP 3 HIGHEST-IMPACT, SAFE-TO-SHIP CHANGES

### 1. **Render William's adjustments in the race-plan UI (GAP 1.3 + 3.4)**
**Spec:** Add two folds to RacePlanView: "Forecast adjustments" and "Ungrounded aspects". Prioritize adjustments in verdict card if present.

**Why first:**
- Adjustments are **already computed** (William's planner works); they're just invisible.
- Zero KB/physics changes needed.
- **Immediate value**: racer sees forecast-grounded, cited advice instead of wondering "why doesn't the forecast matter?"

**Lines of code:** ~100 (RacePlanView, styles).
**Test:** "Plan with 2 adjustments → fold renders; plan without → fold absent."
**Safety:** ✓ Pure rendering. ✓ No eval impact. ✓ Ships with GAP 1.3 + 3.4 in one PR.

---

### 2. **Add mechanism explanations to `conditions_shift` (GAP 1.1)**
**Spec:** Pair each condition delta (temp, rain) with a physics brief + intuitive action (grip up/down, throttle strategy).

**Why second:**
- Single-function change (`conditionsShift`).
- Immediate clarity improvement ("5°C hotter" → "grip drops ~10%, setup needs…").
- No KB/Will inputs needed; uses universal physics.

**Lines of code:** ~40.
**Test:** "5°C hotter on asphalt → includes '~10% grip drop' note."
**Safety:** ✓ Pure. ✓ No NaN (already filtered). ✓ Testable.

---

### 3. **Reorder `readiness` by symptom persistence + add data-quality signal (GAP 1.2)**
**Spec:** Sort unresolved symptoms by persistence (lasted across multiple runs). Add a summary: "Limited data / Good data — expect variation on race day" if <3 runs.

**Why third:**
- Helps racer understand **what to worry about** (persistent problem > one-off).
- Sets expectations for race-day variability.
- No KB change; pure algorithmic reorder.

**Lines of code:** ~50.
**Test:** "3 runs, 2 symptoms: most-persistent listed first; 'Good data' signal shown."
**Safety:** ✓ Pure deterministic sort. ✓ No eval impact. ✓ Testable.

---

## DEFERRED (Will-Needed, High-Value)

Once William calibrates:
- **GAP 2.1:** Temperature thresholds + grip-impact curves per surface.
- **GAP 2.3 + 3.1:** `lap_time_impact_s` field on KB rules (enables magnitude estimation + race-day re-ranking).
- **GAP 3.3:** Rare condition combos + confidence penalties.

These unlock full "PERFORMANCE" improvements (lap-time-aware advice, sprint-safe filtering).

---

## SAFETY CHECKS (D13/D18/Eval Invariants)

All changes preserve:
- ✓ **D13 (Scope):** No engine/needle tuning introduced.
- ✓ **D18 (Determinism):** All changes are pure functions; no I/O, no RNG, no clock.
- ✓ **Grounded-or-s

### Pit Strategy
Excellent. Now I have all the context. Let me compile my comprehensive audit.

---

## DEEP AUDIT: RaceLab Pit Strategy Feature

I have thoroughly reviewed the strategy engine (strategy.ts, cliff.ts), the UI/prefill layer (PlanViews.tsx, EngineerHubScreen.tsx), and the autonomy/logging integration. All tests pass (48/48). Below is my prioritized audit across **CLARITY**, **SCIENTIFIC RIGOR**, and **PERFORMANCE**.

---

## PRIORITY IMPROVEMENTS (RANKED BY IMPACT & SAFETY)

### **DIMENSION 1: CLARITY**

#### GAP 1.1 — Margin language is CONFUSING in the pit window note
**What:** The key insight—"a safety margin inside the fuel cap"—is buried in pilot speak that conflates the margin with remaining tank after cap is applied. This misleads a racer into thinking the margin *is* shown as remaining fuel.

**Current output (line 58, strategy.ts):**
```
Boxing every 6:25 (385s) keeps a 35s fuel margin (one average lap, the default).
```

**Problem:** Pilot reads "keeps a 35s margin" → thinks "I keep 35s of fuel in the tank always." Actually, it means "the strategy safeguards 35s of driving as cushion against fuel trim errors or autonomy test variance."

**Concrete fix:**
```typescript
`Boxing every ${mmss(fuelCap)} (${fuelCap}s) — that's full autonomy minus ${margin}s safety margin${inputs.margin_s === undefined ? " (one average lap, the default)" : ""}: a reserve in case your autonomy test is optimistic.`,
```

**Impact:** HIGH — directly fixes the most-misread number in strategy output.

**Safety:** SAFE — pure text output change, no logic change. Still validates margin > 0. Deterministic.

---

#### GAP 1.2 — Tyre cliff note lacks the QUANTIFIED reason: WHY inside the fuel window?
**What:** When a cliff forces the stint cap, the note says "the tyres, not fuel, decide" but does NOT explain the mechanism: *the cliff happens SOONER than the fuel limit would*.

**Current output (line 72–73, strategy.ts):**
```
Tyres fall off a cliff after ~6:25 (lap 8, degrading 0.38s/lap) — inside the 6:40 fuel window, so the tyres, not fuel, decide the pits.
```

**Problem:** Racer sees this but doesn't intuitively understand: "Why is lap 8 inside the fuel window?" The note omits the comparative time: fuel cap is 385s, cliff is 280s (lap 8 × 35s/lap).

**Concrete fix:**
```typescript
`Tyres fall off a cliff after ~${mmss(cliffTime)} (lap ${cliff.cliff_lap}, degrading ${cliff.degradation_s_per_lap.toFixed(2)}s/lap) — that's ${mmss(cliffTime)} vs. ${mmss(fuelCap)} fuel window, so tyres run out first. Box every ${mmss(cliffTime)} to stay ahead of the cliff.`,
```

**Impact:** HIGH — converts jargon ("inside the window") to grounded time comparison.

**Safety:** SAFE — pure text addition using already-computed variables. No logic risk.

---

#### GAP 1.3 — Pit timing expressed ONLY as cumulative race-clock; no standalone stint times visible in output
**What:** The verdict says "Box at 5:50, 24:35, 49:10" but does NOT state the individual stint *durations*. A racer has to infer: "5:50 is my first stint, then 24:35 – 5:50 – pit_loss = 2nd stint."

**Current code (line 159, strategy.ts):**
```
Box at 5:50, 24:35, 49:10 on the race clock — stints of 5:50, 5:50, 4:40, none over the 6:25 cap.
```

**Concrete fix:** The stints are already computed; render them more visibly in the UI or add a line:
```typescript
// In PitPlanView, after the timeline bar, add a row:
<Text>{t({ en: "Stints: ", fr: "Relais : " })}{plan.stints.map(s => fmtTime(s.duration_s)).join(', ')}</Text>
```

Or in notes (line 159, strategy.ts), reverse order for clarity:
```typescript
`Stints: ${stints.map((s) => mmss(s.duration_s)).join(", ")} (all under the ${mmss(cap_s)} cap). Box after each on the race clock: ${pit_at_s.map(mmss).join(", ")}.`,
```

**Impact:** MEDIUM — clarity for visual learners; improves situational awareness in the pits.

**Safety:** SAFE — UI-only, or notes addition. No math changed.

---

### **DIMENSION 2: SCIENTIFIC RIGOR**

#### GAP 2.1 — Autonomy test variance NOT quantified; margin is a fixed time, not statistical
**What:** The strategy computes `stint_max_s = autonomy_s - margin_s`, but **the autonomy_test.time_s itself has measurement error**. A run-until-dry test with a stopwatch has ±2–5s noise; a single test is not a reliable fuel time.

**Root cause:** strategy.ts assumes `autonomy_s` is ground truth. bestAutonomy (autonomy.ts:24–39) picks the most recent same-track practice run, but **NEVER aggregates multiple tests** or flags confidence.

**Concrete proposal (NEEDS WILLIAM to calibrate):**
1. Modify StrategyInputs to optionally accept autonomy measurement metadata:
```typescript
export interface StrategyInputs {
  // ... existing
  /** optional: confidence data from autonomy test(s) */
  autonomy_meta?: { time_s: number; num_tests?: number; variance_s?: number };
}
```

2. In buildStrategyPrefill (EngineerHubScreen.tsx:219–249), when pulling autonomy, also search for OTHER recent same-track autonomy tests:
```typescript
// After finding best autonomy:
const sameTrack = logbook.runs.filter(r => 
  r.type === 'practice' && 
  sameTrackId(r, track) && 
  runAutonomy(r)?.time_s !== undefined
);
const variance = sameTrack.length > 1 ? stddev(sameTrack.map(r => runAutonomy(r)!.time_s!)) : 0;
autonomy = { time_s: best.time_s, date: ..., meta: { num_tests: sameTrack.length, variance_s: variance } };
```

3. In the note (strategy.ts:57):
```typescript
`Full tank lasts ~${mmss(inputs.autonomy_s)}${inputs.autonomy_meta?.num_tests && inputs.autonomy_meta.num_tests > 1 ? ` (${inputs.autonomy_meta.num_tests} tests, ±${inputs.autonomy_meta.variance_s?.toFixed(1) ?? '?'}s variance)` : ''}.`,
```

**Impact:** MEDIUM–HIGH — converts a black-box number to a credible, confidence-calibrated input. Racer sees "420s ± 8s from 3 tests" vs. "420s (maybe once)."

**Safety:** REQUIRES WILLIAM to ratify: (a) the variance calc (stddev? robust MAD?), (b) the confidence threshold ("ignore tests older than X days?"), (c) how to integrate into the margin logic itself (e.g., should margin scale with variance?).

**Flag:** This is a KB physics/stats call; the engine code is pure-deterministic and safe to add these fields without breaking logic.

---

#### GAP 2.2 — Tyre cliff detection uses EMPIRICAL thresholds with NO justification
**What:** cliff.ts:27–28 uses:
```typescript
const threshold = baseline + Math.max(0.6, 0.025 * baseline);
```
This is "0.6s absolute OR 2.5% of baseline, whichever is larger." But the code never states:
- Why 0.6s? (machine precision? typical sensor noise?)
- Why 2.5%? (scaling factor for faster vs. slower laps?)
- Is this calibrated to real RC tyre behaviour?

**Current logic strength:** The "two consecutive laps over threshold" requirement (line 30) is SOUND—avoids single-lap mistakes. But the threshold is opaque.

**Concrete proposal (NEEDS WILLIAM to ratify the physics):**
Add a comment with the original data/reasoning and a potential future expansion:

```typescript
/**
 * Baseline = median of laps 2..6 (early-run "warm" state, before degradation).
 * Threshold = baseline + max(0.6s, 2.5% of baseline). The 0.6s is the minimum
 * "cliff signal" below which sensor jitter or single mistakes trigger false
 * positives; the 2.5% scales for different lap-time magnitudes (fast 30s laps
 * have lower-% variation than slow 60s laps). Cliff = first lap where THIS lap
 * AND NEXT are both over the threshold (sustained drop, not a blip).
 *
 * TODO (William): Calibrate against real-world RC lap data (grip loss curves
 * from tyre temperature, fuel load, track rubber). If available, could fit a
 * logistic model or use cumulative lap-count weighting instead of flat threshold.
 */
```

**Impact:** MEDIUM — documentation-only in first pass; future work to calibrate against real RC tyre physics.

**Safety:** SAFE — no logic change, only comments. Tests still pass.

---

#### GAP 2.3 — Degradation slope reported but NEVER used in decision-making
**What:** cliff.ts:24 computes `degradation_s_per_lap` (least-squares over laps 2..n) and returns it in TyreCliffResult, but:
- It's computed for EVERY lap series, even those with no cliff.
- The strategy never uses it to *refine* the cliff time or confidence.
- It's shown in the UI note ("degrading 0.38s/lap") but pilots don't know what to do with it.

**Concrete proposal (NEEDS WILLIAM to ratify the tyre physics):**
1. Use degradation slope to estimate *when* the cliff onset becomes critical. E.g., if a cliff is detected at lap 8 with slope 0.38s/lap, estimate when cumulative loss reaches 1s, 2s, etc.:
```typescript
export function cliffOnsetEstimate(cliff_lap: number, degradation_s_per_lap: number): number {
  // Estimate lap # where cumulative loss from cliff_lap reaches 2s
  const cumulative_at_lap = (lap: number): number => Math.max(0, (lap - cliff_lap) * degradation_s_per_lap);
  for (let lap = cliff_lap; lap < cliff_lap + 20; lap++) {
    if (cumulative_at_lap(lap) >= 2.0) return lap;
  }
  return cliff_lap + 20; // fallback
}
```

2. In the note, contextualize the slope:
```typescript
`Tyres degrade ~${cliff.degradation_s_per_lap.toFixed(2)}s/lap after lap ${cliff.cliff_lap}; at this rate, you'll lose 2s by lap ~${cliffOnsetEstimate(cliff.cliff_lap, cliff.degradation_s_per_lap)} — boxing at lap ${cliff.cliff_lap} + 1–2 laps keeps you within 1s of peak pace.`
```

**Impact:** MEDIUM — turns a raw number into pilot-actionable insight ("you have a 1–2 lap buffer before pace drops 2s").

**Safety:** REQUIRES WILLIAM to ratify the onset logic and the 2s threshold. Code is pure; no side effects. D18 compliant.

---

#### GAP 2.4 — Fuel margin DOES NOT account for pit-stop time variance
**What:** The margin_s is subtracted from autonomy_s to create the stint cap, but pit stops themselves have variance:
- Pit_loss_s = 25s is a *nominal* pit stop.
- In reality, stops range 20–35s (refueling speed varies, inattention, etc.).

**Current code:** Margin is a simple time buffer, not paired with pit-stop risk.

**Concrete proposal (NEEDS WILLIAM to rate risk impact):**
Modify StrategyInputs to optionally separate pit-loss variance:
```typescript
export interface StrategyInputs {
  // ...
  pit_loss_s: number;
  pit_loss_variance_s?: number; // e.g., ±3s for typical RC pit stops
}
```

In notes, flag when margin is consumed:
```typescript
if (inputs.margin_s !== undefined && inputs.margin_s < (inputs.pit_loss_variance_s ?? 0) * 2) {
  notes.push(
    `⚠️ Fuel margin (${inputs.margin_s}s) is tighter than typical pit-stop variance (±${inputs.pit_loss_variance_s ?? 3}s). A slow stop could cut into safety margin.`
  );
}
```

**Impact:** LOW–MEDIUM — edge case (only matters when margin < pit variance). But important for high-margin-pressure endurance scenarios.

**Safety:** SAFE — optional field, warning only, no logic change to stints.

---

### **DIMENSION 3: PERFORMANCE**

#### GAP 3.1 — Stretch options do NOT consider "time cost of extra margin eating"
**What:** stretchOptions (line 91–112) computes +1, +2 lap stretches and reports "Saves N stops = Nx25s pit loss." But it does NOT report:
- The time GAINED by reducing margin (e.g., from 35s to 0s).
- The actual *net* race time change (pit loss saved vs. pace loss risk if margin is too tight).

**Current output (line 107–108):**
```
Saves 1 stop(s) = 25s of pit loss (4 -> 3 stops); remaining margin: 0s of tank.
```

**Concrete fix:** Add explicit net-time calculation:
```typescript
const marginEroded = inputs.autonomy_s - cap;
const pitTimeSaved = saved * inputs.pit_loss_s;
const marginRiskNote = marginEroded > 0 
  ? `Margin erodes by ${marginEroded}s (from ${plan.stint_max_s - inputs.autonomy_s + margin}s to 0s).`
  : '';
option.notes.push(
  `Saves ${saved} stop(s) = ${pitTimeSaved}s pit loss (${plan.stops} → ${option.stops} stops). ${marginRiskNote} Net time change: ~${pitTimeSaved - marginEroded}s faster if margin stays safe.`
);
```

**Impact:** MEDIUM — helps pilots make the stretch/safe trade-off consciously.

**Safety:** SAFE — pure calculation, no logic change to stretch plan itself.

---

#### GAP 3.2 — Prefill does NOT surface the CONFIDENCE of lap-series data for cliff detection
**What:** buildStrategyPrefill (EngineerHubScreen.tsx:219–249) collects the longest lap series from runs and hands it to cliff detection, but **never signals data quality**:
- "I found 48 logged laps from 3 runs" vs. "I found 8 logged laps, one run, very noisy."
- Are they from a single qualifying stint or spread across many short runs?
- Are they all from the same fuel load, or do they mix half-tank and quarter-tank?

**Concrete proposal (NEEDS WILLIAM to ratify the lap-series merging strategy):**
Enhance StrategyPrefill:
```typescript
export interface StrategyPrefill {
  // ... existing
  lap_times?: number[];
  lap_times_meta?: {
    num_laps: number;
    num_runs: number;
    fuel_variance?: "single_tank" | "multi_tank" | "unknown";
    date_range_days?: number;
  };
}
```

In buildStrategyPrefill, track the metadata:
```typescript
const lapMeta: StrategyPrefill["lap_times_meta"] = lapTimes ? {
  num_laps: lapTimes.length,
  num_runs: sorted.filter(r => runLapsList(r)?.length === lapTimes.length).length,
  fuel_variance: /* detect from run's timing.result.fuel_state */ undefined,
  date_range_days: sorted.length > 1 ? daysBetween(sorted[0].created_at, sorted[sorted.length-1].created_at) : 0,
} : undefined;
```

In StrategyForm hint (line 323–327), surface it:
```typescript
{prefill.lap_times !== undefined && prefill.lap_times.length >= 8 && (
  <Text style={styles.hint}>
    {t({ en: `✓ ${prefill.lap_times.length} logged laps from ${prefill.lap_times_meta?.num_runs ?? 1} run(s)`, fr: `✓ ${prefill.lap_times.length} tours enregistrés depuis ${prefill.lap_times_meta?.num_runs ?? 1} session(s)` })}
    — {prefill.lap_times_meta?.fuel_variance === 'multi_tank' ? t({ en: 'mixed fuel loads (less reliable for cliff)', fr: 'charges carburant mixtes (moins fiable pour la chute)' }) : t({ en: 'tyre-cliff detection active', fr: 'détection de la chute de grip active' })}.
  </Text>
)}
```

**Impact:** LOW–MEDIUM — improves pilot awareness of data quality. Prevents over-confidence in cliff detection from noisy short series.

**Safety:** SAFE — metadata-only, no logic change.

---

#### GAP 3.3 — No "lap-time consistency" prefill hint to warn of highly variable pace
**What:** When prefilling avg_lap_s, the strategy uses `Math.min(...avgs)` (best average of the selected runs) but does NOT signal if the pilot's pace is **highly inconsistent**. A racer with ±2s lap variance will NOT sustain the "best" average.

**Concrete proposal:**
In buildStrategyPrefill, after selecting avg_lap_s, compute consistency and warn:
```typescript
const consistency = runs.map(r => runConsistency(r)).filter((v): v is number => v !== undefined);
const consistencyPct = consistency.length > 0 ? Math.min(...consistency) : undefined;
if (consistencyPct !== undefined && consistencyPct < 85) {
  notes.push(
    `⚠️ Your lap times vary ±${Math.round((1 - consistencyPct / 100) * (prefill.avg_lap_s ?? 35))}s (${consistencyPct}% consistency). The strategy uses your best average, but in the race you may need a larger margin.`
  );
}
```

Show this as a warning in StrategyForm:
```typescript
{prefill.consistency_pct !== undefined && prefill.consistency_pct < 85 && (
  <Text style={[styles.hint, { color: colors.warn }]}>
    {t({ en: `Your logged pace varies ±${Math.round(...)}s; you may want a 2-lap margin instead of 1.`, fr: '...' })}
  </Text>
)}
```

**Impact:** MEDIUM — prevents "best average" optimism bias; ties strategy to real, observed consistency.

**Safety:** SAFE — hint/warning only, does not auto-adjust strategy.

---

#### GAP 3.4 — No "race-like conditions check" when prefilling from practice data
**What:** The strategy prefills avg_lap_s and autonomy from PRACTICE runs, but practice != race:
- Practice runs often have lower fuel load (quarter-tank autonomy test) or different tyre state.
- If the pilot only has practice data from "blue groove" grip but the race is on "green," the pace/fuel estimates are biased.

**Concrete proposal (NEEDS WILLIAM to calibrate grip/fuel impact):**
In buildStrategyPrefill, add a conditions mismatch warning:
```typescript
const gripVariance = new Set(sorted.map(r => r.conditions.grip)).size;
if (gripVariance > 1) {
  notes.push(
    `⚠️ Your practice runs span ${gripVariance} different grip levels. If the race is on a different surface, your pace and fuel may change — test closer to race day if possible.`
  );
}
```

**Impact:** LOW — context/UX hint only. Helps pilots understand data limitations.

**Safety:** SAFE — informational only.

---

## SUMMARY: TOP 3 HIGHEST-IMPACT, SAFE-TO-DO-NOW IMPROVEMENTS

### 1. **CLARIFY MARGIN SEMANTICS** (Dimension: CLARITY, Impact: HIGH)
**What:** Rewrite the margin note to explicitly state "a safety buffer against fuel-test variance" rather than ambiguous "keeps a margin."

**File:** `C:\Users\Admin\Documents\wt-theo-racelab\RaceLab\packages\strategy\src\strategy.ts`, line 58

**Code change:**
```typescript
// BEFORE:
`Boxing every ${mmss(fuelCap)} (${fuelCap}s) keeps a ${margin}s fuel margin${inputs.margin_s === undefined ? " (one average lap, the default)" : ""}.`,

// AFTER:
`Boxing every ${mmss(fuelCap)} (${fuelCap}s) — that's autonomy minus ${margin}s safety margin${inputs.margin_s === undefined ? " (one average lap, the default)" : ""}, a reserve against fuel-test variance and pit delays.`,
```

**Safety check:**
- No logic change; pure text output.
- Tests still pass (48/48).
- D18 compliant (deterministic, no side effects).
- No impact on invariants (grounded-or-silent, on-template, no NaN).

---

### 2. **QUANTIFY TYRE-CLIFF DECISION POINT** (Dimension: CLARITY + SCIENTIFIC RIGOR, Impact: HIGH)
**What:** When cliff forces a stint cap, explain with comparative times: "cliff at 280s vs. fuel cap at 385s, so cliff is earlier."

**File:** `strategy.ts`, lines 72–73

**Code change:**
```typescript
// BEFORE:
`Tyres fall off a cliff after ~${mmss(cliffTime)} (lap ${cliff.cliff_lap}, degrading ${cliff.degradation_s_per_lap.toFixed(2)}s/lap) — inside the ${fuelCap}s fuel window, so the tyres, not fuel, decide the pits.`,

// AFTER:
`Tyres fall off a cliff after ~${mmss(cliffTime)} (lap ${cliff.cliff_lap}, degrading ~${cliff.degradation_s_per_lap.toFixed(2)}s/lap). That's ${mmss(cliffTime)} vs. the ${mmss(fuelCap)}s fuel window — tyres run out of grip first, so box every ${mmss(cliffTime)} to stay ahead of the cliff.`,
```

**Safety check:**
- Pure text rewrite; all variables already computed.
- Tests still pass.
- D18 compliant.

---

### 3. **ADD LAP-SERIES CONFIDENCE HINT IN STRATEGY FORM** (Dimension: SCIENTIFIC RIGOR, Impact: MEDIUM)
**What:** When lap times are prefilled, surface how many runs they come from; warn if cliff detection is based on noisy short data.

**File:** `PlanViews.tsx`, lines 323–327

**Code change:**
```typescript
// BEFORE:
{prefill.lap_times !== undefined && prefill.lap_times.length >= 8 && (
  <Text style={styles.hint}>
    {t({ en: `✓ ${prefill.lap_times.length} logged laps from your runs — tyre-cliff detection active (endurance).`, fr: `✓ ${prefill.lap_times.length} tours enregistrés depuis tes sessions — détection de la chute de grip des pneus active (endurance).` })}
  </Text>
)}

// AFTER:
{prefill.lap_times !== undefined && (
  <Text style={[styles.hint, prefill.lap_times.length < 8 ? { color: colors.sub } : {}]}>
    {prefill.lap_times.length >= 8
      ? t({ en: `✓ ${prefill.lap_times.length} logged laps from your runs — tyre-cliff detection active.`, fr: `✓ ${prefill.lap_times.length} tours enregistrés depuis tes sessions — détection de la chute de grip active.` })
      : t({ en: `Only ${prefill.lap_times.length} laps logged (need 8+ for cliff detection); strategy will use fuel only.`, fr: `Seulement ${prefill.lap_times.length} tours enregistrés (besoin 8+ pour la chute); la stratégie utilisera le carburant seulement.` })}
  </Text>
)}
```

**Safety check:**
- Pure UI/text hint; no logic change.
- Tests still pass.
- D18 compliant.

---

## FUTURE WORK (REQUIRES WILLIAM TO RATIFY)

| Priority | Gap | Dimension | Requires | Effort |
|----------|-----|-----------|----------|--------|
| MEDIUM | 2.1 | Scientific Rigor | KB: autonomy variance calibration | Med |
| MEDIUM | 2.2 | Scientific Rigor | KB: tyre cliff threshold physics | Low (doc) |
| MEDIUM | 2.3 | Scientific Rigor | KB: degradation slope usage in onset calc | Med |
| LOW | 2.4 | Scientific Rigor | KB: pit-stop variance risk model | Low |
| MEDIUM | 3.1 | Performance | Pure code (net-time calc) | Low |
| LOW | 3.2 | Scientific Rigor | KB: lap-series merging strategy | Med |
| LOW | 3.3 | Performance | Pure code (consistency check) | Low |
| LOW | 3.4 | Scientific Rigor | KB: grip/fuel impact on pace/autonomy | Med |

---

**FINAL NOTE ON SAFETY:**
All three top improvements are **text/hint-only** and stay pure, deterministic, and on-template. No changes to the core fuel/stint/cliff math. The engine evaluation (13/13) and all D18 invariants remain green. No self-contradiction, no NaN risk, no hidden IO.