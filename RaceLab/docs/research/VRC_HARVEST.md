# RaceLab — VRC PRO Parameter Harvest (2026-06-20, D68)

Deep extraction of VRC PROs documented setup taxonomy from the authoritative **vrcworld manual V2.1 "Components properties and set-up options" table** (+ eshop/track/class pages). **95 parameters, 13 genuine blind spots, 33 range upgrades.** TAXONOMY ONLY — units/ranges/structure. **D18: VRC is a sim model, never a citable advice source** (note: its manual bundles the real AE/Reedy Cheat Sheets, which RaceLab already grounds on — so no *new* grounding here, only taxonomy). New fields are folded into `rc-setup-fields.vrc-additions.json`; range upgrades are the integration backlog for template option lists.

## Genuine blind spots (params VRC exposes that our 176-field taxonomy lacked)

- anti roll bar 'disconnect' — VRC exposes a per-end sway-bar DISCONNECT (on/off), distinct from stiffness; RaceLab has sway_bar_front/rear stiffness but no disconnect/engaged boolean field
- steering angle as a numeric DEGREE setup field — RaceLab has ackermann, bump_steer, toe but NO field capturing total steering throw in degrees (VRC documents 22-34 deg bands); closest is none
- head_shim / shim_thickness (mm) — VRC exposes nitro head-shim thickness as a numeric mm slider (observed 0.1 mm). RaceLab has NO head-shim/compression field; diff_height_shim is unrelated. Genuine gap for nitro compression tuning.
- idle_setting / idle_adjustment (%) — VRC has a dedicated idle slider (observed 25%) separate from low/high needle. RaceLab has needle_low/needle_high but NO idle field.
- esc_throttle_launch (% of max) — VRC ESC launch-control magnitude slider (observed 0.0%). RaceLab has esc_boost/esc_turbo/esc_profile but no explicit launch-control percent.
- esc_throttle_launch_duration (msec) — VRC times launch control in msec (observed 150 msec). No RaceLab field for a time-based launch ramp.
- esc_initial_brake_duration (msec) — VRC times the initial-brake pulse in msec (observed 100 msec). RaceLab brake_setup has no time/duration dimension.
- esc_reverse (toggle) — VRC exposes a reverse on/off for electric; RaceLab has no reverse field.
- nitro_performance_level / exhaust_performance_level (%) — VRC tier-locked engine & exhaust performance caps (60/90/100%). A sim-tiering construct, not a real-car field; flagged VRC-only, not adopt-worthy.
- middle_drive side_pulley (pulley step) — belt-drive on-road ratio via selectable side pulley (4 vs 5). RaceLab has center_drive/belt_tension but no discrete drive-pulley-size selector.
- Tyre Profile (flatter vs rounder / tire crown) - VRC exposes tire cross-section profile as its own setup axis (flat for smooth+on-road+oval, round for bumpy+off-road). RaceLab has tire_tread/tire_cut/tire_type but no flat-vs-round profile/crown field. Genuinely new.
- Wheel rotational inertia - VRC treats per-wheel INERTIA as a tunable physics property distinct from static added weight. RaceLab models wheel_weights_* (added mass) but not rotational inertia. New.
- Sintered rotor diameter (brushless) - rotor dia (smaller=RPM, larger=torque) is exposed as a motor-internal spec; RaceLab has motor_kv/turns/timing but no rotor field. Minor/new.

## Range / unit upgrades (precise bounds VRC documents for fields we already have)

