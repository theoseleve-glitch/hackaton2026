# Off-road tread PROFILE TYPES in our database → surface map (D76 research)

Web-researched + adversarially verified (10-agent workflow, 2026-06-29) characterization of
every off-road tread **profile type** carried in `apps/mobile/src/rcdata.json` (14 brands),
mapped to the three surfaces that actually matter off-road (per the racer): **DRY DIRT**,
**GREASY DIRT**, **ASTRO**. Insert + on-road slicks out of scope. Grounding = manufacturer
tire guides / race guides (internal provenance, D53); the skeptic pass cut every over-stated
"greasy" claim (see Rejected).

## ✅ "Greasy" RESOLVED (William, 2026-06-29) = **A: slick low-grip film**
Canonical `greasy_dirt` = a slick, low-traction film where grip comes from the **compound,
not the lugs** → soft/clay compound + a fine diamond/mini pin (e.g. Matrix Nova Clay,
Schumacher Mini Pin). The "blue-groove / oiled clean line" (interpretation B below) is a
**high-grip** state and is modelled separately (it is NOT `greasy_dirt`). Both kept below
for reference; the advisor encodes **A**.

The research surfaced this as two low-mechanical-bite states that take **opposite** tread
strategies:

| Interpretation | What it is | Tread strategy |
|---|---|---|
| **A. Slick low-grip film** (conventional) | a damp/dusty slippery film over the base; track *looks* wet, low traction | grip comes from the **compound**, not lugs → soft/clay compound, a fine diamond/mini pin (or a taller pin if any loose material) |
| **B. Blue-groove / oiled clean line** | the rubbered-in racing line; slick-*looking* but **high** grip | maximum rubber on the ground → **nano/micro-pin**, low-profile, small dense pins |

These are nearly inverse. The advisor must pick one canonical meaning for `greasy_dirt`.
**Default proposed: A (slick low-grip film)** — it's the conventional racer meaning and the
distinct, useful case; the blue-groove line is better modelled as a *high-grip* state. Both
are documented below so we can wire whichever William confirms.

---

## DRY DIRT — dry/dusty/loose-to-medium, or dry abrasive hard-pack
Grip from the lug digging in (loose) or small pins on firm dust (hard).

| Profile type | DB examples | Compound lean | Source |
|---|---|---|---|
| **open / medium mini-pin** (default buggy tread) | Pro-Line Hole Shot, JetKo Marco, Hot Race Miami | soft on cool/low-grip, step to medium/harder when hot/abrasive | BigSquid Hole Shot review: "great choice on hard dirt, dusty hard pack, or hard pack with a bit of loam on top" |
| **dense small-pin, high-grip** | AKA Impact, Hot Race Sahara | soft→medium; long-wear on abrasive | AKA: "grips in grooved and hard packed dusty surfaces" |
| **pin-on-block / block** (workhorse) | AKA EVO Cityblock, JetKo Block-In / Lesnar, Procircuit H-Block, Sweep Carbide | soft on high-bite hardpack; harder/long-wear when abrasive | AMain (Cityblock): "consistent performance from loose dusty tracks to high bite hard packed tracks" |
| **bar/pin mix** | Pro-Line Convict | S3/S5 long-wear for abrasive dry | Pro-Line: "S3 & S5 long wear for more abrasive dry tracks" |
| **square-pin / web (Gridiron-type)** | AKA EVO Gridiron | super-soft/soft + long-wear | RCMadness/AKA: "designed for tracks that are hard packed and or tracks with little dust" |
| **clay low-pin/bar** (high-bite *dry* clay) | Pro-Line Positron / Electron, Procircuit Claymore | clay (MC) — relies on mechanical bite | Pro-Line: "improved grip and corner speed on indoor clay tracks" |

## GREASY DIRT
### Interpretation A — slick low-grip film (proposed canonical)
Grip from the **compound**; lugs find nothing to dig.

| Profile type | DB examples | Compound lean | Source |
|---|---|---|---|
| **soft diamond / fine pin for slick & sticky** | **Matrix Nova** (Clay/ultra-soft) | ultra-soft / clay | RSRC (Matrix): "the Nova will be the best choice on slippery tracks or when dirt really sticks to the tire in muddy conditions" |
| **clay-compound mini-pin** | Schumacher Mini Pin, Matrix Nova (Clay) | clay / super-soft | racing-cars (Schumacher): green/medium compound "works well in both wet and dry" on degraded grass/soil-mix/dirt |
| **directional micro-pin, pin side** | Pro-Line Buck Shot | M3/M4 | Pro-Line/BigSquid: "standard pins... ideal for loose or low traction conditions where you want the tire to add side grip" |

> DB FIX: `rcdata.json` tags **Matrix Nova** as *astro*, but its grounded source describes
> slippery/muddy low-traction dirt — it's a greasy/slick tyre, not astro. Worth correcting.

### Interpretation B — blue-groove / oiled clean line (high grip, slick-looking)
Maximum rubber down; smallest lugs.

