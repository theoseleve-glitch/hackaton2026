# RaceLab — RC World Map

*Master taxonomy + setup-knowledge map. Generated 2026-06-16 from three research sweeps
(`docs/research/world-map/{disciplines,sources,ontology}.json`) + the 237-model registry
(`packages/kb/chassis/registry.json`). This is the reference the model-aware race engineer is built on.*

> **Why this exists.** William's brief: build a *complete* world map of competitive RC, detect what we'd
> forgotten, then ground the engineer so its advice is precise to the **category AND the exact model**
> a driver is racing — because two cars in one category don't expose the same option parts, so the
> list of parts you can change differs. This doc is the map; the rules engine (D-log, next phase) is the machine.

---

## 1. The five gating dimensions of a setup answer

The engineer cannot reason on "category" alone. Every recommendation is gated by **five** axes — and a
rule that ignores any of them can be *wrong even for a chassis we fully cover*:

| # | Dimension | Source of truth | What it changes |
|---|-----------|-----------------|-----------------|
| 1 | **Category / class** | registry `category·scale·type` | which physics & parameters are even relevant |
| 2 | **Exact model → option-part set** | model template (`full`) or category template (fallback) | *which adjustments the car physically has* — the "reset his mind" rule |
| 3 | **Surface** | run context (track/surface) | the grip paradigm: dirt vs clay vs astro vs carpet vs asphalt vs oval |
| 4 | **Power sub-class** | car power_type + class rules | stock-blinky chases corner-speed; modified/boosted adds motor tuning; spec = frozen window |
| 5 | **Grounding availability** | `sources.json` tier | can we cite a real page? if not → **refuse** (D18) |

Axes 3 and 4 are **orthogonal to class** and were the biggest blind spots (see §6). They behave like the
existing weather condition tags (hot/cold/wet) — first-class modifiers, not separate chassis.

---

## 2. Coverage today — the registry

**237 models** resolving over **16 category-template setup pages** in `kb/bundle.json` (1 model is
fully-extracted: Kyosho Inferno MP11; the rest are `pending_pdf`, each resolving to a working editable
sheet via its `category_template`). 14 of the 16 templates currently back at least one registered model;
**`monster_truck` and `rally` ship as templates but have no models assigned yet** (0 each — they exist so a
future entry resolves immediately):

| Setup-page template | Models | | Setup-page template | Models |
|---|---|---|---|---|
| `1_8_offroad_electric` | 39 | | `1_8_gt` | 10 |
| `1_8_offroad_nitro` | 29 | | `1_12_pan` | 10 |
| `1_10_offroad_2wd` | 27 | | `crawler` | 10 |
| `1_10_offroad_4wd` | 24 | | `short_course` | 9 |
| `1_8_truggy` | 23 | | `1_10_nitro_onroad` | 8 |
| `1_10_touring_electric` | 22 | | `large_scale_1_5` | 7 |
| `f1` | 12 | | `stadium_truck` | 6 |
| `monster_truck` | 0 | | `rally` | 0 |

Brands span the full competitive field: Team Associated, Kyosho, TLR, HB Racing, Mugen Seiki, Tekno, XRAY,
SWORKz, Yokomo, Schumacher, Serpent, Awesomatix, Infinity, Capricorn, Shepherd, Tamiya, Roche, Agama,
Sparko, JQ, Durango, Vanquish, Axial, HPI, Losi, and more. Every entry is grounded with real source URLs.

---

## 3. Setup axes (orthogonal to class)

### 3a. Surface (11 grip paradigms) — `disciplines.json → setup_axes.surfaces`
High-bite clay · hard-packed/blue-groove · loamy/loose dirt · astroturf · carpet (on- & off-road) ·
asphalt/rubber-laid · **banked/flat oval** · **dirt/clay oval** · indoor-vs-outdoor modifier ·
loose-gravel/rally · smooth-indoor (drift/Mini-Z).

