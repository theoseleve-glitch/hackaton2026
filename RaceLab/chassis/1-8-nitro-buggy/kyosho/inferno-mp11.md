# Kyosho Inferno MP11 — Setup Values

| | |
|---|---|
| **Category** | 1/8 nitro offroad buggy |
| **Brand** | Kyosho |
| **Model** | Inferno MP11 (kit No. 33028) |
| **Engine class** | .21 (3.5cc) nitro, SG crankshaft (pilot shaft) only |
| **Sources** | Official MP11 Setup Sheet ver. 1.00 (`/MP11_EditableSetupSheet.pdf`) · Instruction manual 33028-T02 (`/MP11_Manual.pdf`) |
| **Sheet sections** | Header · Drivetrain & Power · Diff Gear Set-Up · Shock Set-Up · Front · Rear · Other |

> Types: `number` (with unit), `enum` (pick one from options), `text` (free entry), `bool`.
> **Kit default** = factory build per the instruction manual. `—` = no factory default (driver-dependent).

---

## 1. Header (session info — stored on the Session, not the Setup)

| Parameter | Type | Notes |
|---|---|---|
| Driver | text | |
| Date | date | |
| Track / Event | text | links to RaceLab Track entity |

## 2. Power & Drivetrain

| Parameter | Type | Options / Unit | Kit default | Notes |
|---|---|---|---|---|
| Engine | text | brand + model | — | .21 class, SG shaft only |
| Plug | text | e.g. turbo plug ref | — | |
| Manifold | text | | — | |
| Muffler | text | | — | |
| Fuel | text | brand + % nitro | — | manual assumes 30% GP fuel |
| Spur gear module | enum | `0.8M` / `1.0M` | 0.8M | |
| Spur gear | number | T (teeth) | 59T (IFW639-59S lightweight) | 0.8M options: 58T/60T; 1.0M options: 45/46/47T |
| Clutch bell module | enum | `0.8M` / `1.0M` | 0.8M | |
| Clutch bell | number | T | 16T (97058LW-16 one-piece LW) | 0.8M options: 13T/14T/17T |
| Clutch spring | enum | `0.90` / `0.95` / `1.00` / `1.10` | 0.90 (for LW shoe) | stiffer = later, harder engagement |
| Clutch shoe | enum | `Carbon` / `Aluminum` / `HD Aluminum` | 3PC AL (IFW636) | sheet records count/type per material |
| Brake disc | text | | 30mm (IF468) | |
| Brake bias (linkage) | text | upper rod = rear, lower rod = front | ~1mm free play each | from manual step 62 |

## 3. Diff Gear Set-Up

### 3.1 Front diff

| Parameter | Type | Options / Unit | Kit default | Notes |
|---|---|---|---|---|
| Diff oil | number | # (cSt) | **#8000** | fill to 80% |
| Diff bevel gears | enum | `10/20` / `12/18` / `LSD` | 10/20 (IF715) | sun/planet teeth |
| Ring / pinion gear | enum | `43/13` / `42/12` | 43/13 (IF406-43 + IF407-13B) | 42/12 = option (IFW618 + IFW619) |
| Diff position (height) | enum | `Low` / `Mid` / `High` | Low | ring-gear position in bulkhead |

### 3.2 Center diff

| Parameter | Type | Options / Unit | Kit default | Notes |
|---|---|---|---|---|
| Diff oil | number | # (cSt) | **#5000** | fill to 80% |
| Diff bevel gears | enum | `10/20` / `12/18` / `LSD` | 10/20 | |
| Diff size | enum | `Small` / `Large` | Large (std case) | |

### 3.3 Rear diff

| Parameter | Type | Options / Unit | Kit default | Notes |
|---|---|---|---|---|
| Diff oil | number | # (cSt) | **#3000** | fill to 80% |
| Diff bevel gears | enum | `10/20` / `12/18` / `LSD` | 10/20 | sintered 12/18 option (IFW638) |
| Ring / pinion gear | enum | `43/13` / `42/12` | 43/13 | |
| Diff position (height) | enum | `Low` / `Mid` / `High` | Low | |

## 4. Shock Set-Up (front / rear recorded separately)

| Parameter | Type | Options / Unit | Kit default F | Kit default R | Notes |
|---|---|---|---|---|---|
| Shock type | enum | `P` (w/ diaphragm) / `A` (aeration) | P | P | aeration cap = option IF469B |
| Shock case size | text | e.g. L=50 / L=58 | Short (IF626-01, L=50) | Long (IS215-01, L=58) | |
| Shock piston | enum | see §9.3 catalog; code `B`=black `W`=white `T`=taper | **W ø1.4×5** | **B ø1.5×5** | |
| Shock oil | number | # (wt/cSt) | — (record used) | — | shock oil range #300–#850 |
| Shock spring | enum | see §9.1 catalog | **Navy Blue 9-1.6 (L=72)** | **Brown 11-1.6 (L=86)** | |
| Shock length (ball to ball) | number | mm | — | — | measured, the key droop/ride reference |
| Rebound adjust screw | number | mm | 2.5 | 1.5 | arm-mounted rebound screw protrusion |
| Shock position — tower | enum | tower holes (3 F / 4 R) | middle | per manual ⚙ | sheet marks hole used |
| Shock position — arm | enum | arm holes | per manual | per manual | |

