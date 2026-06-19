# RaceLab — VRC PRO Intelligence Brief (2026-06-19, D67)

6-lens web-grounded scan of **VRC PRO** (Virtual Racing Industries BV, NL — virtualrc.com / vrcworld.com,
Steam app 335070). Question: can the RC simulator raise the engine's precision/understanding? Verdict up
front: **yes, but in a narrow, D18-safe lane** — as a *taxonomy / ranges / coverage cross-reference and
ideation source*, **not** as a grounding source or data feed.

## Status (the reality check)
- **Live but frozen.** Servers up in 2026, but **last real update Nov 2023**, ~20–76 concurrent players,
  and the dev has stated **no new cars** (no funding for a physics developer). Treat any use as a **one-time
  harvest**, never a standing pipeline.
- Windows-only. Free-to-play core (10 cars/tracks, Spec tier = limited setup); full adjustability (RS tier)
  behind paid license (~€40 / membership / ~€200 lifetime). **The documented parameter ranges are in the
  public manual** — no purchase needed for the part that's actually useful.
- Pro endorsements (Ronnefalk/Kyosho, Völker/LRP) — vendor-published, so directional credibility only.

## What's genuinely PROFITABLE (use it here)
1. **★ Parameter taxonomy WITH ranges/units (HIGH, zero D18 risk).** The setup editor is essentially the
   complete real-RC tuning vocabulary, and the manual gives concrete ranges: wheelbase ±5 mm, weight balance
   ±2 % L/R & ±4 mm F/R, steering 22–34°, Ackermann 5–12 steps, roll centres 2–4 mm, pinion 15–50T / spur
   44–110T, fuel oil 8–15 % / nitro 10–25 %, motor 4.5–13.5T, ESC max-amps 100–280 A, tyre shore 35–45 /
   dia 55–78 mm, plus shock oil/piston/spring, ARB+disconnect, toe/camber/caster/downstops, diff/one-way/
   spool. → **A free cross-reference to validate/extend RaceLab's setup-field taxonomy and the `options`/range
   bounds in templates** (feeds the D65 validator + D66 catalog). One-time transcription from the manual.
2. **Class / track / brand coverage cross-check (MEDIUM).** 25+ classes, 75–200+ **real-track replicas**,
   40+ licensed brands — independently corroborates the expansion roadmap (drift, oval, pan, F1 are real,
   worth-covering classes; region+surface track packs echo our surface dimension).
3. **Setup-sheet dialog as UX/layout reference (MEDIUM).** VRC's "Setup sheet" view mirrors a real
   manufacturer sheet (all params + component list, print/share to replicate exactly) — a useful layout model
   for the Phase-0 setup-sheet record.
4. **Expert community setups as EVAL baselines only (MEDIUM, fenced).** The "Tips & Knowledge" forum has
   1,500+ rated setups by named drivers per class/track. Usable as *sanity baselines for evals*, **never as
   KB rules** — and the values are login-gated + the `.car` files are encrypted, so harvesting is manual.

## What is NOT usable (the hard limits)
- **❌ Not a grounding source (D18).** A sim is a model-of-a-model — no page-citable authority, effects are a
  black-box physics engine. VRC can NEVER back an advisor rule. Any VRC-suggested effect is a *hypothesis to
  confirm against a real book/sheet* before it goes live.
- **❌ No cause→effect guide.** It teaches experientially; the manual has only one-liner tips, no systematic
  "change X → handling Y." So it doesn't hand us rules, only the parameter list.
- **❌ No data export / API / telemetry.** `.car` files **encrypted**; no CSV/JSON/PDF export; no API or mod
  interface. Only the public results HTML is scrapeable — and it's **pure timing data, zero setup values**.
- **❌ Demonstrable physics omissions on the variables that matter most** — community-reported: **off-road
  tyre compound is COSMETIC-ONLY** (omits THE dominant real grip lever), **no thermal penalty** on motor/
  engine, and it over-punishes line errors (~90 % flip). So cross-checking **grip / tyre / thermal** rule
  direction against VRC would be *actively misleading* — explicitly do NOT.

## Recommendation (for your call on what to use)
- ✅ **Harvest the documented parameter ranges/units** from the public manual → tighten RaceLab's
  setup-field taxonomy + template `options`/ranges. Best single win; free; D18-safe.
- ✅ **Use the class/track coverage** as corroboration for the expansion roadmap (D65).
- 🟡 Optionally mine **expert setups as fenced eval baselines** + the **setup-sheet layout** for the Phase-0
  sheet model.
- ❌ **Do NOT** ground rules in it, **do NOT** cross-check grip/tyre/thermal against it, **do NOT** build any
  ingestion pipeline.

> Net: VRC PRO sharpens our **structure and ranges and coverage confidence** — not our **grounding**. The
> profitable move is a one-time taxonomy/ranges cross-reference; the advice path stays anchored to real
> setup sheets + tuning books (D18/D53).