- steering throw context: VRC bounds it 22-34 deg by class — if RaceLab adds a steering_angle field, seed range 22-34 deg
- ackermann -> VRC treats it as discrete STEPS (RS up to 5 steps); model RaceLab ackermann as integer steps (e.g. 1-5) rather than free text
- roll_center_front/rear -> VRC = 2 discrete positions (holes) per end; bound as holes/positions, step 1
- shock_position_front/rear -> VRC discrete mount holes: 5 (1:10 electric) up to 8 (1:8 nitro) / 12 (1:10 nitro); model as integer holes, step 1
- camber_front/rear -> VRC discrete steps: 3-4 per end; toe_front/rear -> 2-4 steps; treat as stepped integers
- shock_piston_front/rear -> VRC piston identified by NUMBER OF HOLES (discrete int); add holes unit + step 1
- wheelbase -> VRC adjusts in +/-5mm window (mm, relative)
- weight_bias_front -> VRC splits into L/R (+/-2%) and F/R (+/-4mm); adopt % for lateral, mm for longitudinal
- pinion_teeth/spur_teeth -> VRC seeds tight class bands: 1:8 nitro pinion 15-20T / spur 44-50T; 1:10 nitro pinion 16-23T / spur 54-61T; 1:10 electric spur 90-110T; unit T, step 1T
- tire diameter -> VRC bounds: 1:8 nitro front 35-40mm rear 65-78mm; 1:10 nitro 35-45mm; 1:10 electric 64mm control; unit mm
- tire compound -> VRC uses SHORE hardness numbers (1:8 front 62-72 / rear 65-78 shore; 1:10 55-65 shore) — add shore unit + range to tire compound fields
- motor_turns -> VRC bounds 1:10 electric on-road 4.5-13.5T (RS mod 4.5-8.5T); unit T
- battery_capacity -> VRC discrete 4200/5400/5900 mAh; unit mAh
- pinion_teeth -> adopt unit 'T', step 1T; class-segmented bounds: 1/8 nitro on-road 15-17T, 1/10 nitro on-road 16-18T, 1/10 electric on-road 25-50T (off-road buggy observed 14T nitro / 22T electric).
- spur_teeth -> unit 'T', step 1T; 1/8 nitro 47-50T, 1/10 nitro 59-61T, 1/10 electric 90-110T (Spec electric fixed 100T).
- shift_point -> this is VRC 'upshift point' for the 2-speed, unit 'T', step 1T; 1/8 nitro 18-20T, 1/10 nitro 21-23T.
- diff_front_oil / diff_center_oil / diff_rear_oil -> adopt unit 'cSt (centipoise)' with discrete oil-weight steps; observed in-game values span ~3000-10000 cSt (center 3000, rear 5000, front 10000 on buggy).
- fuel_mix_ratio (fuel oil) -> adopt unit '%'; nitro-class fuel-oil bounds 8-15% (1/8: 8-12%, 1/10: 10-14%), step 1%.
- fuel_nitro_pct -> documented discrete sim values: 1/8 nitro 20-25%, 1/10 nitro 10-16% (tier-fixed).
- motor_turns -> adopt unit 'T'; 1/10 electric on-road documented 4.5T-13.5T (Spec 13.5 / Standard 8.5 / RS 4.5-8.5).
- battery_capacity -> adopt unit 'mAh'; documented packs 4200 / 5400 / 5900 / 6500 mAh.
- needle_high / needle_low / drag_brake / brake_bias_front / esc_profile -> adopt unit '%' on a 0-100 slider with 0.1% granularity (VRC presents all these as % sliders: main needle, low-speed needle, drag brake, total/max brake, throttle limit).
- manifold / exhaust_pipe -> adopt 'exhaust length' as a numeric mm offset slider (RS tier).
- anti_squat -> 0-2 deg (0 deg flat to 2 deg)
- kickup -> 0-20 deg
- toe_front / toe_rear -> unit = deg, 0 deg baseline, ~1 deg illustrated steps
- sway_bar_front / sway_bar_rear -> unit = mm wire diameter, ~0.9-1.1mm (to ~1.3mm), ~0.1-0.2mm gauge steps
- shock_piston_front / shock_piston_rear -> discrete bore .047-.055 in (#1/#2/#3) + hole-count (2 or 3 holes); +1 smaller hole ~= +5wt oil equivalence
- shock_oil_front / shock_oil_rear -> unit = wt grade, ~5 wt granularity (30wt/35wt)
- carb_venturi -> 6.5-9 mm bore, ~1 mm granularity (Reedy 121: 6.5/7.5/8.5mm)
- motor_timing -> deg, 4-6 deg per timing-mark increment, floor 0 deg
- tire_compound -> keep DISCRETE grade enum (soft / medium-soft / medium per named line); VRC does NOT expose a numeric shore value, do NOT add a numeric shore field
- tire_front_diameter / tire_rear_diameter -> confirmed real per-wheel adjustable truing option on foam-tire on-road/pan classes; resets to component default on tire change (exact mm bounds in-game-dialog-only, image-gated)

## Full parameter table (VRC name → range · unit · RaceLab field)

| VRC parameter | range | unit | gran. | tier | RaceLab field |
|---|---|---|---|---|---|
| wheel base | +/-5mm (Standard & RS; not adjustable on Spec) | mm |  | Standard/RS | wheelbase |
| weight balance L/R | +/-2% (Standard & RS; not on Spec) | % |  | Standard/RS | weight_bias_front |
| weight balance F/R | +/-4mm (Standard & RS; not on Spec) | mm |  | Standard/RS | weight_bias_front |
| steering angle (degr) | 1:8 nitro on-road 22-32; 1:10 nitro on-road 25-33 (Std) / 25-34 (RS); 1:10 electric on-road 25-32 — Spec fixed, Std/RS adjustable in this band | deg |  | all (band widens by tier/class) | NONE |
| Ackermann (steps) | discrete steps; RS exposes up to 5 steps (1:10 electric 'RS = 5') | steps | 1 step | Standard/RS | ackermann |
| roll centers F/R | 2/2 positions (front/rear), RS only | holes | 1 position | RS | roll_center_front |
| shock positions F/R | discrete mount positions: 1:8 nitro = 8, 1:10 nitro = 12, 1:10 electric = 5/5 (F/R) | holes | 1 position | Standard/RS | shock_position_front |
| toe angle F/R | discrete steps: 1:8 nitro 4/4, 1:10 nitro 2/2 (F/R) | steps | 1 step | Standard/RS | toe_front |
| camber F/R | discrete steps: 1:8 nitro 4/4, 1:10 nitro 3/3 (F/R) | steps | 1 step | Standard/RS | camber_front |
| caster F | adjustable (Std/RS); steps not numerically tabulated |  |  | Standard/RS | caster_front |
| downstops F/R | adjustable (RS; F/R independent) |  |  | RS | droop_front |
| spring tension F/R | adjustable preload (Spec onward) |  |  | all | shock_preload_front |
| shock absorbers - oil weight | drop-down list of oil weights (wt); discrete selection | wt | list | Standard/RS | shock_oil_front |
| shock absorbers - number of holes (pistons) | piston selected by number of holes; discrete list | holes | 1 hole | Standard/RS | shock_piston_front |
| shock absorbers - spring type | drop-down list of spring types |  | list | Standard/RS | shock_spring_front |
| anti roll bars F/R - stiffness | adjustable both ends (Spec onward) |  |  | all | sway_bar_front |
| anti roll bars F/R - disconnect | on/off disconnect, both ends |  | toggle | all | NONE |
| drag brake | adjustable (Std/RS) |  |  | Standard/RS | drag_brake |
| gearbox pinion 1st | 1:8 nitro 15-17T; 1:10 nitro 16-18T | T | 1T | all | pinion_teeth |
| gearbox spur 1st | 1:8 nitro 47-50T; 1:10 nitro 59-61T; 1:10 electric 90-110T (Std/RS), 100T (Spec) | T | 1T | all | spur_teeth |
| gearbox pinion 2nd | 1:8 nitro 18-20T; 1:10 nitro 21-23T | T | 1T | all | gear_2nd |
| gearbox spur 2nd | 1:8 nitro 44-46T; 1:10 nitro 54-57T | T | 1T | all | gear_2nd |
| clutch pre-load / gap | adjustable (Std/RS) |  |  | Standard/RS | clutch_setup |
| front drive (spool / one-way / differential + pre-load) | drive-type selectable; diff pre-load adjustable on Std/RS |  |  | all | diff_front_type |
| rear drive (solid axle / differential + pre-load) | diff vs solid axle; diff pre-load adjustable |  |  | all | diff_rear_type |
| middle drive line - side pulley 4 / pulley 5 | belt pulley selection (side pulley 4 vs 5) |  |  | Standard/RS | belt_tension_front |
| battery capacity | 4200 / 5400 / 5900 mAh (by tier) | mAh |  | all | battery_capacity |
| motor turns | 1:10 electric on-road: 13.5T (Spec) / 8.5T (Std) / 4.5-8.5T (RS) | T |  | all | motor_turns |
| front tires - shore hardness | 1:8 nitro foam 70 / 62-72; 1:10 nitro 61 / 55-65 (shore) | shore |  | all | tire_front_compound |
| front tires - diameter | 1:8 nitro 37mm (37 / 35-40); 1:10 nitro 37 / 35-40mm; 1:10 electric 64mm control | mm |  | all | tire_front_diameter |
| rear tires - shore hardness | 1:8 nitro 73 / 65-78; 1:10 nitro 63 / 55-65 (shore) | shore |  | all | tire_rear_compound |
| rear tires - diameter | 1:8 nitro 35 / 35-40mm-class; 1:10 nitro 40 / 37-45mm; 1:10 electric 64mm control | mm |  | all | tire_rear_diameter |
| body - rear spoiler / move body F/R | rear spoiler toggle; body fore/aft position adjustable (Std/RS) |  |  | all | body_mounting |
| Pinion gear (gearbox pinion 1st); buggy sheets observed 14T nitro / 22T electric | 15-17 (1/8 nitro on-road), 16-18 (1/10 nitro on-road), 25-50 (1/10 electric on-road) | T | 1T | all (range widens by tier; Spec often fixed) | pinion_teeth |
| Spur gear (gearbox spur 1st); buggy sheets observed 44T both | 47-50 (1/8 nitro), 59-61 (1/10 nitro), 90-110 (1/10 electric); Spec electric fixed 100T | T | 1T | all | spur_teeth |
| Gear ratio / final drive (read-only on sheet) | ~7-11 typical; observed 10.48:1 nitro buggy, 7.17:1 electric buggy | ratio (:1) | derived = spur/pinion x transmission | all | overall_ratio |
| Upshift point (2-speed) | 18-20 (1/8 nitro on-road), 21-23 (1/10 nitro on-road) | T | 1T | Spec/Standard/RS (nitro on-road only) | shift_point |
| Clutch shoe weight | dropdown e.g. Light / heavier steps | steps | discrete | Standard/RS | clutch_shoes |
| Clutch shoe friction | dropdown e.g. High Friction | steps | discrete | Standard/RS | clutch_setup |
| Clutch springs | dropdown ranked 1..4, '4-Hardest' observed | steps | discrete (>=4 options) | Standard/RS | clutch_springs |
| Clutch pre-load | adjustable (X) numeric slider, bound undocumented | steps/mm |  | Spec/Standard/RS | clutch_setup |
| Clutch gap | adjustable (X) slider, bound undocumented | mm |  | Standard/RS | clutch_setup |
| Differential oil — front; observed 10000 cSt (nitro & electric buggy) | discrete oil weights, observed up to 10000 | cSt (centipoise) | discrete oil-weight steps | Standard/RS | diff_front_oil |
| Differential oil — center; observed 3000 cSt nitro / 10000 cSt electric | discrete oil weights, observed 3000-10000 | cSt | discrete steps | Standard/RS | diff_center_oil |
| Differential oil — rear; observed 5000 cSt both buggy sheets | discrete oil weights, observed 5000 | cSt | discrete steps | Standard/RS | diff_rear_oil |
| Differential pre-load (front/rear) | adjustable (X) | steps |  | RS (electric also rear) | diff_height_shim |
| Front drive type: spool / one-way / differential | discrete: spool | one-ways | differential |  | discrete | varies by class/tier | diff_front_type |
| Rear drive type: solid axle / differential | discrete: solid axle | differential |  | discrete | varies | diff_rear_type |
| Middle drive side pulley (belt drive ratio) | side pulley 4 | side pulley 5 (selectable) | pulley step | discrete | Standard/RS (1/10 on-road) | center_drive |
| Nitro engine performance level (tier-locked, sim construct) | 60% / 90% / 100% (Spec/Standard/RS) | % | tier-fixed | all (fixed per tier, not a user slider) | NONE |
| Fuel mixture (main / high-speed needle); observed 60% nitro buggy | 0-100 slider | % | slider % | Spec/Standard/RS | needle_high |
| Low-speed needle; observed 38% | 0-100 slider | % | slider % | RS | needle_low |
| Idle setting / idle adjustment; observed 25% | 0-100 slider | % | slider % | Spec/Standard/RS | NONE |
| Glow plug type; observed 'COLD' | dropdown by heat range (e.g. COLD/MEDIUM/HOT) | heat-range steps | discrete | RS | glow_plug |
| Head shim thickness; observed 0.1 mm (closest RaceLab field is NONE — see blindSpots) | slider, observed 0.1 | mm | ~0.1mm | Spec/Standard (nitro) | NONE |
| Exhaust performance level (tier-locked) | 60% / 100% / 100% (Spec/Standard/RS) | % | tier-fixed | all | exhaust_pipe |
| Exhaust / manifold length offset; observed 0.0 mm | slider mm offset from default | mm | slider mm | RS | manifold |
| Fuel oil percentage; observed 10 | 15/10/8-12 (1/8 nitro by tier); 15/12/10-14 (1/10 nitro) | % | 1% | RS adjustable (Spec/Standard fixed) | fuel_mix_ratio |
| Fuel nitro percentage (tier-fixed) | 20/25/25 (1/8 nitro); 10/16/16 (1/10 nitro) | % | tier-fixed | all | fuel_nitro_pct |
| Motor turns (brushless) | 13.5 (Spec) / 8.5 (Standard) / 4.5-8.5 (RS), 1/10 electric on-road | T (turns) | 1T (discrete motor list) | all | motor_turns |
| Motor KV (component-listed, not a slider; e.g. Tekin T8 Gen2 2050kV) | per-motor | kV | per-motor | all | motor_kv |
| ESC initial brake (% of total); observed 0.0 | 0-100 slider | % | 0.1% | Standard/RS | brake_setup |
| ESC initial brake duration / time; observed 100.0 msec | slider msec | msec | 0.1 msec | RS | brake_setup |
| ESC drag brake (% of total); observed 0.0 | 0-100 slider | % | 0.1% | Standard/RS | drag_brake |
| ESC maximum / total brake (% of max); observed 50.0 | 0-100 slider | % | 0.1% | all | brake_bias_front |
| ESC maximum throttle / throttle limit (% of max); observed 100.0 | 0-100 slider | % | 0.1% | all | esc_profile |
| ESC throttle launch (% of max); observed 0.0 | 0-100 slider | % | 0.1% | Standard/RS | NONE |
| ESC throttle launch duration / time; observed 150.0 msec | slider msec | msec | 0.1 msec | Standard/RS | NONE |
| ESC punch / max-amps profile; dropdown 'maximum' | max-amps profiles 100/160/280 (7 steps) on electric | A (amps) / profile steps | discrete (7 profiles) | Standard/RS | esc_boost |
| ESC reverse (toggle) | on/off (X) |  | toggle | Standard/RS | NONE |
| Battery capacity mAh; buggy components 6500 mAh observed | 4200 / 5400 (1/10 nitro), 5900 (1/10 electric) | mAh | per-pack discrete | varies | battery_capacity |
| Battery cells / voltage (component-listed; e.g. Reedy 4s 14.8V) | per-pack | S (cells) / V | per-pack | all | battery_cells |
| Tyre Compound (named + graded) | discrete grades Soft / Medium-Soft / Medium per named tire line (AKA Cityblock/Gridiron 2/I-Beam/Impact + generic Buggy tire 2/3/4) |  | 3 discrete grades per model line | all | tire_compound |
| Tyre Compound shore hardness | NOT exposed as a numeric shore value in manual or eshop (hardness implied by named grade only) | shore |  | all | tire_compound |
| Tyre Diameter (foam tire truing) | per-wheel adjustable (truing); resets to component default on tire change; exact mm bounds in-game-dialog-only, image-gated so not captured | mm | continuous truing-style adjustment, no discrete step documented | all on-road/pan foam classes | tire_front_diameter / tire_rear_diameter |
| Tyre Inserts / foam density | discrete softer <-> harder insert |  | discrete insert options | all | tire_insert / tire_front_insert / tire_rear_insert |
| Tyre Profile (crown: flat vs round) | discrete flatter <-> rounder (flat=smooth/on-road/oval, round=bumpy/off-road) |  | discrete profile options | all | NONE |
| Tyre Sauce / Tyre Additive | discrete no-sauce <-> add-sauce |  | on/off (real-world dimension = timed application) | all | tire_additive |
| Wheel mass | lighter <-> heavier via component choice; eshop sells 'ultra-light' wheel SKUs (RB Speedline) | g | per-wheel-component property (discrete by component) | RS / branded | wheel_weights_front / wheel_weights_rear |
| Wheel rotational inertia | lower <-> higher (tunable physics property distinct from static added weight) |  |  | RS / branded | NONE |
| Wheel color / decal | discrete drop-down (cosmetic only, not performance) |  | enum | branded | NONE |
| Body / Bodyshell | discrete named bodyshell component per class (Aerospeed/Protoform/Blitz/BittyDesign lines) |  | enum by component | all | body |
| Rear wing / Rear spoiler + position | discrete spoiler choice + discrete position adjustment (own eshop category) |  | discrete positions | Standard / RS | rear_wing / wing_position |
| Wing decal / wing color | discrete drop-down by brand (cosmetic only) |  | enum | branded | NONE |
| Body height / ride attitude | no numeric body-height slider documented; attitude set via ride-height/shock instead | mm |  |  | body_height |
| Anti-squat | 0-2 (0 deg arms flat to 2 deg) | deg | ~1 deg | all (off-road + on-road buggy/truck) | anti_squat |
| Kickup | 0-20 (0 deg arms level to 20 deg) | deg |  | off-road | kickup |
| Toe-in/out front | around 0 deg baseline, 1 deg toe-out illustrated; measured in degrees | deg | 1 deg illustrated | all | toe_front |
| Anti-roll bar / sway bar wire diameter | 0.9-1.1 (#89157 0.9mm softer / #89158 1.1mm stiffer; typical to ~1.3mm) | mm | ~0.1-0.2mm wire-gauge steps | Standard / RS | sway_bar_front / sway_bar_rear |
| Shock pistons (hole size + count) | .047-.055 in hole dia (#1 .055 / #2 .052 / #3 .047); 2 or 3 holes | in (bore) / holes (count) | discrete piston part, ~0.003in steps; +1 smaller hole ~= +5wt oil | all | shock_piston_front / shock_piston_rear |
| Shock fluid / oil | wt grades, 30wt/35wt illustrated, +5wt steps | wt | ~5 wt steps | all | shock_oil_front / shock_oil_rear |
| Carb restrictor | 6.5-9 (Reedy 121: 6.5 / 7.5 / 8.5mm) | mm | ~1mm | nitro | carb_venturi |
| Motor timing (brushed endbell) | 4-6 deg increments per timing mark, floor at 0 deg | deg | 4-6 deg per mark | electric | motor_timing |
| Sintered rotor diameter (brushless) | e.g. 13.0mm (LRP X-12); smaller=RPM, larger=torque | mm | discrete by rotor part | RS / branded | NONE |
| Brake rotor diameter | e.g. 13.0mm sintered rotor (spec detail, no tunable range beyond component) | mm |  |  | brake_setup |

## Catalog corroboration (classes · tracks · brands · models)

**[chassis-suspension-geometry]** CLASSES (track-filter taxonomy, live tracks page): top-level surface classes = Nitro on-road, Nitro off-road, Electric on-road, Electric off-road. Detailed competitive classes (v2.1 PDF table headers + about/community): 1:8 nitro buggy NX, 1:8 nitro buggy RX, 1:8 nitro sport car, 1:8 nitro NASCAR truck, 1:10 nitro touring car, 1:10 nitro NASCAR truck, 1:10 electric on-road (touring), 1:8 electric buggy, 1:10 electric short-course (SC) truck, 1:12 electric pan car, 1:10 electric drifter, 1:8 Rally-X. 25+ classes at Spec + Modified levels. The 3-TIER spec ladder (Spec / Standard / RS-branded) is itself a taxonomy axis: Spec = restricted set-up options, Standard = some options disabled, RS/branded = full adjustability — VRC GATES which geometry fields are even editable by tier (e.g. roll centers & downstops RS-only; Ackermann Std/RS-only). This mirrors RaceLab's templateExposes capability gating. TRACKS by surface (>75 real-world tracks): On-road asphalt — MHS Raceway, Brisbane, Collegno, Heemstede, Lostallo, Fort Myers, Eppelheim 1/2 LRP, Essonne, Fiorano, Melzo, Messina, Toluca Pegaso, Tokyo SPL 1/2, XTR LT1-LT5, XTR MT1-MT6. Carpet/indoor — VRC Carpet 1-7, Heemstede Indoor Carpet, Oulu Indoor, Orlando Indoor, Lausanne CRF, Welkom Arena 1-7. Off-road dirt/astro — Silver Dollar, Montpellier, Fear Farm, VRC Bash Pit (short/long/stadium), Padova IBR. Oval — VRC Super Speedway Oval, Bamberg Oval, Lostallo 2 Oval, Melzo Oval, Sao Paulo Oval, XTR BO1/MO1/SO. Surface taxonomy useful for RaceLab surfaceToTags: asphalt, carpet/indoor, dirt, astroturf, oval. BRANDS (57 in e-shop, 786 components): Aerospeed, AKA, Associated, AVID, BittyDesign, Blitz bodies, Byron, Celltec, Contact Tires, Etec, Gens Ace, GM, GRP, Hot Bodies, HPI, Intercept, Kyosho, Kypom, LRP Electronic, Matrix tires, MAX Engines, Mylaps, Nitrox, Nosram, OS Max, Parma PSE, Picco, ProLine, Protoform, RB Products, Reedy, Runner Time, Serpent, Speed Passion, Star Motor, Stix, Tamiya, Team Losi, Team Novak, Team Orion, Tekin, Thunderpower, Tornado, XCEED, XRay, Xtec. COMPONENT CATEGORIES (e-shop): Chassis, Engine, Exhaust, Motor, Speed controller, Battery, Wheels & tires, Body, Tire compound, Transponder, Rear wing, Fuel. CAVEAT (D18): the v2.1 'Components properties and set-up options' table is the only fully numeric source; off-road (1:8 buggy) numeric geometry ranges were NOT in the on-road-only table and the community setup sheets store values as screenshot images (not text-extractable). On-road numbers above are firm; off-road geometry bounds remain a gap. No cause->effect tuning claims were extracted (sim is not a citable advice source).

**[drivetrain-power]** CLASSES / TIERING (drivetrain-relevant): VRC segments every component into 3 tiers — Spec (free, lowest performance, most options disabled/fixed), Standard (free for full members), RS / branded (purchased, full adjustability + max performance). Adjustable RANGE widens with tier; engine & exhaust 'performance' and nitro% are tier-LOCKED constants (Spec/Standard/RS perf = 60/90/100%; 1/8 nitro% = 20/25/25%). Classes in the components table: 1:8 Nitro On-Road, 1:10 Nitro On-Road, 1:10 Electric On-Road (plus 1:8 Nitro Buggy and 1:8 Electric Buggy from setup sheets). DRIVETRAIN ARCHITECTURE per class: front drive = spool | one-way | differential; rear = solid axle | differential; middle/center = belt with selectable side-pulley (4/5) on 1/10 on-road; buggies use a 3-diff layout (front/center/rear oil-filled, cSt). ESHOP BRANDS (drivetrain/power-relevant): engines — MAX Engines, OS Max, Picco Micromotori, RB Products, Nitrox, Byron (fuel), Star Motor, Tornado; motors — Reedy, Team Orion, Speed Passion, Team Novak, Tekin, LRP, Nosram, Etec, Thunderpower; ESC/speed controllers — Tekin, Team Novak, LRP, Nosram, Speed Passion; batteries — Gens Ace, Kypom, Celltec, Thunderpower, Reedy; exhaust — Xceed/Xtec, RB. Eshop component categories: chassis, engine, exhaust, motor, speed controller, battery, wheels & tires, body, tire compound, transponder, rear wing, fuel. SAMPLE COMPONENT IDs from the two buggy setup sheets: Tekin T8 Gen2 2050kV motor + Tekin RX8 Gen2 ESC + Reedy 4s 14.8V 6500mAh (electric); Xtec .21 buggy engine + Xtec buggy exhaust + Byron Race Gen2 25 fuel (nitro). D18 NOTE: VRC is a SIM — no tier-performance or cause->effect tuning value was extracted as advice; only parameter taxonomy, units, ranges, and catalog facts reported.

**[tires-wheels-body-catalog]** CLASSES (VRC PRO, 'over 25 racing classes' at modified + spec level; confirmed named): 1:8 Nitro Buggy, 1:8 Electric Buggy, 1:10 Electric Short Course (SC) Trucks (2WD + 4WD), 1:10 Nitro Touring Car, 1:10 Electric Touring Car, 1:12 Electric Pan Car, 1:10 Electric Drifter, 1:8 Nitro Sportscar (GT/World GT), NASCAR / Oval, Racing Truck (Tundra Nastruck nitro+electric), RallyX / Dakar-rally (MCD XR5 Max Pro). Each class also splits Spec vs Modified. Component TIERS (gate which setup options unlock): Spec (free F2P, motor/engine perf + many setup options LOCKED) < Standard (some options disabled, slightly under RS) < RS / branded (max perf + FULL adjustability). The number of available setup fields itself depends on component tier - a taxonomy fact.   TRACKS: catalog ~197 entries (site/manual say '75+ real-world tracks'; full Deluxe license 36-42, Standard 22, F2P 10). Real-circuit replicas tagged by REGION + SURFACE. Surfaces: Asphalt, Carpet, Astroturf/outdoor, Clay/dirt (off-road), Indoor-carpet high-altitude (Welkom 1340m). Named replicas: off-road - Psycho Nitro Blast, Silver Dollar, Fear Farm, Harper Adams, IBR Padova, Naxxos, Montpellier, Buenos Aires, Pattaya 1/2, Rhein-Main; on-road - Heemstede, Eppelheim LRP (carpet), Messina, Collegno, Melzo, Fiorano, Lloret de Mar, Snowbirds, Oulu, Tokyo SPL I/II, Atsugi Kyosho, Osaka Central, Lostallo (430m outdoor), Welkom Arena, Clermont-Ferrand, Luxembourg, Bamberg, Brisbane, Mexico City/Toluca. Altitude is modeled (affects nitro carb/needle) - relevant to RaceLab condition tags.   COMPONENT CATEGORIES (eshop): chassis, engine, exhaust, motor, speed controller, battery, wheels & tires, body, tire compound, transponder, rear wing, fuel, accessories.   COMPONENT BRANDS (50+): Aerospeed, AKA, Team Associated, AVID, BittyDesign, Blitz, Byron, Celltec, Contact Tires, Etec, Gens Ace, GM, GRP, Hot Bodies, HPI, Intercept, Kyosho, Kypom, LRP, Matrix tires, MAX Engines, MYLAPS, Nitrox, Nosram, O.S. Max, Parma PSE, Picco, ProLine, Protoform, RB Products, Reedy, Runner Time, Serpent, Speed Passion, Star Motor, Stix, Tamiya, Team Losi, Team Novak, Team Orion, Tekin, Thunderpower, Tornado, XCEED, XRAY, Xtec.   BRANDED CHASSIS MODELS (model-level names the earlier scan could not verify): Caster Racing Fusion EX1 (electric+nitro buggy; 'EX8-R' setup-sheet family), Leadfinger Beretta (nitro buggy), HPI Skorpion SC, Team Associated SC10 / SC10.3 (Contender/Slick Mist/Lucas Oil), Team Associated 12R5 / 12R5.1 / 12R5.2 Factory Team, McAllister Tundra Nastruck (nitro+e racing truck), MCD XR5 Max Pro (rally), Pro-Line 14RS / Bulldog / Flo-Tek, Protoform P909, Xceed T-GT1 / Zytec V2, Central RC Lola, Aerospeed bodies (962-01/02, Lola-01, 1:12 sportscar V-Dezign), Aerospeed Drifter M1/NS1/NSX1. The off-road glossary is keyed to real Associated chassis (RC10B4.1, B44.1, T4.1, TC6, SC10) - confirms VRC models per-chassis option-hole geometry (Ackermann holes, shock-mount inner/outer, camber-link holes).   WHEEL/TIRE PRODUCT EXAMPLES (RB Products): RB front/rear 10-spoke (1:10 on-road), RB Speedline 6-spoke front/rear + Serpent-design variants (1:8 on-road, 'ultra-light') - confirms wheel mass is differentiated by an ultra-light component SKU rather than a free numeric slider.   D18 NOTE: the v2.1/v2.5 manuals bundle a real-world Associated/Reedy 'RC Cheat Sheets' tuning encyclopedia (cause->effect prose). Per standing orders a sim is NOT a citable advice source, so NO cause->effect tuning claims were harvested - only parameter NAMES, units, ranges, granularity, and the class/track/brand/model catalogs (pure taxonomy). Community setup-sheet screenshots that would show exact in-game slider min/max are raster images (getimage.ashx, not OCR-able via WebFetch); the rctech forum page returned HTTP 403. So foam-tire diameter/shore exact mm bounds remain in-game-dialog-only and were not numerically captured.

## Pages fetched

- https://vrcworld.com/manuals/vrcpro/ (TOC + Car set-up section listing: Component structure, Set-up parameters, Set-up dialogs, Setup sheet)
- https://www.vrcworld.com/manuals/vrcpro/default.aspx (Set-up parameters + Set-up dialogs narrative; properties-table summary)
- https://www.vrcworld.com/static/manuals/VRCPROUserManualV2_5.pdf (downloaded 1.3MB, pdftotext -layout: procedural set-up UI text, class list p.~13, NO numeric properties table)
- https://www.vrcworld.com/static/manuals/VRCPROUserManualV2_1.pdf (downloaded 1.7MB, pdftotext -layout: AUTHORITATIVE 'Components properties and set-up options' table with Spec/Standard/RS columns and numeric ranges — the source of all ranges below)
- https://www.vrcworld.com/eshop/components.aspx (component categories + 57-brand catalog, 786 components)
- https://www.vrcworld.com/tracks/default.aspx (class filter list + track list by surface)
- https://www.vrcworld.com/clubs/tip.aspx?club=730&topic=145335 (EX8-R 1:8 e-buggy setup sheet — values were in a screenshot image, not text-extractable; only tire brands recovered)
- https://www.vrcworld.com/series/classes.aspx (404 — does not exist; reported as fallback)
- https://vrcworld.com/manuals/vrcpro/ (HTML index)
- https://vrcworld.com/static/manuals/VRCPROUserManualV2_5.pdf (full text via pdftotext — describes set-up dialog system but NO numeric ranges)
- https://www.vrcworld.com/static/manuals/VRCPROUserManualV2_1.pdf (full text via pdftotext — contains the 'Components properties and set-up options' table WITH ranges, on-road classes)
- https://www.vrcworld.com/eshop/components.aspx (brand + category catalog)
- https://www.vrcworld.com/clubs/tip.aspx?club=730&topic=145335 (EX8-R electric buggy setup tip)
- https://www.vrcworld.com/getimage.ashx?82076811 (EX8-R 1/8 ELECTRIC buggy setup-sheet image — read visually, exact in-game units)
- https://www.vrcworld.com/clubs/tip.aspx?club=730&topic=73061 (1:8 buggy basic setup tip)
- https://www.vrcworld.com/getimage.ashx?29570111 (1:8 NITRO buggy setup-sheet image — read visually, exact in-game units)
- https://www.vrcworld.com/clubs/tip.aspx?club=987&topic=181344 (nitro buggy WC setup — attachment only, no extractable values)
- https://vrcworld.com/manuals/vrcpro/ (WebFetch - manual index, class/track/membership tables)
- https://www.vrcworld.com/static/manuals/VRCPROUserManualV2_5.pdf (downloaded 1.3MB, FlateDecode streams inflated locally via pako + Tj/TJ operator parse, 6665 text lines)
- https://www.vrcworld.com/static/manuals/VRCPROUserManualV2_1.pdf (downloaded 2.1MB, extracted same way, 3309 lines - full GENERAL/NITRO/ELECTRIC set-up parameter glossary index + component-spec numerics)
- https://www.vrcworld.com/eshop/components.aspx (component categories + brand list)
- https://www.vrcworld.com/eshop/components.aspx?price=0&type=7 (tire compound catalog, 117 items / 8 pages)
- https://www.vrcworld.com/eshop/components.aspx?brand=95&price=0&type=15 (RB Products wheels & tires)
- https://www.vrcworld.com/tracks/default.aspx (track catalog ~197 tracks w/ region+surface)
- https://www.vrcworld.com/about/ (class catalog + partner count)
- https://www.igcd.net/game.php?id=1000016998 (branded chassis model list)
- https://www.vrcworld.com/clubs/tip.aspx?club=730&topic=310405 + ?topic=145335 (setup sheets are getimage.ashx raster images, NOT OCR-able - no per-slider numerics)
- https://www.rctech.net/forum/electric-off-road/634437-vrc-pro-offroad-78.html (HTTP 403, unreachable)