## 5. Front

| Parameter | Type | Options / Unit | Kit default | Notes |
|---|---|---|---|---|
| Suspension holder bushing FF | enum | insert `A`/`B` × orientation grid (sheet diagram) | A, neutral | adjusts arm sweep/kick-up |
| Suspension holder bushing FR | enum | insert `A`/`B` × orientation grid | A, neutral | |
| Camber | number | deg. | -1° (typ. baseline) | sheet also records turnbuckle exposed mm |
| Camber link length | number | mm | ~8mm thread exposed | front upper adjust rod 5×38mm |
| Caster / spacer | number | mm (spacer under hub carrier) | — | "Spacer ___mm" on sheet |
| Hub carrier washer | enum | position per diagram | std | |
| Steering plate | enum | hole position (Ackermann) | std | IF718 plate, multiple holes |
| Servo saver bushing | enum | per diagram | std | |
| Tie rod length | number | mm | ~27mm between ends | steering rod 4×46mm |
| Wheel hub | enum | `Narrow` / `Std.` / `Wide` | Std. (IFW625B) | narrow/wide = options |
| Wheel nut | enum | `serrated` / `flanged` | serrated gunmetal (IFW472GM) | |
| Universal swing shaft | enum | `Std. (cap type)` / `IFW703` | Std. cap (IF746) | |
| Suspension arm plate | enum | `None` / `Upper` / `Lower` | None | arm stiffener plates |
| Sway bar | number | mm (ø) | **2.3** (IF459-23) | options 2.1–2.9 in 0.1 steps |
| Servo horn | enum | `AL. 18.5mm` / `AL. 20.5mm` / `Plastic` | Plastic | AL = option |

## 6. Rear

| Parameter | Type | Options / Unit | Kit default | Notes |
|---|---|---|---|---|
| Suspension holder bushing RF | enum | insert `A`/`B`/`C` × orientation grid | B, neutral | anti-squat / toe-in adjust |
| Suspension holder bushing RR | enum | insert `A`/`B`/`C` × orientation grid | B, neutral | |
| Camber | number | deg. | -2° (typ. baseline) | + exposed mm on turnbuckle |
| Camber link length | number | mm | ~12mm thread exposed | rear upper adjust rod 5×38mm |
| Wheelbase | number | mm (hub spacer position F/R) | spacer rear of hub | "Wheelbase ___mm" on sheet |
| Torque rod plate | enum | `Plastic` / `Carbon` / `None` | Plastic | chassis brace |
| Torque rod bush | enum | `Plastic` / `Rubber` | Rubber | |
| Wheel hub | enum | `Narrow` / `Std.` / `Wide` | Std. | |
| Wheel nut | enum | `serrated` / `flanged` | serrated gunmetal | |
| Universal swing shaft | enum | `Std. (cap type)` / `IFW703` | Std. cap | HD swing shaft option IF746-01 |
| Suspension arm plate | enum | `None` / `Upper` / `Lower` | None | |
| Sway bar | number | mm (ø) | **2.8** (IF460-28) | options 2.3–3.0 in 0.1 steps |
| Servo horn | enum | `Plastic` / `AL.` | Plastic | (throttle side) |

## 7. Tires & Wheels

| Parameter | Type | Options / Unit | Kit default | Notes |
|---|---|---|---|---|
| Tire (brand + tread) | text | | not included | |
| Tire compound | text | e.g. M3/M4/clay/S3 | — | sheet has "Compounds" field |
| Tire insert | text | open/closed cell, firmness | — | |
| Wheel | text | brand + type | dish white (IFH007W option) | |
| Glue / additive notes | text | | — | RaceLab extension (not on Kyosho sheet) |

## 8. Other (chassis)

| Parameter | Type | Options / Unit | Kit default | Notes |
|---|---|---|---|---|
| Chassis (ride) height — front | number | mm | — | measured at chassis |
| Chassis (ride) height — rear | number | mm | — | |
| Chassis weight (ballast) | enum/diagram | placement on chassis map | none | options: F 10g/20g, R 10g/20g (IFW604B/605B) |
| Battery position | enum | per chassis diagram | std (radio box) | |
| Wing | enum | `Plastic` / `PC` | Plastic white (IF735W) | options: black IF735BK, f-yellow IF735KY, PC |
| Wing position | enum | `Front` / `Rear` | Front | wing-stay mount direction (manual step 66) |
| Wing spacer | number | mm | 0 | IF728 spacer plates |
| Body | text | | Inferno MP11 (IFB027) | |
| Fuel tank | text | | 125cc (IF737) | |

