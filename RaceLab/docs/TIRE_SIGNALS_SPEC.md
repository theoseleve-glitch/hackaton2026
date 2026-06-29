# Tire-advisor input signals — spec for the app (Théo zone)

The deterministic tire-selection advisor (`packages/engine/src/tire-advisor.ts`,
`recommendTires` / `tireContextFromTags`) is built and grounded. It reads the SAME condition
tags the app already builds for the tuning engine. Two signals make it precise; **the engine
side of both is already implemented + tested** — these are the app/schema halves.

Contract entry point (what the app calls):
```ts
import { buildConditionTags } from "@schema/runs";          // already exists
import { tireContextFromTags, recommendTires, loadTireSelectionKB } from "@engine/tire-advisor";

const tags = buildConditionTags({ conditions: run.track.conditions, surface: run.track.surface });
const ctx  = tireContextFromTags(tags, classScopeTags);     // classScopeTags = garage.templateIdForCar typology → off-road scope tags
const res  = recommendTires(ctx, loadTireSelectionKB());    // {kind:"tire_selection", picks:[…2]} | {kind:"refusal", message}
```

---

## Signal 1 — GREASY (new; the engine is ready, app+schema half outstanding)

**Why:** "greasy" = a slick low-grip FILM (the track looks wet but isn't loose or muddy). Grip
comes from the COMPOUND, not the lugs, so it wants the OPPOSITE tread from dry dirt (fine/diamond
pin + soft/clay, e.g. Matrix Nova — not an aggressive pin). William confirmed greasy = this
slick-film meaning (D76). Today a greasy track reads as generic `loose_dirt` and gets the dry-dirt
pin — actively wrong advice.

**Engine side — DONE (D79):** `TireContext.greasy: boolean`; `tireContextFromTags` sets it from a
`"greasy"` tag; the KB is **partitioned** on it — `greasy:true` entries fire ONLY on a greasy
track and all dry entries are suppressed there. Two grounded greasy entries already shipped
(dormant until the tag arrives). Verified by `test-tire-advisor` (greasy → fine/clay pin; dry
unaffected).

**App + schema side — TODO (≈3 small edits):**
1. `packages/schema/src/runs.ts` — add to `RunConditions` (mirror `dusty?: boolean`):
   ```ts
   /** slick low-grip film: looks wet but is not loose or muddy. Distinct from `dusty` and `sky:"raining"`. */
   greasy?: boolean;
   ```
2. `packages/schema/src/runs.ts` `conditionsToTags(...)` — emit the tag (mirror the `dusty` line):
   ```ts
   if (c.greasy === true) tags.push("greasy");
   ```
   (`buildConditionTags` already unions `conditionsToTags`, so no change there.)
3. **UI** — one control on the Run/Track condition form. Best as a small track-state selector so
   the three low-grip states are mutually clear (they ARE different tyres):
   - `dry` (default) · `dusty` (loose dust on top) · **`greasy` (slick low-grip film)** · `wet/mud` (`sky:"raining"`).
   Set `conditions.greasy = true` only for the greasy option. Tooltip: "Track looks shiny/greasy
   and low-grip, but isn't loose dust or standing water."

**Verify when wired:** a greasy off-road run → `recommendTires` returns a fine/diamond or clay
mini-pin in a super-soft/clay compound (not the loamy spike). The engine test already proves this
path with a synthetic `"greasy"` tag.

---

## Signal 2 — GRIP (already exists; just pass it through + make it easy to set)

**Why:** on 1/8 dirt the advisor flips the TREAD by grip — low grip → aggressive loamy pin;
**high grip / blue-groove → web/connected-bar** (race-proven, D78). So grip is load-bearing, not
cosmetic.

**Status:** `RunConditions.grip` already exists (`GRIPS = green | medium | high | blue_groove`,
`vocab.ts`) and `conditionsToTags` already emits `low_grip` / `high_grip` / `blue_groove`. So grip
flows **for free** as long as the app builds the tags via `buildConditionTags(...)` and passes them
to `tireContextFromTags`. Nothing new to emit.

**TODO (app only):**
- When wiring the "What tyres?" call, build the context from the run/track conditions (snippet
  above) so the grip tag reaches the advisor.
- In the UI, make grip a clear, prominent input (green / medium / high / blue-groove). If grip is
  unknown the advisor safely defaults to the loamy pick, but the racer loses the groomed precision
  — so prompt for it on the tyre-advice screen if the track record doesn't have it.
- Note: `grip: "medium"` emits no tag (→ loamy default), which is correct.

---

## Signal 3 — ASTRO PILE LENGTH (optional, future precision)

For 1/8/1/10 astro the spike-vs-mini-pin choice depends on pile length (long/shag → spike; short →
mini-pin, D76/D78). Today the advisor returns both astro picks regardless. A future `surfaces`
sub-state (`astro_long` / `astro_short`) or a one-tap question on an astro track would let the
engine pick. Low priority — not blocking.

---

## Summary for Théo
| Signal | Engine | App/schema work | Priority |
|---|---|---|---|
| **Greasy** | ✅ done (D79) | add `greasy?` to RunConditions + emit `"greasy"` tag + a track-state UI option | **high** (else greasy = wrong advice) |
| **Grip** | ✅ done | pass tags through `buildConditionTags`→`tireContextFromTags`; make grip easy to set | high (it's the 1/8 loamy↔groomed flip) |
| **Astro pile** | partial | optional `astro_long`/`astro_short` sub-state | low |
