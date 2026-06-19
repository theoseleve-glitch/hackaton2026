# RaceLab — Database Expansion Roadmap (2026-06-19, D65)

From a 8-lens adversarial coverage sweep (101 agents, web-verified, each gap skeptic-checked for *real
· competitive · genuinely absent*). **71 confirmed gaps: 28 Tier-A, 28 Tier-B, 15 Tier-C.** Source of
truth for what the database still needs. Grounding stays internal (D18/D53) — every build item names a
real citable source.

## The headline (what we're actually missing)

1. **Two whole disciplines our named competitor (So Dialed) covers and we can't touch:** competition
   **RWD drift** (D1-10 / Yokomo YD-2 scene) and **dirt/asphalt oval** (ROAR-sanctioned). Zero template,
   zero chassis, zero rules for either.
2. **8 of our 16 templates have NO tuning rules.** Two are fast wins because the template **and** ~22
   registry models already exist: **F1** and **1/12 pan**. The engine greets these cars then can't tune them.
3. **The data model is front/rear + raw-numbers only.** A real setup sheet is **per-corner (LF/RF/LR/RR)**,
   uses **discrete enum selectors** (hole/insert/click positions), and carries **kit defaults + option-part
   catalogues + part numbers**. Oval's asymmetry (stagger, left-weight) is *unexpressible* until this is fixed.
4. **Flagship 2025/26 chassis missing** (RC8B4.2, S14-4, ET48 2.2, MTC3, A800RR, IF14, MBX8R, TRF421X…)
   and a pile of **free official setup-sheet portals** (Kyosho, Schumacher, HB, petitRC) we haven't mined.

## My RC-specialist sequencing (phased — each phase unblocks the next)

> **Launch tension, stated plainly:** drift + oval are large net-new builds. If "full launch ASAP" holds,
> **Phases 0–1 + 3 add real value fast without them**; drift + oval (Phase 2) are the biggest wins but are
> v1.x scope unless you want them at launch. Recommendation below; final priority call is yours.

### Phase 0 — Data-model foundation (do FIRST; it's the skeleton)
Building 200 sheets + new rules on a front/rear, numbers-only model means rework the moment oval/asymmetry
and option-parts land. Fix the record shape first.
- **Per-corner LF/RF/LR/RR value model** (not just front/rear) — required for oval + general precision. Src: AE/Reedy/Hudy RC Cheat Sheets, adrenaline droop/camber guides (track all four corners).
- **Discrete enum selectors** (hole/insert/position/click) modelled as enums, not floats. Src: XRAY XB4/XB8 manuals (eccentric-bushing tables), option-part catalogues.
- **Per-field `kit_default` + option-catalogue + part numbers** on category templates. Src: manufacturer editable setup PDFs (MP11 already proven).
- **Electronics/radio profile sub-record** (EPA, D/R, expo, ESC drag-brake/punch/timing/boost-turbo curve).
- **First-class Manual / exploded-view / option-part entity** linked to fields.
- **Measured-vs-set value pair** per geometry field; **increment/click→mm mapping** per chassis.
- **Emit the humidity tag** (captured but never emitted — a dead grip axis; trivial, overlaps audit P3).

### Phase 1 — Fastest grounded coverage wins (template + models already exist)
- **F1 (1/10 formula) rule pack** — ~12 registry models go from greet-then-refuse to tuned. Src: XRAY X1 setup book, Roche Rapide F1, Tamiya F10x manuals, petitRC F1 DB, EFRA F1 regs.
- **1/12 pan-car (stock & mod) rule pack** — ~10 models lit up. Src: CRC 1/12 tuning guide, Schumacher Eclipse sheets, Awesomatix/XRAY 1/12 manuals, petitRC 1/12 DB.
- Adds **pan/F1 chassis-flex & rear-pod** tuning axis (side springs, pod droop, damper tube, tweak).

### Phase 2 — The two big net-new disciplines (largest competitive holes; So Dialed parity)
- **DRIFT (RWD competition).** New template + RWD-drift chassis (Yokomo YD-2 EX/ZX/MD3.0, MST RMX/FXX-D) +
  drift rule pack + new tuning axes (steering/slide-rack angle, **gyro gain**, counter-steer ratio, F/R grip
  balance, weight bias) + drift grip-tier surfaces (P-tile/PVC/polished/wet). Src: Super-G tech guides,
  DriftMission, Yokomo/MST manuals, petitRC Yokomo drift archive.
- **OVAL (dirt + asphalt).** Needs Phase-0 per-corner first. New template + brands (Custom Works, 1RC, RJ
  Speed) + **asymmetric** tuning (**stagger**, **left-side weight**, banking, panhard/sway) + oval track-states
  (cushion/berm, marbles, dry-slick groove). Src: ROAR Dirt Oval rulebook, Murfdogg "Chassis Tuning 101" PDF,
  Custom Works / 1RC setup sheets.