---

## 9. Option catalogs (dropdown values + part numbers)

### 9.1 Big Shock springs

| Spring | Rate-wire code | Length | Part no. | Note |
|---|---|---|---|---|
| Blue 7-1.5 | 7-1.5 | L=70 | IFS001-715 | |
| Red 7.5-1.5 | 7.5-1.5 | L=70 | IFS001-7515 | |
| Light Purple 8-1.5 | 8-1.5 | L=70 | IFS001-815 | |
| Red 8.5-1.5 | 8.5-1.5 | L=81 | IFS002-8515 | |
| Blue 9-1.5 | 9-1.5 | L=81 | IFS002-915 | |
| Light Purple 10-1.5 | 10-1.5 | L=85 | IFS003-1015 | |
| Blue 9-1.5 | 9-1.5 | L=85 | IFS003-915 | |
| Red 9.5-1.5 | 9.5-1.5 | L=85 | IFS003-9515 | |
| Black 8-1.6 | 8-1.6 | L=72 | IFS005-816 | front option |
| **Navy Blue 9-1.6** | 9-1.6 | L=72 | IFS005-916 | **kit front** |
| Black 10.5-1.6 | 10.5-1.6 | L=86 | IFS006-10516 | rear option |
| **Brown 11-1.6** | 11-1.6 | L=86 | IFS006-1116 | **kit rear** |

### 9.2 Sway bars

| Front (IF459-xx) | Rear (IF460-xx) |
|---|---|
| 2.1 / 2.2 / **2.3 (kit)** / 2.4 / 2.5 / 2.6 / 2.7 / 2.8 / 2.9 mm | 2.3 / 2.4 / 2.5 / 2.6 / 2.7 / **2.8 (kit)** / 2.9 / 3.0 mm |

### 9.3 Shock pistons (Big Shock)

| Piston | Part no. | Note |
|---|---|---|
| ø1.2 × 6 hole | IF347-126B | |
| ø1.2 × 8 hole | IF347-128B | SP version IFW401-128 |
| ø1.3 × 5 hole | IF347-135 | |
| ø1.3 × 6 hole | IF347-136B | |
| ø1.3 × 8 hole | IF347-138B | SP version IFW401-138 |
| **ø1.4 × 5 hole (white)** | IF347-145B | **kit front** |
| ø1.4 × 8 hole | IF347-148B | SP version IFW401-148 |
| **ø1.5 × 5 hole (black)** | IF347-155B | **kit rear** |

### 9.4 Silicone oils (Kyosho range)

- **Shock oils (80cc):** #300, #350, #400, #450, #500, #550, #600, #650, #700, #750, #800, #850
- **Diff oils (40cc):** #2000, #3000, #4000, #5000, #6000, #7000, #8000, #9000, #10000, #15000, #20000, #30000, #40000, #50000, #60000, #100000, #200000, #300000, #500000

### 9.5 Gearing & clutch

| Item | Options (part no.) |
|---|---|
| Spur 0.8M | 58T (IFW639-58S), **59T kit** (IFW639-59S), 60T (IFW639-60S) |
| Spur 1.0M | 45T (IFW634-45S), 46T (IFW634-46S), 47T (IFW634-47S) |
| Clutch bell 0.8M one-piece LW | 13T (97058LW-13), 14T (97058LW-14), **16T kit** (97058LW-16), 17T (97058LW-17) |
| Clutch springs | 0.90 (IFW53SB), **0.95** (IFW53MB), 1.00 (IFW53B), 1.10 (IFW53HB), LW 0.95 (IFW637-09) |
| Clutch shoes | 3PC std (IFW52B), 3PC AL (IFW136), 3PC HD AL (IFW339B) |
| Ring/pinion | **43/13 kit** (IF406-43 + IF407-13B), 42/12 (IFW618 + IFW619), sintered bevel 12T/18T (IFW638) |

### 9.6 Chassis weights

Front 10g (IFW604B-10), Front 20g (IFW604B-20), Rear 10g (IFW605B-10), Rear 20g (IFW605B-20).

---

## 10. Mapping notes for the app schema (Théo)

- Sections 2–8 = the `Setup` JSON; section 1 lives on `Session`. §9 catalogs = enum option lists (each option keeps its part number for the spares/shopping features).
- The suspension-holder bushings (FF/FR/RF/RR) are the MP11's signature geometry system: an insert letter + orientation grid exactly as drawn on the sheet — model as `{insert: enum, orientation: enum}` and render the grid like the sheet does.
- Fields the official sheet tracks as a *drawn mark* (shock tower hole, weight placement, battery position) need a small picker UI over the diagram, not a text box — pixel-faithful PDF export depends on it.
- Tire compound/insert/glue fields are RaceLab-enriched beyond the Kyosho sheet (sheet only has Tire/Compounds/Insert/Wheel text boxes) — keep extra fields in an `extensions` block so PDF export stays 1:1.
