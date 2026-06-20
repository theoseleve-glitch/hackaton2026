# RaceLab — RC World Deepening (2026-06-20, D69)

Deepening of the EXISTING RC world (no new chassis; drift/oval out of scope) from a 6-lens scan of EU+US competition retailers. **165 entries: 21 surfaces, 7 track types, 43 tyres, 94 option parts** across 52 existing models/families. TAXONOMY/FACTS only (D18/D53) — parts + the axis they adjust + variants; cause->effect stays grounded in real books. Structured option-parts data in `option-parts-by-model.json`.

## Off-road surfaces & states (21)

The big enrichment: surface STATES/evolution (most are grip states of surfaces we already have, not new families).

| Surface / state | grip character | variants | maps to |
|---|---|---|---|
| **Loamy dirt / fresh loam** | Soft soil the tyres dig INTO for mechanical grip; traction is never the problem but the line constantly changes through the day, so the race | fresh/moist (diggy) vs worn/dried (line-dependent); damp loam = loads tread | condition tag: loose_dirt; surface-family |
| **Hard-packed dirt / hard pack** | Compacted clay-based dirt; firm, abrasive, high grip ON the racing line with minimal grip variation off it. Eats tyre pins — favours long-we | clean groove vs dusty-on-top; abrasive (high wear) | condition tag: hard-packed / high grip |
| **Blue groove (rubbered-in hard pack)** | A dark, rubbered/polished line that appears in the best line on smooth hard-packed clay as the day progresses; huge grip ON the groove, slic | forming/early vs established groove; dusty-off-line | condition tag: blue_groove; grip evolution (improving) |
| **Watered / tacky (tractioned-up) dirt** | Surface misted/watered (slow repeated misting, not a fire hose) to raise traction and keep dust down; high tacky bite. Morning practice on f | freshly-watered/tacky vs drying-out; misted vs blown-off-then-wet | condition tags: grip improving; wet/damp (additive) |
| **Sugared / sealed dirt (dirt-glue, sugar-water, copolymer)** | Dirt bonded with sugar-water / dirt-glue / copolymer sealer so it holds together, starts a blue groove and grips like carpet; glossy, very h | sugar-water vs commercial dirt-glue vs copolymer seal; extreme grip / high wear | condition tags: very-high grip; surface evolution (stable) |
| **Dry / dusty clay (dry-slick)** | Clay that has dried out and thrown a dust film; cuts side-bite and makes grip strongly line-dependent — slick off the groove. Typical of aft | light dust-film vs fully dry-slick | condition tags: clay family; grip degrading; dusty |
| **Sugar dirt / fluffy 'sugar' dirt** | Dry, powdery, loose 'sugar' surface (distinct from sugar-SEALED tracks) — very low grip that polishes tyres; needs soft compounds and big pi | powdery/loose; very low grip | condition tag: loose_dirt; low grip |
| **Decomposed granite (DG)** | Crushed-granite surface common on US Southwest tracks (also a coarse base layer under built tracks); hard, dusty, gritty — low-to-medium gri | dry/dusty vs watered-up; abrasive | condition tag: hard-packed; high wear |
| **Clay / topsoil mix (track-mix ratios)** | Engineered RC track base: blended clays (black/grey/red/orange/brown/tan/white) cut with ~1/4in sandy/loam soil. ~50/50 to 30/70 clay:topsoi | outdoor 50/50–30/70 vs indoor 50/50–70/30; clay colour blends | condition tag: clay family; surface build-quality |
| **Sand (loose / deep)** | Very low grip, the car digs in; paddle or full-spike tyres needed and grip improves slightly when damp. Deep/dune-style sand needs aggressiv | shallow/damp vs deep/dry; paddle vs long-pin | condition tag: loose_dirt (sand); low grip |
| **Grass** | Slippery with high rolling resistance; full spikes work best and grip drops sharply when wet. Outdoor natural surface, more bash/club than n | dry vs wet (grip collapses); cut-short vs long | condition tag: loose/low-grip; wet additive |
| **Astroturf — short / medium pile** | Artificial turf (often green indoor golf-mat type); the grippier astro variants are short/medium pile giving consistent medium-high syntheti | short vs medium pile; dry (grippy) vs wet (slick) | condition tag: astroturf family; medium-high grip |
| **Astroturf — long pile (green-grocer grass)** | Longer-pile artificial turf ('green grocers grass'); LESS popular than short/med pile — lower grip and harder to find good tyres for, especi | long pile; lower grip; poor wet performance | condition tag: astroturf family; lower grip variant |
| **Sand-dressed / water-dressed astroturf (hockey-pitch)** | Field-hockey artificial pitch (sand- or water-dressed nylon) reused for outdoor off-road; longer, abrasive pile, slick when wet. Outdoor EU/ | sand-dressed vs water-dressed; abrasive; slick-wet | condition tag: astroturf family; abrasive/high-wear |
| **EOS race carpet (off-road)** | European Offroad Series carpet: usually greyish with thick, stand-up fibres giving a large contact surface and extreme, very consistent grip | EOS grey thick-pile; extreme/consistent grip | condition tag: carpet family; very-high grip |
| **Low-grip / worn off-road carpet** | Older, worn or short-pile club off-road carpet (and loop-pile hall carpet); less bite than EOS high-pile, which changes ideal spike length a | worn/short-pile vs loop-pile; medium grip | condition tag: carpet family; lower grip variant |
| **Mixed astro + dirt** | UK-style layouts splicing artificial-turf sections with dirt sections in one lap; demands a compromise tyre and setup that works on both sur | astro sections + dirt sections; split-grip compromise | condition tags: astroturf + loose_dirt (split) |
| **Indoor clay vs outdoor clay** | Same clay family but different prep mix and grip: indoor clay runs a higher clay:topsoil ratio (50/50–70/30), is weather-protected and very  | indoor (consistent, protected) vs outdoor (evolving, weather-exposed) | condition tag: clay family; evolution stable vs degrading |
| **Mud / wet dirt** | Wet sticky soil that clogs tread; needs open full-pin or cut-stagger treads that self-clean. Outdoor, rain-affected. Distinct from watered/t | tacky-wet vs over-wet/clogging; self-cleaning tread needed | condition tag: loose_dirt + wet (additive) |
| **Rutted / washboard surface (condition overlay)** | A bumpiness/condition state on any dirt family: the surface deteriorates into whoops, ruts and washboard as the day wears; loose dirt gets s | smooth vs washboard/whooped vs deep-rutted | condition tag: bumpiness (rough); orthogonal overlay |
| **Blown-out surface (holes / marbles, condition overlay)** | Late-day state where the prepped surface blows off, leaving holes and loose 'marbles' (debris pushed off the line); grip becomes patchy and  | holes vs marbles-off-line; patchy/inconsistent grip | condition tags: grip degrading; bumpiness rough |

