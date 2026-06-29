# Tire-Selection Advisor — design (D75)

**Origin:** a racer's steer (via William, 2026-06-29): the single highest-value piece
of advice is *pre-purchase* — "for THIS track in THESE conditions, which tire profiles
do I buy?" — because you can't afford to own every profile. Output: the **two best
profiles** for the given track + current weather.

This is a NEW surface, distinct from the existing symptom→setting tuning engine:

| | Tuning engine (exists) | **Tire-selection advisor (this)** |
|---|---|---|
| Trigger | a symptom at the track | a track + weather, *before* you go |
| Question | "car pushes — what do I change?" | "what tires do I buy for this?" |
| Output | one setting change (one-at-a-time) | **top-2 tire profiles** (tread + compound) |
| Shape | `addresses(symptom,phase)` → direction | `match(surface+grip+temp)` → profile |

## Scope (from the racer's answers)
- **Recommendation = tread PROFILE + COMPOUND (softness).** Insert is OUT — racers
  rarely change it (re-gluing is impractical).
- **Off-road only** (nitro AND electric). Off-road runs treaded tires → many distinct
  profiles with large differences between them, so "which to buy" is a real, expensive
  decision. On-road is essentially slick/durometer — a smaller, more deterministic
  problem, deferred.
- Classes: `1-8-offroad` (nitro/e), `1-8-truggy`, `1-10-2wd-offroad`, `1-10-4wd-offroad`,
  `1-10-stadium`, `1-10-shortcourse`.

## Invariants (inherited, non-negotiable)
- **D18 deterministic + API-free.** Pure function over a grounded KB. No model, no network.
- **Grounded or silent.** Every recommended profile cites a real published source that
  states it (manufacturer tire-selection guide / named book / championship guide — D53:
  citations are INTERNAL provenance). No grounded match → refusal, never a guess.
- **Two best, distinct.** Return at most 2 picks, each a distinct (tread, compound); if
  only one is grounded, return one; if none, refuse.

## Inputs are already wired
The advisor keys off the exact tags the app already produces — zero new app plumbing for
the inputs:
- **surface family** from `schema.surfaceToTags(track.surface)` → `loose_dirt | clay |
  blue_groove | astroturf | carpet | wet` (off-road families).
- **grip** from `conditionsToTags` → `low_grip | high_grip | blue_groove` → band low/high.
- **temp** from `conditionsToTags` → `hot | cold` (neither ⇒ mild).
- **wet / dusty** from `conditionsToTags` → `wet`, `dusty`.
- **class scope** from `garage.templateIdForCar` / the car's typology.

`tireContextFromTags(tags, scope)` builds the advisor context from these, so the app can
pass the SAME `buildConditionTags(...)` output it already computes for the tuning engine.

## Data model — the selection KB (`packages/kb/tires/offroad-selection.yaml`)
Kept ORTHOGONAL to the tuning rules bundle (its own file + loader + grounding test) so it
can't disturb the 414-rule pipeline / `validate-live`. Each entry:

```yaml
- id: tsel-<surface>-<tread>-<nnn>
  scope: [1-8-offroad, 1-10-2wd-offroad, 1-10-4wd-offroad]  # off-road class tags
  match:
    surface: loose_dirt        # required surface-family tag (matches surfaceToTags)
    grip: [low, medium]        # any-of; omitted/empty = any grip
    temp: [cold, mild]         # any-of; omitted/empty = any temp
    wet: false                 # true = wet only; omitted = dry/either
  tread: pin                   # normalized tread profile (mini-pin/pin/spike/stagger/paddle/block…)
  compound: soft               # softness band / named compound
  examples: ["Pro-Line Hole Shot M3", "AKA Impact Soft"]  # concrete buy examples
  rationale: "Open pin clears loose loam and digs for forward bite; soft for cool/low grip."
  sources: ["<real published guide + the statement that supports it>"]
  confidence: high
```

## The algorithm — `recommendTires(ctx, kb)`
1. **Filter** to entries that fit: scope overlaps `ctx.scope`; `match.surface === ctx.surface`;
   grip band fits (empty = any); temp band fits (empty = any); wet matches.
2. **Score** by specificity: +exact grip-band match, +exact temp-band match, + a confidence
   weight. A more specifically-matched, higher-confidence entry ranks first.
3. **Dedupe** by (tread, compound) — keep the best-scored per distinct profile.
4. **Top-2 distinct picks**, each with rationale + citations + a fit explanation.
5. **0 grounded candidates → refusal** (`"No grounded tire for <surface>/<grip>/<temp> on
   this class yet"`), never a guess. Deterministic throughout (stable sort, id tie-break).

## Build order
1. ✅ Engine + data model + fixture-based tests (data-independent) — this slice.
2. ⏳ Grounded dataset authored from the `offroad-tire-selection-grounding` research workflow
   (research → adversarial verify each mapping is source-stated → only verified mappings land).
3. ⏳ App wiring (Théo): a "What tires?" call on the track/engineer screen that passes the
   existing condition tags + car class → renders the 2 picks. Inputs already exist.

## Known modeling notes / follow-ups
- `surfaceToTags` has no explicit `hard_packed` family — hard-pack is currently carried by
  `blue_groove` + `high_grip`. If coverage needs a distinct hard-pack family, that's a small
  `schema.surfaceToTags` addition (schema zone) — flagged, not done here.
- Grounding starts on free published guides (manufacturer tire guides + race guides); William
  augments with trusted PDFs ("both — I start, you augment").