The same 1/10 buggy needs *radically* different setups on loamy dirt vs high-bite clay vs astro vs carpet;
the same touring car differs on asphalt vs carpet. **Surface is the highest-leverage gap inside classes we
already "cover."** Oval surfaces additionally demand an *asymmetric* (left-weight / stagger / wedge) paradigm
our symmetric-track tools can't express at all.

### 3b. Power sub-class (7) — `disciplines.json → setup_axes.power_subclasses`
Stock 17.5T blinky · stock 21.5T/25.5T blinky · stock 13.5T · **modified/boosted** (adds motor timing as a
lever) · nitro (.12/.21/.28 — engine tuning **refused** per D13, only clutch-coupling & fuel-mass in scope) ·
gas (1/5 — same refusal boundary) · **RTR-locked spec** (advice must stay inside the legal window).

Stock setup chases corner-speed & rollout; modified chases power-down & motor tuning. **Same chassis,
divergent advice.** Spec classes also impose a *legality* gate — recommending an illegal mod is a failure mode.

---

## 4. The capability layer (the ontology the rules attach to)

`docs/research/world-map/ontology.json` — the backbone, snake_case ids aligned to the engine's existing
`setting:` convention (the 68-rule KB ids stay valid):

- **84 adjustable parameters** across 12 families: suspension geometry · shocks/damping · springs ·
  differentials · anti-roll bars · ride-height/droop · weight/balance · drivetrain/gearing · tyres ·
  electronics · aero/body · chassis flex. Each carries `applies_to`, physics, and an **`option_part`** flag.
- **21 handling symptoms** with pilot-vocabulary synonyms + corner phase (entry/mid/exit/straight/braking)
  + axis (front/rear/balance).
- **17 option-part classes** — the gating contract. Parts some models have and others don't: adjustable
  sway bars, sway-bar mounts, gear-diff conversion, adjustable shock towers/positions, anti-squat/anti-dive
  inserts, adjustable Ackermann/wheelbase, brass/tungsten weights, bladder-vs-emulsion shocks, gyro,
  boost/turbo (also needs *class-legality* gating). Each maps the exact `param_id`s it enables + example
  models with/without.

**This is the mechanism behind "reset his mind per model":** the engineer resolves the model's capability
set, then *filters out any rule whose target param the model doesn't expose* before ranking. Boost/turbo and
similar also check class legality, not just hardware presence.

---

## 5. Grounding tiers — where rules can live (D18: grounded or silent)

`sources.json`. We have **free, page-citable PDFs** that legitimately ground a broad multi-category expansion
right now — chiefly the **Team Associated RC Cheat Sheets** (covers onroad/offroad/**oval**/pan/electric/nitro
effect-of-change), plus free HUDY on-road setup books, XRAY NT1/T-series setup books, TLR 8IGHT-X guide,
Mugen MSR off-road guide, and the petitrc handbook mirror (incl. Murfdogg "Chassis Tuning 101" for dirt oval).

| Tier | Categories | Action |
|---|---|---|
| **A — ground now** (multiple free citable refs) | 1/8 off-road buggy (nitro+e), 1/10 2WD & 4WD off-road, 1/10 electric touring, 1/8 GT & 1/10 nitro on-road; truggy/stadium/short-course ride on off-road refs | author grounded rules |
| **B — single-source** (needs a book) | 1/12 pan, 1/10 F1 — only the Dave B Stevens *1/12 & F1* book | **refuse** category-specific tuning until acquired |
| **C — no citable authority** | 1/5 large scale, crawler | **refuse** — do NOT bootstrap rules from forums |

**Recommended acquisitions (William):** Dave B Stevens *Essential Off-road RC Racer's Guide* (deepens off-road
+ stadium + short course; written with Coelho & Easton) and *Essential 1/12th & F1 Guide* (the only strong
pan/F1 source). Also worth confirming which exact HUDY edition the current 68-rule KB cites before extending.