## Off-road track types (7)

- **National high-bite clay (prepped)** — Top-tier outdoor/covered clay venues prepped to very high, consistent bite (heavy watering and/or sugar/glue sealing). Blue-grooves hard, runs the softest control compounds in finals; the benchmark na
- **Euro sealed-clay national (wood-glue / copolymer)** — European championship tracks (e.g. Barcelos Buggy Arena, EFRA 1/8 nitro Euros) using a wood-glue-type sealer over clay for extreme, very consistent grip and durability; high-bite and selective for jum
- **Outdoor loam / club dirt** — Weather-exposed natural-loam club tracks; grip is plentiful but the line and surface change all day, so setup is a moving target. Lower prep than nationals; the bread-and-butter outdoor off-road racin
- **Indoor astroturf circuit** — Covered halls laid with short/medium-pile artificial turf; consistent medium-high synthetic grip, weather-independent, abrasive on pins. UK/EU winter-season staple; mini-pin tyres (Minispike/Cactus). 
- **Indoor EOS / carpet off-road series** — Premier indoor carpet series (European Offroad Series and similar) on grey thick-pile race carpet; extreme, ultra-consistent grip, control-tyre racing (Cactus yellow), traction-roll-prone, compounds r
- **Supercross-style dirt layout** — Tight, technical dirt layouts with big rhythm-section jumps, whoops and rollers (RC analogue of moto supercross); surface is usually prepped loam/clay but the defining trait is the jump-heavy, low-spe
- **Rallycross mixed (gravel + tarmac)** — Circuits combining sealed/asphalt straights with gravel or dirt corners (often with a joker lap); split grip across one lap demands a compromise tyre. The paved-plus-loose hybrid track type; abrasive 

## Tyres (43)

### Off-road (tread profiles + compounds + inserts)