| Profile type | DB examples | Compound lean | Source |
|---|---|---|---|
| **nano / micro-pin** (smallest lug) | Sweep Nanobite, Procircuit Addictive, Raw Speed Radar, JConcepts Reflex | soft to key in; harder only on very abrasive groove | Sweep: "Nanobite... designed for Hard pack and Blue groove, oiled track conditions... the smallest lug we ever made" |
| **low-profile micro-pin** | JetKo J-One | super-soft / clay | RSRC (JetKo): "designed for cleaned, oiled tracks" |
| **small carbide-pin, rounded carcass** | Sweep Super Carbide | soft (blue-groove) → firmer (abrasive) | RedRC (Sweep): "hard packed and blue groove or loose dusty track conditions" |
| **pin-on-block, blue-groove-biased** | Matrix Blackhole | ultra/super soft + clay | AMain (Matrix): "optimized for minimal dust, wet surfaces without loam, and blue groove" |

## ASTRO — by pile length; firm carcass, not clay-on-dirt
| Profile type | DB examples | Compound lean | Source |
|---|---|---|---|
| **long / shag-pile SPIKE** | Schumacher Mini Spike / Full Spike, Mezzo | medium (Yellow) dry → super-soft (Silver) wet/cold | LiveRC (Schumacher): "A longer pile, more shag... requires an adequate spike to dig into the fibres" |
| **short-pile / carpet MINI-PIN** | Schumacher Cactus / Cactus Fusion, Mini Pin | medium (Yellow) dry → soft when damp | LiveRC: "shorter pile Astroturf for which a tire that has smaller pins would be the choice" |
| **pyramid self-sharpening pin** | Pro-Line Pyramid (Z3/Z4) | Z3 medium warm → Z4 soft colder | LiveRC (Pro-Line): "Pyramid (Astro/Turf)... pyramid shaped pins with the knife edge... for Astro racing" |
| **ultra-sharp prism / wedge pin** (carpet) | Pro-Line Prism | soft synthetic-surface | LiveRC (Pro-Line): "Prism (Carpet)... Ultra-Sharp Prism shaped Pins" |
| **stagger-rib / cut-stagger FRONT** (steering tyre) | Schumacher Cut Stagger, JConcepts Swaggers | soft (Silver/Yellow) | AMain (Schumacher): "the 2WD front tire to get for carpet and astroturf"; JConcepts Swaggers "work best on Carpet and Astroturf" |
| **twin-pin / fuzz-pin** (carpet / short-pile turf) | JConcepts Twin Pins, Fuzz Bite | soft carpet (Pink/Green) | JConcepts: "a healthy nest of pins to dig deep into matting in office carpet or tight knit CRC carpeting" |

**Astro compound ladder (all profiles):** medium (Schumacher Yellow) = dry default · super-soft
(Silver) = wet/cold/low-grip · long-life (Blue) = high-grip day · Pro-Line Z4 softer than Z3 for cold.

---

## Rejected by the skeptic pass (cut for grounding integrity)
- **dense small-pin → greasy**: source-contradicted — AKA Impact is a *dry* high-grip hardpack/dusty
  tyre, the opposite of greasy. Kept as dry_dirt only.
- **bar / web tread (Ellipse, Dirt Webs, Space Bars) → greasy**: contradicted — every source puts
  the web/bar family in **high-grip** blue-groove / indoor-clay territory ("extreme high-grip"). Maps
  to firm high-grip dirt, never greasy.
- **AKA P1 / Pro-Line Fugitive / Raw Speed Triumph → greasy**: all are *dry/dusty/abrasive hard-pack*
  durability tyres per their sources; the greasy leg was appended without grounding. Dry_dirt only.
- **Procircuit H-Block / Hot Dice → greasy**: cited source is loose-to-compacted *dry*; the
  greasy/blue-groove/astro copy that appears online belongs to a different product (HPI "HB Block").

## Follow-ups
1. ✅ `greasy_dirt` = **A (slick low-grip film)** — confirmed (2026-06-29).
2. **Fold dry-dirt / greasy / astro into the D75 selection KB** (currently keyed on
   loose_dirt/blue_groove/astroturf/carpet/wet) using this grounded source set. **Blocked on a
   SIGNAL gap** (below) — the engine can't yet tell dry vs greasy dirt, or long vs short astro pile.
3. DB fix: re-tag Matrix Nova (astro → greasy/slick dirt) in `rcdata.json` (Théo's app data).

## Signal gap (the dependency for full precision — Théo zone)
The grounded knowledge above is richer than the inputs the engine currently receives. To USE it,
the app needs to feed two signals it doesn't today (`surfaceToTags`/`conditionsToTags` only emit
loose_dirt/clay/blue_groove/astroturf/carpet/wet + grip/temp):
- **dry vs greasy dirt** — a `greasy`/`slick` track-condition flag (or surface state). Greasy =
  low grip + a slick film; it is NOT `dusty` and NOT `wet`/mud. Without it, a greasy track reads
  as generic loose_dirt and gets the dry-dirt pick.
- **astro pile length** — long/shag vs short pile selects spike vs mini-pin. A surface sub-state
  or a one-tap question would unlock it.

Until those land, the advisor keeps the D75 coverage (loose_dirt temp ladder, blue_groove,
astro, carpet, wet) and this doc is the ready-to-wire source set.
