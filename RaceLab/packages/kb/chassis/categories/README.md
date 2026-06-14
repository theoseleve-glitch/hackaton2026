# Per-category template DRAFTS (M5) — review before activation

16 per-category-group field templates derived from `docs/research/rc-setup-fields.json`
(grounded in real published setup sheets — XRAY XB8/XB8E/T4, Kyosho MP10, TLR 22,
Associated RC8B4/B7, Losi 5IVE-T, SWORKz S35-GT2, PetitRC 1/12, rcformula1 — see that
file's `$comment`). Each file is **one category's field schema**: which settings a car of
that class exposes and their legal ranges, with setting ids aligned to the canonical KB
taxonomy so the 63 HUDY rules fire where they apply.

## Status: DRAFT, not live, additive — zero risk to the shipping path
- `template_status: "category_draft"` on every file.
- **Not bundled.** `engine/src/node-kb.ts` does a non-recursive `readdirSync` over `chassis/`
  and keeps only top-level `*.json`; this `categories/` subdir is invisible to it. `bundle.json`
  still carries only `generic-offroad` + `kyosho-inferno-mp11`. Engine eval stays **14/14**.
- **No `kit_default` anywhere** — deliberate. A kit value needs a specific chassis's published
  sheet (grounded-or-silent / D18). Ranges are sourced (the dataset); per-chassis defaults are not,
  so they are omitted rather than guessed.
- **Deliberate omissions** (not fabricated): `shock_mounting_inclination`, `wing_height`, per-axle
  oil brands — MP11-physical, absent from the dataset. Adding empty/guessed fields would violate D18.

## Canonical alignment (why ids were renamed)
Dataset ids are location-LAST (`camber_front`); canonical KB ids are location-FIRST (`front_camber`).
The rename map makes KB rules fire on the right setting. Key decisions:
- flip location: `camber_front → front_camber`, `toe_rear → rear_toe`, etc.
- `caster_front → caster` (canonical has no front/rear split)
- `droop_front/rear → front_downstop/rear_downstop` (pilot vocab "drop")
- `anti_squat → rear_anti_squat`, `kickup → front_kickup` (canonical is location-qualified)
- **aliases** (never collapse fields racers set independently):
  `shock_pistons` = alias of `front_shock_piston`+`rear_shock_piston`;
  `ride_height` = alias, `ride_height_rake` = derived, both of `front_ride_height`+`rear_ride_height`
  (mirrors how `inferno-mp11.json` models them); `gearing` = alias of `spur_gear` (nitro groups);
  `wing_angle` = alias of `front_wing_angle`+`rear_wing_angle` (F1).
- Fields with **no canonical equivalent** (tires, power/electronics, engine, body, drivetrain detail)
  keep their verbatim snake_case id. KB rules never fire on them — correct: the engine refuses
  ungrounded advice. All 47 alias/derived `of:[…]` refs were verified to resolve.

| template_id | class | total fields | canonical-aligned (KB rules can fire) |
|---|---|---:|---:|
| 1_8_offroad_nitro | 1/8 nitro buggy | 68 | 30 |
| 1_8_truggy | 1/8 truggy | 72 | 30 |
| 1_8_offroad_electric | 1/8 e-buggy | 62 | 28 |
| 1_8_gt | 1/8 GT on-road | 64 | 27 |
| 1_10_offroad_4wd | 1/10 4WD buggy | 68 | 26 |
| 1_10_touring_electric | 1/10 touring EP | 67 | 25 |
| 1_10_offroad_2wd | 1/10 2WD buggy | 66 | 23 |
| 1_10_nitro_onroad | 1/10 nitro touring | 60 | 23 |
| short_course | short course truck | 62 | 23 |
| large_scale_1_5 | 1/5 & 1/6 offroad | 62 | 22 |
| stadium_truck | 1/10 stadium truck | 62 | 21 |
| monster_truck | monster truck | 53 | 19 |
| rally | 1/10 rally | 46 | 19 |
| f1 | 1/10 F1 | 44 | 7 |
| crawler | rock crawler | 43 | 6 |
| 1_12_pan | 1/12 pan car | 45 | 5 |

(Low-alignment classes — pan/F1/crawler — is correct: those cars share few levers with the
1/8-offroad-built KB. They're full sheet schemas, just outside today's rule coverage.)

## Two follow-ups before this goes live

**William — domain review.** Confirm the field→canonical mapping (so a rule meant for `front_diff_oil`
doesn't fire on a field that's really a clutch setting), the ranges, and decide kit-default sourcing
per chassis. The rename map above is the whole story; spot-check the high-alignment 1/8 files first.

**Théo — wiring.** Two ways to consume, both additive:
1. *Category fallback* — when a car has no full chassis template, select its category template
   (`car.category → template_id`) instead of `generic-offroad`. Strictly better defaults; no engine change beyond the lookup.
2. *Promote to a chassis* — copy a reviewed draft to `chassis/<id>.json` (top level → it bundles),
   add a `registry.json` entry, fill `kit_default`s from that chassis's sheet. `getTemplate` keys by `template_id`.

**Regeneration.** If the mapping changes, don't hand-edit 16 files — write
`packages/kb/scripts/build-category-templates.mjs` (rename map as one auditable constant +
shape transform + alias rules over the dataset). Use node `fs` / `[System.IO.File]` UTF-8 no-BOM,
never `Get-Content`/`Set-Content` (mojibake risk — labels carry em-dashes).