- **Pro-Line compound system (M/MC/Z/S/X scale)** (off-road buggy/truck (1/8 + 1/10)) — Pro-Line off-road compound colour code: MC (purple dot) = Firm, indoor clay; M2 (yellow dot) = Medium, outdoor; M3 (green dot) = Soft, outdoor; M4 (blue dot) = Super Soft · _MC / M2 / M3 / M4 (plus Z3 carpet, S3/S4 long-wear, X2/X3)_
- **Pro-Line Hole Shot / Hole Shot 2.0 / 3.0** (1/8 buggy + 1/10 2WD/4WD off-road) — Pin/stud tread profile. Suits outdoor tracks from super loose to hard-packed; the 2.0 4WD/rear is cited for dusty, hard-packed and grooved conditions. Tread PROFILE = med · _M2 / M3 / M4 compounds; 2WD front, 4WD front, rear sizes_
- **Pro-Line Blockade** (1/8 buggy + 1/10 rear off-road) — Block/stagger rear tread profile. Cited for loose, dusty or hard-packed conditions. Sold for 1/8 buggy with closed-cell inserts. · _M2 / M3 / M4 compounds_
- **Pro-Line Bow-Tie** (1/10 4WD/rear off-road) — Bow-tie / X-block tread profile. Cited as all-purpose, all outdoor track conditions (pairs with Crime Fighter front). · _M2 / M3_
- **Pro-Line Caliber** (1/8 buggy + 1/10 4WD front/rear) — Low-profile pin tread. Cited for loose dirt, blue-groove or super-clean surfaces. Offered for 1/8 buggy with closed-cell inserts. · _M2 / M3 / M4_
- **Pro-Line ION / Proton / Suburbs / Slide Lock (clay profiles)** (1/8 buggy + 1/10 off-road, indoor clay / blue-groove) — Low-profile mini-block clay-oriented profiles: ION (indoor clay), Proton (indoor clay, MC only), Suburbs / Suburbs 2.0 (outdoor hard-packed/blue-groove or indoor clay), S · _MC / M2 / M3 / M4 depending on model_
- **Pro-Line Scrubs** (1/10 2WD/4WD off-road, wet/dry clay) — Stud/scrub profile cited for indoor/outdoor wet/dry clay tracks, hard-packed blue-groove surfaces. One of the few profiles explicitly tagged wet-and-dry clay. · _MC / M2 / M3 / M4_
- **Pro-Line ElectroShot / Convict / Sniper / Vandal (1/8)** (1/8 buggy off-road (esp. electric)) — ElectroShot blends Electron + Hole Shot tread (connected centre bars + pins) for longer wear, designed to drive like a Hole Shot 2.0; Convict = spaced small lugs with con · _X2 / X3 / M3 / M4 (ElectroShot); S4 / M4 (Convict/Vandal); M2 (Sniper)_
- **Pro-Line Badlands / Trencher (short-course + stadium)** (1/10 short course + stadium truck off-road) — Badlands = motocross-style oversized lug tread for all-terrain/grass+dirt; Trencher = H-shaped scale all-terrain tread for forward bite. Cover the SC/stadium classes; sup · _M2 / M3 (SC sizes 2.2/3.0; belted HP variants)_
- **Pro-Line closed-cell insert system** (off-road insert/foam (1/8 + 1/10)) — 1/8 buggy tyres are sold with high-density closed-cell foam inserts (waterproof blue closed-cell). Pro-Line also makes a Dual-Stage insert: closed-cell inner (structural  · _closed-cell / open-cell / dual-stage (closed inner + soft open outer)_
- **AKA compound code system (full)** (1/8 buggy + 1/10 off-road) — AKA official compound guide: Medium Long Wear (Z) = Yellow/Yellow dot; Soft (S) = Green; Soft Long Wear (X) = Green/Yellow; Super Soft Long Wear (Q) = Blue/Yellow; Super  · _Z / S / X / Q / V / K / C / H / G (letter + dot colour)_
- **AKA Impact** (1/8 buggy off-road) — Dense small-square-lug pattern with offset lug rows in the centre for forward traction + good wear. Block tread profile. Supplied with soft red inserts. · _Super Soft / Soft / Medium (incl. Long Wear), Clay; pre-mounted variants_
- **AKA Typo** (1/8 buggy off-road) — Very low tread (mini-pin/low-profile) optimised for hard-packed indoor tracks and low-dust grooved outdoor tracks. Hard-surface profile. · _Clay / Super Soft / Soft compounds_
- **AKA I-Beam / Cityblock / Cross Brace / GridIron / P1 / Diamante / Lux** (1/8 buggy off-road) — AKA tread-profile family: I-Beam and Cityblock (block, soft+medium long-wear), Cross Brace (stagger-brace), GridIron/GridIron II (mini-block), P1 (slots between GridIron  · _Soft / Medium / Super Soft (+ Long Wear XR/ZR/QR), Clay_
- **JConcepts compound colour system (full)** (1/8 buggy + 1/10 off-road) — JConcepts compound key by suffix/colour: -00 Yellow = Medium; -01 Blue = Soft (all-purpose); -02 Green = Super Soft (all-purpose); -03 White / A2 = Medium (groove / long- · _-00..-07 + Aqua/A2/A3 + Silver + Black (by colour dot)_
- **JConcepts Bar Codes** (1/10 2WD/4WD front + rear off-road) — Stagger-bar / rib tread profile for hard-packed surfaces that have taken rubber (groove). Front (3017/3020) and rear (3016) versions. · _Blue (Soft) / Orange (Soft groove) / Gold (Soft indoor)_
- **JConcepts Goose Bumps / Flip Outs / Double Dee's / Groovy / Rounder** (1/10 2WD/4WD off-road (soft/loose surfaces)) — Soft-surface mini-pin / stud family: Goose Bumps (soft wet-or-dry), Flip Outs (loose variable terrain), Double Dee's (4WD front soft), Groovy (minimum-traction soft), Rou · _Green (Super Soft) primarily_
- **JConcepts 1/8 buggy treads (Reflex / Octagons / ReHab / Remix / Hybrids)** (1/8 buggy + 1/10 off-road) — 1/8 and 1/10 tread profiles offered across the colour-compound system: Reflex, Octagons (offered in Silver indoor compound), ReHab, Remix, Hybrids (offered in Black Mega  · _Blue/Green/Aqua A2/A3/Silver/Black (Mega Soft) per profile_
- **Schumacher compound colour system** (1/10 2WD/4WD off-road + carpet) — Schumacher off-road compound colours: Silver = super soft (ultimate dirt/dust); Yellow = soft (benchmark, dry); Green = medium (slightly softer than Blue, all-round wet+d · _Silver / Yellow / Green / Blue_
- **Schumacher Mini Pin / Cactus / Stagger / Full Spike / Block** (1/10 2WD/4WD off-road + carpet) — Schumacher tread profiles: Mini Pin (hard-pack & clay), Cactus (high-density pin + stagger-edge for EOS carpet, long-life, anti-grip-roll), Cut Stagger (stagger-rib carpe · _Silver / Yellow / Green / Blue per profile; carpet vs dirt versions_
- **Jetko 1/8 buggy tread profiles** (1/8 buggy off-road) — Jetko profile range (EU competition popular): Dirt Slinger (large/tall pins, dusty bumpy, easiest), Sting (between Block-in & Lesnar, grooved slightly dusty), Block-in (l · _7 profiles spanning loose-pin to low-wear groove; belted (J-One) carcass option_
- **Jetko compound system** (1/8 buggy off-road) — Jetko compounds keyed to track temperature: Red = Ultra Soft (<10-15C, dust/low grip); Orange = Super Soft (15-25C, swept/less dusty); Green = Soft (>25C, high-grip synth · _Red / Orange / Green / Gold + Ultra/Super/Soft Composite_
- **Panther tread profiles (off-road)** (1/8 buggy + 1/10 off-road) — Panther profiles per petitRC: Bobcat (neutral, hard-packed), Lynx / Lynx II (hard-packed + loamy), Slick (smooth high-traction hard-pack & carpet), Raptor (hard-packed dr · _Clay / Blue / Medium-Soft / Soft / Super-Soft compounds_
- **Panther compound + insert system** (1/8 buggy off-road) — Panther 1/8 buggy compounds: Super Soft / Soft / Medium Soft / Medium / Clay. Insert axis: soft, firm, or molded foam chosen by surface. (Z-series long-wear compounds als · _Super Soft / Soft / Medium-Soft / Medium / Clay; soft/firm/molded foam inserts_
- **Hot Race 1/8 buggy tyres (Miami / Sahara / Amazzonia)** (1/8 buggy off-road (EU competition)) — Hot Race (Italian) named-profile tyres sold with inserts: Miami, Sahara, Amazzonia. Each offered across Super Soft / Soft / Medium / Hard plus Clay (and White compound).  · _Super Soft / Soft / Medium / Hard / Clay / White; supplied w/ inserts_
- **Sweep Racing 1/8 buggy tyres + compounds** (1/8 + 1/10 buggy off-road) — Sweep profiles: Sweeper, MicroContact, Carbide, Whip, Pixel, Defender. Compound colours: Yellow / Silver / Blue / Red, with Liquid Rubber and Original Rubber formulations · _Yellow / Silver / Blue / Red; Liquid vs Original Rubber; long-wear variants_
- **Off-road tread PROFILE taxonomy (cross-brand axis)** (off-road buggy/truck (all classes)) — Profile is a first-class axis independent of compound. Families seen across brands: mini-pin / low-profile (Typo, Mini Pin, Hole Shot small) for hard-pack & blue-groove;  · _mini-pin / pin-stud / block / stagger-rib / spike / paddle; standard vs belted carcass_
- **Volante V8T / V9XE / V5 1/10 touring rubber** (1/10 touring (electric + nitro on-road)) — Rubber touring slick line (Marc Rheinard development). Asphalt 'X' compounds graded by track-temp band; carpet-specific 'XV' / 'CP' indoor variants. R-number naming on V8 · _Asphalt: 28X (15-25C), 32X (20-30C), 36X (25-40C), 40X (35-50C); Carpet: 28XV, 32XV (high-grip), V5 28-CP indoor; V8T/V9XE: 24R/28R/32R/36R_
- **Ride 1/10 touring rubber + USGT spec tyre** (1/10 touring / USGT) — Ride (Japan): medium-grip asphalt slicks, high-grip belted touring tyres, and a USGT-spec treaded tyre. The Ride tyre is the official ROAR USGT control/spec tyre (since 2 · _Soft (cold), Medium (normal), Firm (hot); USGT spec = treaded 24/26mm control tyre (4 tyres + 4 inserts)_
- **USGT control-tyre spec (ROAR class)** (1/10 USGT (World GT-R / WGT-R)) — Class-level control/spec tyre rule (not a single product): USGT permits any treaded (non-slick) rubber tyre in 24 or 26mm with a price cap; Ride is the official spec tyre · _Treaded rubber only; widths 24mm / 26mm; official: Ride; alt: Gravity RC_
- **Contact GT12 / 1/12 pan foam (front & rear)** (1/12 pan (GT12)) — Foam tyre system (Schumacher Contact) for 1/12 pan / GT12 (XRAY X12, Awesomatix A12, Roche Rapide P12, Schumacher Atom 2, CRC Gen-XL, Capricorn C-12P). Grip set by FOAM T · _Foam types A, Q, J, T, K; rear shore 30/32/35; front shore 35/40 (44mm front, 46/48mm rear)_
- **Contact LMP12 USA-spec foam fronts (dual-shore)** (1/12 pan (LMP12)) — LMP12 variant of the Contact pan-car range with a USA-spec front at a specific shore (38), distinct from GT12 fronts; LMP12 bodies sit on the same 1/12 pan chassis family · _LMP12 USA-spec front 38 shore (Purple); shares A/Q/J/T/K rears with GT12_
- **BSR Racing 1/8 GT foam (mounted)** (1/8 GT) — Foam GT tyres for 1/8 GT (XRAY GTX8/GTX8.2, Mugen MGT7, Serpent SRX8 GT, SWORKz S35-GT2, Shepherd Velox V8.2). Pre-mounted on 17mm-hex wheels; graded by SHORE plus colour · _Shore 25 / 27 / 30 / 34 / 35; colours Red (27), Orange, Purple (med/firm carpet+asphalt low-wear), XX Pink, Green (med-soft), Blue (firm carpet), Gold_
- **Contact GT8 / Rally 1/8 on-road foam** (1/8 GT) — Contact 1/8-scale on-road foam GT tyre (GT8/Rally) for the 1/8 GT class; graded by SHORE, mounted on dish rims. Sits alongside BSR as a foam option for the 1/8 GT chassis · _40 shore (plus other shore grades in range)_
- **R-number temperature-band naming convention (cross-brand rubber touring)** (1/10 touring (taxonomy)) — Shared convention across Sorex/Volante/Sweep/Solaris rubber touring: the trailing number (24/28/32/36/40 + R or shore) encodes compound hardness pinned to a track-tempera · _24R (coolest/carpet) < 28R < 32R < 36R < 40R (hottest asphalt); ~10C per step_

### On-road (rubber durometer + foam shore)

- **Pro-Line compound system (M/MC/Z/S/X scale)** (off-road buggy/truck (1/8 + 1/10)) — Pro-Line off-road compound colour code: MC (purple dot) = Firm, indoor clay; M2 (yellow dot) = Medium, outdoor; M3 (green dot) = Soft, outdoor; M4 (blue dot) = Super Soft · _MC / M2 / M3 / M4 (plus Z3 carpet, S3/S4 long-wear, X2/X3)_
- **Pro-Line closed-cell insert system** (off-road insert/foam (1/8 + 1/10)) — 1/8 buggy tyres are sold with high-density closed-cell foam inserts (waterproof blue closed-cell). Pro-Line also makes a Dual-Stage insert: closed-cell inner (structural  · _closed-cell / open-cell / dual-stage (closed inner + soft open outer)_
- **AKA compound code system (full)** (1/8 buggy + 1/10 off-road) — AKA official compound guide: Medium Long Wear (Z) = Yellow/Yellow dot; Soft (S) = Green; Soft Long Wear (X) = Green/Yellow; Super Soft Long Wear (Q) = Blue/Yellow; Super  · _Z / S / X / Q / V / K / C / H / G (letter + dot colour)_
- **JConcepts compound colour system (full)** (1/8 buggy + 1/10 off-road) — JConcepts compound key by suffix/colour: -00 Yellow = Medium; -01 Blue = Soft (all-purpose); -02 Green = Super Soft (all-purpose); -03 White / A2 = Medium (groove / long- · _-00..-07 + Aqua/A2/A3 + Silver + Black (by colour dot)_
- **JConcepts Bar Codes** (1/10 2WD/4WD front + rear off-road) — Stagger-bar / rib tread profile for hard-packed surfaces that have taken rubber (groove). Front (3017/3020) and rear (3016) versions. · _Blue (Soft) / Orange (Soft groove) / Gold (Soft indoor)_
- **JConcepts 1/8 buggy treads (Reflex / Octagons / ReHab / Remix / Hybrids)** (1/8 buggy + 1/10 off-road) — 1/8 and 1/10 tread profiles offered across the colour-compound system: Reflex, Octagons (offered in Silver indoor compound), ReHab, Remix, Hybrids (offered in Black Mega  · _Blue/Green/Aqua A2/A3/Silver/Black (Mega Soft) per profile_
- **Schumacher compound colour system** (1/10 2WD/4WD off-road + carpet) — Schumacher off-road compound colours: Silver = super soft (ultimate dirt/dust); Yellow = soft (benchmark, dry); Green = medium (slightly softer than Blue, all-round wet+d · _Silver / Yellow / Green / Blue_
- **Schumacher Mini Pin / Cactus / Stagger / Full Spike / Block** (1/10 2WD/4WD off-road + carpet) — Schumacher tread profiles: Mini Pin (hard-pack & clay), Cactus (high-density pin + stagger-edge for EOS carpet, long-life, anti-grip-roll), Cut Stagger (stagger-rib carpe · _Silver / Yellow / Green / Blue per profile; carpet vs dirt versions_
- **Panther tread profiles (off-road)** (1/8 buggy + 1/10 off-road) — Panther profiles per petitRC: Bobcat (neutral, hard-packed), Lynx / Lynx II (hard-packed + loamy), Slick (smooth high-traction hard-pack & carpet), Raptor (hard-packed dr · _Clay / Blue / Medium-Soft / Soft / Super-Soft compounds_
- **Panther compound + insert system** (1/8 buggy off-road) — Panther 1/8 buggy compounds: Super Soft / Soft / Medium Soft / Medium / Clay. Insert axis: soft, firm, or molded foam chosen by surface. (Z-series long-wear compounds als · _Super Soft / Soft / Medium-Soft / Medium / Clay; soft/firm/molded foam inserts_
- **Sweep Racing 1/8 buggy tyres + compounds** (1/8 + 1/10 buggy off-road) — Sweep profiles: Sweeper, MicroContact, Carbide, Whip, Pixel, Defender. Compound colours: Yellow / Silver / Blue / Red, with Liquid Rubber and Original Rubber formulations · _Yellow / Silver / Blue / Red; Liquid vs Original Rubber; long-wear variants_
- **Off-road tread PROFILE taxonomy (cross-brand axis)** (off-road buggy/truck (all classes)) — Profile is a first-class axis independent of compound. Families seen across brands: mini-pin / low-profile (Typo, Mini Pin, Hole Shot small) for hard-pack & blue-groove;  · _mini-pin / pin-stud / block / stagger-rib / spike / paddle; standard vs belted carcass_
- **Sorex (Team Sorex / Yokomo) 1/10 touring rubber R-series** (1/10 touring (electric + nitro on-road)) — Rubber slick touring tyre for 1/10 touring (XRAY T4/X4, Tamiya TRF421, Yokomo BD11/BD12, Mugen MTC2). R-number = compound hardness mapped to a track-temperature band; low · _24R (carpet, up to ~72F); 28R (asphalt+carpet, ~68-84F, low wear); 32R (asphalt, ~81-96F); 36R (hot asphalt/nitro, ~96-151F+). Yokomo pre-glued shore 28/32/36_
- **Volante V8T / V9XE / V5 1/10 touring rubber** (1/10 touring (electric + nitro on-road)) — Rubber touring slick line (Marc Rheinard development). Asphalt 'X' compounds graded by track-temp band; carpet-specific 'XV' / 'CP' indoor variants. R-number naming on V8 · _Asphalt: 28X (15-25C), 32X (20-30C), 36X (25-40C), 40X (35-50C); Carpet: 28XV, 32XV (high-grip), V5 28-CP indoor; V8T/V9XE: 24R/28R/32R/36R_
- **Volante tire traction (sauce) line** (1/10 touring (additive)) — Tyre additive/traction-compound range paired with Volante rubber; colour-coded by intended surface. Adjusts grip/bite, not a setup-geometry axis. Variant -> surface inten · _Red (high-grip carpet & asphalt); Bronze (asphalt)_
- **Sweep R-Series / EXP EVO-R3 / QTS / D-Spec 1/10 touring rubber** (1/10 touring (electric + nitro on-road)) — Rubber touring tyres: outdoor asphalt 'R'-series (high-profile long-life), EXP asphalt, and QTS carpet lines. R-number graded to an explicit Celsius/Fahrenheit temp ladde · _24R (0-10C), 28R (10-20C), 32R (20-30C), 36R (30-40C), 40R (40-50C); EXP EVO-R3 36deg asphalt; QTS EXP-C 28R carpet_
- **Solaris 1/10 touring rubber (J-series / EX-series)** (1/10 touring (electric + nitro on-road)) — Dedicated 1/10 touring rubber brand, pre-mounted on bolt-on rims (no gluing). 'J' compounds graded by hardness for asphalt; premium 'EX' series on a 30/35/40 ladder. Dist · _28J (balanced club asphalt), 32J (higher-bite/warmer), 36J (hot asphalt); EX series 30 / 35 / 40_
- **Ride 1/10 touring rubber + USGT spec tyre** (1/10 touring / USGT) — Ride (Japan): medium-grip asphalt slicks, high-grip belted touring tyres, and a USGT-spec treaded tyre. The Ride tyre is the official ROAR USGT control/spec tyre (since 2 · _Soft (cold), Medium (normal), Firm (hot); USGT spec = treaded 24/26mm control tyre (4 tyres + 4 inserts)_
- **USGT control-tyre spec (ROAR class)** (1/10 USGT (World GT-R / WGT-R)) — Class-level control/spec tyre rule (not a single product): USGT permits any treaded (non-slick) rubber tyre in 24 or 26mm with a price cap; Ride is the official spec tyre · _Treaded rubber only; widths 24mm / 26mm; official: Ride; alt: Gravity RC_
- **Contact GT12 / 1/12 pan foam (front & rear)** (1/12 pan (GT12)) — Foam tyre system (Schumacher Contact) for 1/12 pan / GT12 (XRAY X12, Awesomatix A12, Roche Rapide P12, Schumacher Atom 2, CRC Gen-XL, Capricorn C-12P). Grip set by FOAM T · _Foam types A, Q, J, T, K; rear shore 30/32/35; front shore 35/40 (44mm front, 46/48mm rear)_
- **Contact foam grades A / Q / J / T / K (character map)** (1/12 pan (GT12 / LMP12)) — Within the Contact pan/GT12 range each foam grade is a distinct compound character at equal shore: A=most durable/affordable; Q=high performance, higher wear, ETS carpet; · _A (durable), Q (peak/high-wear, ETS carpet), J (high-grip/additive carpet), T (all-round), K (high-grip Euro / CRC black carpet)_
- **Contact LMP12 USA-spec foam fronts (dual-shore)** (1/12 pan (LMP12)) — LMP12 variant of the Contact pan-car range with a USA-spec front at a specific shore (38), distinct from GT12 fronts; LMP12 bodies sit on the same 1/12 pan chassis family · _LMP12 USA-spec front 38 shore (Purple); shares A/Q/J/T/K rears with GT12_
- **BSR Racing 1/8 GT foam (mounted)** (1/8 GT) — Foam GT tyres for 1/8 GT (XRAY GTX8/GTX8.2, Mugen MGT7, Serpent SRX8 GT, SWORKz S35-GT2, Shepherd Velox V8.2). Pre-mounted on 17mm-hex wheels; graded by SHORE plus colour · _Shore 25 / 27 / 30 / 34 / 35; colours Red (27), Orange, Purple (med/firm carpet+asphalt low-wear), XX Pink, Green (med-soft), Blue (firm carpet), Gold_
- **Contact GT8 / Rally 1/8 on-road foam** (1/8 GT) — Contact 1/8-scale on-road foam GT tyre (GT8/Rally) for the 1/8 GT class; graded by SHORE, mounted on dish rims. Sits alongside BSR as a foam option for the 1/8 GT chassis · _40 shore (plus other shore grades in range)_
- **Sweep F1 V6 / EXP 1/10 formula rubber (front & rear)** (F1 / 1/10 formula) — Rubber tyre set for 1/10 F1 (XRAY X1, Roche Rapide F1, Serpent F110, Tamiya F104/TRF101/102, Exotek F1 Ultra, CRC WTF1, Yokomo YRF). Sold as front+rear sets; rear uses D- · _V6 D-SPEC Soft/Soft set; EXP F1 V6 carpet set; asphalt vs carpet variants; front and rear differ_
- **CRC RT-1 / F1 Pro-Mount rubber (1/10 formula)** (F1 / 1/10 formula) — Calandra Racing Concepts rubber F1 tyres, pre-mounted/pre-glued on Pro-Mount F1 wheels, for 1/10 formula incl. CRC's own WTF1 DS / WTF1-FC16. Front and rear specific; rub · _RT-1 front and rear; Pro-Mount F1 wheels_
- **1/10 F1 tyre landscape (rubber vs foam, front/rear)** (F1 / 1/10 formula) — Class-level facts: both rubber and foam used; front and rear are different sizes/compounds; brands Sweep, Ride, CRC, Tamiya, HUDY, Volante, Arrowmax, Gravity, Yokomo. Sof · _Rubber and foam; front & rear specific; soft / medium / firm or shore-graded; brands Sweep/Ride/CRC/Tamiya/HUDY/Volante/Arrowmax/Gravity/Yokomo_
- **R-number temperature-band naming convention (cross-brand rubber touring)** (1/10 touring (taxonomy)) — Shared convention across Sorex/Volante/Sweep/Solaris rubber touring: the trailing number (24/28/32/36/40 + R or shore) encodes compound hardness pinned to a track-tempera · _24R (coolest/carpet) < 28R < 32R < 36R < 40R (hottest asphalt); ~10C per step_

## Option parts by model/family (94 parts, 52 models)

**AE B6.2 / B6.4**
- RC10B6.2 7075 Aluminum Arm Mounts (A/B/C/D) with anti-squat & toe inserts → _roll centre / anti-squat / toe_ (A/B/C/D mounts + multiple anti-squat/toe inserts)
- B6 Diff-Height / Bulkhead Inserts (0/1/2/3mm) → _diff height / roll centre / CG_ (0, 1, 2, 3mm inserts; laydown & layback transmissions)
- B6 Steel Chassis Weights (24g / 36g) → _ballast / weight bias_ (24g and 36g)

**AE B6.2D / B6.4D**
- RC10B6.2D +1 Ackermann Plates → _ackermann_ (+1 plate (vs kit))
- B6.2D Gull-Wing Suspension Arms → _roll centre / camber link_ (gull-wing vs straight arms)

**AE B6.4 / B6.4D**
- RC10B6.4 -1mm Scrub Caster & Steering Blocks (Carbon) → _caster / kingpin scrub / camber_ (-1mm scrub (carbon); camber inserts (ASC91985))

**AE B6/B6.1/B6.2**
- RC10 B6 Arm Mount Inserts (1/0.5 step) → _anti-squat / rear toe_ (1.0 and 0.5 step inserts (ASC92011))

**AE B64 / B74.2**
- RC10B64 / B74.2 Arm Mount Blocks (A / C / LRC C Block) → _anti-squat / wheelbase / roll centre_ (A Block, C Block, LRC C Block; aluminum option (ASC92432))

**AE B74.2**
- B74.2 9° Caster Blocks → _caster_ (9° (plus other-degree blocks in range))

**AE T6.2 (stadium) / SC6.2**
- RC10T6.2 Gull-Wing Front & Rear Suspension Arms → _roll centre / camber link_ (front (71138) & rear (71140) gull-wing)

**Agama A319 / A319e**
- Agama A319 A/B/C/D Suspension Mount Blocks (17.5deg caster block) → _caster (17.5deg block) + anti-squat / roll centre (A/B/C/D mounts)_ (17.5deg caster block; A / B / C / D mount blocks with revised RC & anti-squat positions)
- Agama A319 Shock Towers (multi shock-position) + Steering Top Plate → _shock position (towers, rear wing-height holes) + steering-post position (ackermann/bump-steer)_ (multi-hole towers + rear wing-height holes; alt steering-post positions on top plate)

**Awesomatix A800**
- A800 AM14-RC steering arm → _ackermann / steering_ (outside hole (standard) / inside hole (more ackermann))
- A800 AM19-RC upper arm holder → _chassis flex / top-link_ (new hole pattern (more flex) vs standard)

**Awesomatix A800 / A800R**
- A800 carbon roll-center shim set (MAD Wurks 3mm; AT-series high RC shims) → _roll centre_ (3mm carbon shims (high roll-centre))

**Awesomatix A800FX / A800FXR**
- A800 carbon front top deck → _chassis flex / stiffness_ (carbon (vs standard))

**Awesomatix A800R**
- A800 AT143 ARB stiffeners → _sway bar / anti-roll bar_ (stiffener add-on (vs none))

**Capricorn LAB GT2 (1/8 GT)**
- LAB GT2 caster-block bushings + roll-centre / ARB spares → _caster / roll centre / sway bar_ (caster-block bushing options; ARB and RC spares per catalog)

**Infinity IF14-2**
- IF14-2 front/rear wire sway bars (T060 front / T061 rear) → _sway bar / anti-roll bar_ (front T060-1.3 std; rear T061-1.2 std; other diameters optional)
- IF14-2 PRS aluminium C-hub (caster block) → _caster_ (PRS -2deg aluminium C-hub)
- IF14-2 graphite suspension/steering plates + super-hard arms & steering block → _roll centre / chassis flex / steering_ (aluminium plates standard 0 (other heights optional); graphite super-hard arm & steering block)

**Kyosho Inferno MP10**
- IFW629B Aluminum Front Hub Carrier Set 22deg → _caster_ (22deg (vs kit composite blocks; alu 16deg IFW436B and 17.5deg IFW474 also exist in the Inferno hub-carrier line). L/R pair)
- MP10 Front/Rear Anti-Roll (Sway) Bar set + balance weights → _sway bar / roll stiffness; ballast_ (front bar 2.9mm among gauges; balance weights 10g / 20g front & rear)
- MP10 Worlds-Edition Front End Conversion Set → _caster / front geometry (C-hub + stub axle)_ (Worlds Edition limited front-end kit (C-hubs, stub axles, mounts))

**Kyosho Inferno MP11**
- MP11 Aluminum Front Hub Carrier (18deg caster / 12deg kingpin) → _caster + kingpin angle_ (kit 18deg caster / 12deg kingpin; alu carrier options in the Inferno line)
- IF742 5.8mm Sway Bar Ball Joints (3mm hole) → _sway bar linkage_ (5.8mm ball, 3mm hole, qty 4)
- MP11 option-parts catalog (suspension mounts, shock towers, steering plates) → _anti-squat / roll-centre / ackermann (arm mounts, towers, steering plates)_ (full alu/graphite option range (rsrc.biz lists 333 MP11 options))

**Kyosho V-One R4 Evo.3 (1/10 nitro on-road)**
- V-One R4 Evo.3 rod-type front anti-roll bar set + revised front bulkhead → _sway bar / anti-roll bar (+ chassis flex)_ (rod-type front ARB, multiple wire diameters)

**Mugen MBX8R**
- MBX8R Front Upper Arm Mount + pivot inserts → _front roll centre / upper-arm pivot position_ (7075-T6 alu upper arm mount + interchangeable pivot inserts)
- MBX8R C & D Arm-Mount Delrin Inserts (Type A/B/C) → _anti-squat / toe-in (rear C & D mounts)_ (Type A / Type B / Type C (4pc each))
- MBX8 Front/Rear Suspension sway-bar sets + collars → _sway bar / roll stiffness_ (front & rear sway-bar gauges + low-slop collars)
- MBX8R Wheel Hub Offsets + Track-Width Spacers → _track width_ (hub offset 0 / +1 / +2mm; track-width spacer 0.5mm & 0.75mm)

**Mugen MBX8R / MBX8TR**
- MBX8TR C & D mounts with square pills → _toe-in + anti-squat_ (square-pill inserts for C/D mounts)

**Mugen MGT7 (1/8 GT)**
- MGT7 anti-roll bar set + kingpin ball spacers + upper-arm spacers → _sway bar / roll centre / ride height_ (ARB wire options; kingpin spacers upper & lower; upper-arm spacers; rebound/downstop)

**Mugen MTX7 (1/10 nitro on-road)**
- MTX7 adjustable front caster + aluminium front uprights / servo-saver → _caster (+ steering / sway bar)_ (caster 6.4deg to 13.8deg; front ARB)

**SWORKz S35-4**
- S35-4 Brass balance weights + upper-link balls/spacers → _ballast (CG) + camber-link length (roll centre)_ (brass weights 5g/10g/15g/20g/25g; upper-link ball + spacer sets)

**SWORKz S35-4 / S35-4E / S35-4 EVO**
- S35/350 Front Sway Bar Set → _sway bar / roll stiffness (front)_ (2.0 / 2.1 / 2.2 / 2.3 / 2.4 / 2.5 / 2.6 / 2.8 mm)
- S35/350 Rear Sway Bar Set → _sway bar / roll stiffness (rear)_ (2.4mm (SW-115046) / 2.5 (SW-115047) / 2.6 (SW-115006) / 2.7 (SW-330499) / 2.8 (SW-115005) / 3.0 (SW-115007))

**Schumacher CAT L1 / L1R**
- Schumacher CAT L1 Front Rake / Caster Blocks (8° / 10° / 12°) + Front Pivot Strap Inserts → _caster (rake) / track width / sway bar_ (8°,10°,12° rake; front track-width inserts; 1.4/1.8mm front + 1.8mm rear bars)

**Schumacher Cougar LD / KD / KC**
- Schumacher Cougar KD/KC/LD Front Roll (Sway) Bar Kit → _sway bar (front roll stiffness)_ (front roll-bar kit (U7072))

**Schumacher Cougar LD3 (LD3M/S/D)**
- Schumacher Cougar LD3 Front 5° Caster Block → _caster_ (5° front block)

**Serpent SRX8 GT (1/8 GT)**
- SRX8 GT caster inserts → _caster_ (0 to 10 deg via inserts)
- SRX8 GT roll-centre shims → _roll centre_ (1mm / 2mm off chassis plate)
- SRX8 GT ball-raced wire anti-roll bars + diff-position / anti-squat / toe inserts → _sway bar / anti-squat / rear toe / differential / ride height_ (ARB wire diameters; anti-squat 1/1.5/2/2.5/3deg; toe 2/2.5/2.75/3/3.25/3.5/4deg; 4 diff positions)

**Sparko F8 / F8e**
- Sparko F8 7075 Aluminum Caster Block (L/R, 17.5deg) → _caster_ (17.5deg L/R alu block)
- Sparko F8 Front/Rear Sway Bar Sets + Arm Mount D (+0.5mm) → _sway bar / roll stiffness; rear arm-mount position (anti-squat/roll centre)_ (front & rear sway-bar thickness options; Arm Mount D +0.5mm)
- Sparko F8 Upper-Arm Linkage Conversion Kit + Steering System → _upper roll centre (turnbuckle upper arm) + ackermann/steering geometry_ (upper-arm linkage conversion; revised steering assembly)

**TLR 22 5.0**
- TLR 22 5.0 Inner Rear Pivots (roll centre / track width / anti-squat / toe) → _roll centre / track width / anti-squat / toe_ (multi-position pivot set (DC ELITE))
- TLR 22 5.0 Eyelets / Spring Cups (-3 / 0 / +4mm offset) → _ride height / spring perch_ (-3mm, 0mm, +4mm spring-cup offsets)
- Vision Racing TLR 22 5.0 Aluminum Front Caster Block (0°) → _caster_ (0° aluminum (other degrees in range))

**TLR 22 5.0 / 22X-4**
- TLR 22 5.0 Variable Height Axle (VHA) Rear Hubs → _rear roll centre / axle height_ (VHA multi-height hub)

**TLR 22T / 22SCT**
- TLR 22T / 22SCT Aluminum Caster Blocks (5°) → _caster_ (5° (LTT19A01))

**TLR 22X-4**
- TLR 22X-4 Adjustable Inner Pivots (front & rear) → _anti-squat / kick-up / toe / pivot width / roll centre_ (multi-position pivots; caster inserts; VHA hubs)

**TLR 22X-4 / 22 5.0**
- TLR 22X-4 Roll-Center Spacers (0.5mm front & rear) → _roll centre_ (0.5mm front, 0.5mm rear)

**Tamiya TRF421**
- TRF421 one-piece vs two-piece upper deck + 2mm slitted aluminium lower deck (42390) → _chassis flex / layout_ (one-piece (stiffer) / two-piece (more flex) upper deck; 2mm aluminium lower deck with slits)
- TRF421 caster blocks (marked 3/4/5deg) → _caster_ (3 / 4 (std) / 5 deg)
- TRF421 oil-filled gear-diff set (51745) → _differential_ (gear diff filled with selectable oil viscosity)

**Team Associated RC8B4**
- RC8B4 Soft Front Upper Arms w/ wing insert → _front-arm flex / downforce insert_ (soft blend material; optional wing insert in/out)

**Team Associated RC8B4 / RC8B4.1 / RC8T4**
- RC8B4 Caster Inserts (ASC81xxx) → _caster_ (0deg / +/-1deg / +/-2deg insert steps)

**Team Associated RC8B4 / RC8B4e / RC8T4 / RC8T4e**
- RC8B4 Arm Mount Inserts ASC81520 → _anti-squat / kick-up / toe (suspension-mount pills)_ (interchangeable insert positions (multi-axis pill set))

**Team Associated RC8B4 / RC8T4**
- RC8 one-piece angled Anti-Roll-Bar link → _sway-bar linkage_ (one-piece in-line ARB link)

**Tekno NT48 / NT48 2.0 / NT48 2.2**
- NT48 Front Sway Bar Set TKR9485 → _sway bar / roll stiffness (front)_ (2.1 / 2.2 / 2.3 / 2.4 / 2.5 mm (set); plus 3.0mm single (TKR5485))

**Tekno NT48 / NT48.3**
- NT48 V2 Hinge Pin Inserts TKR5165 → _anti-squat / kick-up / toe (hinge-pin geometry)_ (V2 insert set (multiple positions in front & rear braces))
- Tekno 1/8 molded shock pistons (16-dimple blank + drilled) → _shock damping (piston port)_ (drilled variants (replace TKR6138/6139/6131) + 16-dimple blank)

**XRAY GTX8 (1/8 GT)**
- GTX8 optional caster blocks + graphite steering plates → _caster (plus roll centre / anti-dive / ackermann via geometry parts)_ (various optional caster blocks)
- GTX8 aluminium diff-height spacers + adjustable front/rear diffs → _differential / drivetrain height_ (diff-height spacers; adjustable front & rear diffs)

**XRAY NT1 (1/10 nitro on-road)**
- NT1 wire anti-roll bars front/rear (height + diameter adjustable) → _sway bar / anti-roll bar_ (multiple wire diameters; height adjustment via bearing positions)
- NT1 front upper-arm holder + rear roll-centre bridge → _roll centre_ (front 9 positions; rear 6 positions)
- NT1 multi-flex pack (upper-bulkhead brace, rear graphite stiffener, multi-flex battery cover, flex radio-plate brace) → _chassis flex / stiffness_ (brace installed/removed; stiffener removable; intermediate link optional)

**XRAY X4 (2022-2025 touring)**
- X4 Split / two-piece adjustable top deck (301072 / 301073, std 1.6mm 301071) → _chassis flex / stiffness_ (one-piece vs split; steel top-deck shims customizable front and rear deck)
- X4 3-Dot caster inserts (302312) → _caster_ (three-position (3-dot) inserts)
- X4 wire anti-roll bars front/rear (front 302821/302822/302823; rear 303822) → _sway bar / anti-roll bar_ (front 1.1 / 1.2 / 1.3mm; rear 1.2mm (and other diameters))
- X4 2-hole steering clamp horn (293406) → _ackermann / steering_ (23T / 24T / 25T)
- X4 low hexes / wheel hexes (305357) → _ride height / track width_ (-0.5mm offset)
- X4 aluminium T-brace (303768) → _chassis flex / stiffness_ (single aluminium variant (vs none))

**XRAY X4 / X4F (2025 touring)**
- X4 chassis material options (Graphite / Flex-Aluminium / Solid-Aluminium; X4F flex 2.2mm graphite 301021) → _chassis flex / layout_ (graphite / flex-aluminium / solid-aluminium; X4F 2.2mm graphite)

**XRAY XB2**
- XRAY XB2 Caster Blocks (Graphite / Medium / Hard / Aluminum) + caster bushings → _caster / block stiffness_ (graphite(kit), medium, hard, aluminum; caster 0° / 2.5° / 5° bushings)
- XRAY XB2 Lower Roll-Center Eccentric Inserts (9-position) → _lower & upper roll centre_ (9 eccentric positions; up/down + in/out shims)
- XRAY XB2 Aluminum Rear Anti-Roll-Bar Roll-Center Holder (7075) → _roll centre / sway-bar mount_ (3 positions (XRA323043))

**XRAY XB4**
- XRAY XB4 One-Piece Caster Blocks (6° / 9° / 12°) → _caster / front roll centre_ (6°, 9° (kit), 12°)
- XRAY XB4 I.S.S. Eccentric Bushings (caster/anti-squat/wheelbase/track/roll-centre) → _anti-squat / kick-up / wheelbase / track / roll centre_ (eccentric bushing range)
- XRAY XB4 Spring-Steel Anti-Roll (Sway) Bars → _sway bar (roll stiffness)_ (multiple thicknesses, stripe-coded)

**XRAY XB8 (2024)**
- XB8'24 fully-adjustable suspension geometry hardware → _caster, camber, toe, kick-up, anti-dive, anti-squat, ride height, downstops, track-width, roll centre (upper+lower), bump-steer, wheelbase, ackermann_ (all listed axes adjustable via blocks/bushings/shims)
- XB8'24 Anti-Roll-Bar sets (front 2.2 / rear 2.4 + options) → _sway bar / roll stiffness_ (kit front 2.2mm / rear 2.4mm + optional thicker/thinner wires)
- XB8'24 3-in-1 shock caps + extra shock-position row → _shock damping mode + shock geometry position_ (caps: emulsion / rebound / zero-rebound; extra tower position row)

**XRAY XB8 / XB8E**
- XB8 Caster Clips (front / behind upper arm) → _caster_ (clip in front vs behind upper arm; clip thickness set)

**Yokomo BD12**
- BD12 split front/rear upper decks + A.T.F. active top-deck flex → _chassis flex / roll_ (split decks; A.T.F. on/off; optional graphite rear upper deck (stiffer))
- BD12 2.4mm graphite front shock-tower stiffener → _chassis flex / stiffness_ (2.4mm graphite (vs none))
- BD12 graphite steering block arm L (2.4mm) → _ackermann / steering / bump-steer_ (2.4mm graphite, extended tie-rod position)
- BD12 2.4mm graphite bumper support → _chassis flex / stiffness_ (2.4mm graphite)

**Yokomo YZ-2 / DTM3**
- Yokomo YZ-2 Rear Anti-Roll (Sway) Bar Set → _sway bar (rear roll stiffness)_ (6 wires 1.5mm–2.0mm)

**Yokomo YZ-2 / YZ-4 SF2**
- Yokomo YZ-2 / YZ-4 Roll-Center Spacers (0.5mm) → _roll centre_ (0.5mm front & rear)
- Yokomo YZ-2 / YZ-4 SF2 Graphite Rear Suspension Arms → _arm flex / chassis stiffness_ (graphite vs nylon)

**Yokomo YZ-2 DTM3 / CA L3**
- Yokomo YZ-2 Rear LD Stabilizer / Sway Bar Set → _sway bar (rear roll stiffness)_ (set of 6 wire gauges (YOKZ2-412R3A))