### Phase 3 — Breadth: flagship chassis + brands + grounding sources (parallel-friendly, mostly free web)
- **+11 flagship models / +3 brands** (see table). All have official manuals/setup PDFs online.
- **Mine the free official setup-sheet portals** to deepen grounding across the categories we ALREADY rule-cover:
  Kyosho (kyoshoeurope/rsrc.biz box setups), **Schumacher Technical Information** (surface-tagged PDFs, no login),
  HB team-driver sheets, petitRC per-scale DBs.
- **Driver setups** — add the missing marquee names: Elliott Boots (SWORKz), Broc Champlin (Schumacher) &
  Marcus Kaerup (AE) — 2025 IFMAR e-offroad champs, Toni Gruber (XRAY GT), + drift/oval pros.

### Phase 4 — Tuning-concept & condition enrichment (deepens precision everywhere)
- **Tuning concepts:** tyre prep/traction-compound/sauce + warmers, ESC timing/**boost/turbo** (mod) vs
  blinky-locked stock, **bump steer**, **front anti-dive** (incl. asymmetric), corner-weighting/chassis tweak,
  shock internals (emulsion vs bladder, rebound, air gap), gurney/wing detail, steering/Ackermann depth.
- **Condition axes:** track-prep grip-STATE (raw/sugared/rubbered-in), **track-evolution / time-of-day**,
  astro pile-depth, indoor-vs-outdoor modifier, surface abrasiveness, altitude/air-density.
- **Tier-B classes:** M-chassis spec (Tamiya M-07/08, TCS), Mini-Z 1/28, RC drag (DR10/Drag Slash), USGT/VTA,
  World GT/GT12, stock/spec touring (17.5/13.5 blinky) as distinct rule sets from modified.

## Full gap inventory (by kind)

**Disciplines/classes (11):** A: RWD drift · dirt/asphalt oval · M-chassis spec · F1 rules · 1/12 pan rules.
B: Mini-Z small-scale · USVTA/USGT · RC drag. C: 1/5–1/6 large-scale on-road · scale/comp crawler · stock-spec touring.

**Chassis models (11):** A: SWORKz S14-4/S12-2 · AE RC8B4.2/e · Tekno ET48 2.2 · JQ "THE Car" Black · Mugen
MTC3 · Awesomatix A800RR · Infinity IF14 Speciale. B: Mugen MBX8R · Tamiya TRF421X · Shepherd Velox V8.3. C: Schumacher Cougar SV2.

**Brands (3):** A: Yokomo drift line (YD-2/MD3.0) · MST. C: Caster Racing.

**Tuning concepts (11):** A: F1+pan rules · ESC boost/turbo timing · tyre prep/sauce · bump steer · front
anti-dive · pan/F1 chassis-flex. B: World GT class · corner-weighting/tweak · shock internals. C: gurney/wing
detail · steering-saver/Ackermann depth.

**Setup sources (9):** A: drift comp data (Super-G/petitRC/Yokomo/MST) · Kyosho setup portal · Schumacher
Technical Info. B: petitRC 1/12+F1 DBs · dirt-oval sources (Murfdogg/Custom Works) · Mini-Z (Kyosho/MiniZMods)
· comp-crawler (Vanquish/Axial/SORCCA) · HB team sheets. C: Velocity/JConcepts sprint+1/8 pages.

**Driver setups (8):** A: drift pros (Yokoi, D1-10) · dirt-oval pros (Murfdogg). B: Mini-Z Kyosho Cup · Elliott
Boots · Champlin/Kaerup · Toni Gruber. C: Matsukura/Sobue (Yokomo/AXON pan) · 1/5 large-scale on-road.

**Surfaces/conditions (8):** B: track-prep grip-state · track-evolution/time-of-day · astro pile-depth ·
indoor/outdoor modifier · oval track-state · surface abrasiveness. C: altitude/air-density · drift grip-tiers.

**Data model (10):** A: per-corner LF/RF/LR/RR · kit_default+option-catalog+part# · discrete enum selectors.
B: emit humidity tag · measured-vs-set pair · Manual/option-part entity · electronics/radio sub-record. C: click→mm map.

## Decisions reserved for William

- **Priority of the two big builds (drift, oval)** vs launch timing — Phase 2 is the largest value but the
  largest scope. Recommend: ship launch on Phases 0–1+3, add drift+oval as v1.x (unless drift is core to the pitch).
- **Source acquisition** — nearly all sources above are **free web** (manufacturer manuals, Kyosho/Schumacher/
  petitRC portals, Super-G, Murfdogg PDF, ROAR rulebook). A few tuning books may need purchase (money = your call).
  Confirm: web-research-acquire as we go, or do you have PDFs to drop in (as with Hudy/MP11)?