---

## 6. Gap register — what we'd forgotten

`disciplines.json` mapped **31 disciplines** (15 outside current coverage) + the two cross-cutting axes.
Prioritised, with decisions:

| Gap | Kind | Priority | Decision |
|---|---|---|---|
| **Surface axis** (dirt/clay/astro/carpet/asphalt) | dimension | ★★★ | **Build** — first-class condition tag (like weather), gates rules + tyre/shock advice |
| **Power sub-class axis** (stock/mod/spec) | dimension | ★★★ | **Build** — gates motor-tuning rules + spec legal-window |
| **Dirt/clay oval** (sprint, late-model, dirt-mod, midget, Mudboss) | new sub-domain | ★★ | **Surface for William** — asymmetric weight/stagger/wedge is a *separate* engine; big scope call |
| **Paved/carpet oval** (banking + stagger) | new sub-domain | ★★ | **Surface for William** — second asymmetric paradigm |
| **1/8 e-truggy** | model variant | ★★ | **Build** — already expressible (type `truggy` + brushless); add models, reuse `1_8_truggy` page |
| **1/10 4WD short course** | variant | ★ | **Build** — split `short_course` 2WD/4WD attribute |
| **1/10 World GT / GT12 (WGT pan)** | new type | ★ | **Build** — distinct body/weight from 1/12 pan; add `world_gt` type or model note |
| **M-chassis / mini touring** | new class | ★ | **Surface** — short-wheelbase high-CG; budget club staple |
| **USVTA vintage / spec on-road** | new class | ★ | **Surface** — huge NA spec community; locked rules |
| **RWD competitive drift** | judged discipline | ★ | **Surface** — *judged not timed*; counter-steer/gyro/Ackermann — different advice model |
| **Mini-Z / 1/24 / 1/28 micro** | new scale | ★ | **Surface** — large Asian/club scene; scale not in facet vocab |
| **1/10 rally + 1/8 rallycross** | loose-surface | ★ | **Build-lite** — `rally` type exists; needs loose-surface tyre/ride-height rules |
| **eGT (electric 1/8 GT)** | variant | ★ | **Build** — new IFMAR title; flag electric variant of GT |
| **Basher-derived spec (Slash spec, RTR-spec)** | on-ramp class | ★ | **Build-lite** — advice constrained to frozen platform |
| 1/7 desert (UDR/Felony), 1/6 trucks | bashing | — | **Note only** — *not sanctioned racing*; explicitly not a coverage hole |

---

## 7. Plan that falls out of this map

**Build now (in scope, grounded, reversible):**
1. Make **surface** and **power sub-class** first-class condition tags in the KB/engine (mirroring the
   weather pack), so every rule can be scoped/amplified by them.
2. Author the **grounded, category-scoped, model-gated rules file** for **Tier-A** categories only (§5),
   each rule citing a real free page-citable source, staged as drafts pending William's source sign-off
   before going live — D18 stays intact.
3. Cheap structural closes: e-truggy models, 4WD SCT split, eGT flag, World GT type.

**Surface for William (product-scope calls, not pure engineering):**
- The **oval branch** (a whole asymmetric setup engine) — worth it? It's a large, distinct paradigm.
- **Drift** (judged, not timed — needs a different advice model), **Mini-Z** (new scale), **M-chassis**,
  **USVTA vintage** — add as racing classes, or stay focused on timed racing?
- **Book acquisitions** to unlock Tier-B pan/F1 grounding.

**Hard line kept throughout:** for **1/5 large scale, crawler, and (until a book) pan/F1**, the engineer
**refuses** category-specific tuning rather than guessing. Grounded or silent.

---

*Detailed data: `docs/research/world-map/disciplines.json` (full taxonomy + axes),
`sources.json` (every citable reference + tier), `ontology.json` (84 params / 21 symptoms / 17 option classes).
Catalog provenance: `docs/research/competitive-scene/g*.json`.*
