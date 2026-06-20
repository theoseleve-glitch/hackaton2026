# Grip-Evolution Axis — Grounded Tuning Knowledge (2026-06-20, night)

Internal grounding research (D53) for the **#2 racer-audit theme**: how grip changes across a race day /
a run, and how a top racer re-tunes AHEAD of each transition. Pre-grounds racer-audit suggestions #2, #3,
#5, #6, #23 (surface-state evolution active; retrieval keying on evolution; grip-coming-up in the planner;
proactive race-day reads; qualifier→final). **Not user-facing — provenance for rule authoring (William's
call).** Confidence/conflict flags at the end.

## The master principle (the spine all rules hang off)
**As grip COMES UP → make the car HARDER / flatter / more planted. As grip DROPS → SOFTER / freer / more
aggressive.** Stated explicitly across Horizon Hobby, EuroRC, Adrenaline RC (oil), So Dialed (roll centre),
and the owned **HUDY off-road book** (p.10 downstops, p.12 ride height: smooth/high-grip → less travel + lower
ride height).

## Consolidated lever map (the KB-author-ready table)
| Lever | Grip COMING UP (harder/flatter) | Grip DROPPING (softer/freer) | Source |
|---|---|---|---|
| Shock oil | Thicker | Thinner | Adrenaline, EuroRC |
| Springs | Stiffer | Softer | Horizon, EuroRC, RC Racer |
| Ride height | Lower | Higher | HUDY p.12, rsrc.biz |
| Droop/downstop (off-road) | Less travel / higher downstop | More travel | HUDY p.10 |
| Roll centre | Higher (less roll) | Lower (more roll/grip) | So Dialed |
| Anti-roll bar | Stiffer for stability; back off rear to free rotation | Softer (esp. rear) | RC Racer, So Dialed |
| Tyre compound | Harder | Softer | Hearns |
| Tyre insert (off-road) | Firmer | Softer/open-cell | rctech foam thread |
| Track width (off-road) | Wider (anti-roll) | Narrower | Reflex/Tekno |
| Rear diff | Tighter/thicker | Looser/thinner (free, more steering) | RC Racer low-grip |
| Rear toe / camber | Less | More | RC Racer |

## 1. Off-road clay (green AM → blue-groove final → dusty late)
- **Grip coming up → pre-empt traction-roll:** ride height DOWN ("number one thing to combat traction roll"
  in blue-groove), HARDER tyre / wider offset, WIDER track, FIRMER insert (open-cell folds/rolls on high grip),
  stiffer springs / thicker oil, manage roll via bars. Srcs: So Dialed roll-centre, rctech foam-inserts,
  Tekno/ARRMA traction-roll threads.
- **Grip dropping/dusty → free it up:** softer compound (PM dry/dusty → super-soft), softer/looser rear diff,
  more rear toe/camber, more flex. Srcs: Hearns compounds, The RC Racer low-grip.

## 2. On-road carpet/asphalt ("good early, pushes/loose by lap 4")
Grip BUILDS as rubber goes down + tyres heat. Vs steady-state: ride height DOWN (high grip → too-high = body
roll/flip on astro/carpet), oil THICKER, springs stiffer (esp. rear) / roll-centre HIGHER, diff tighter,
**back the sway bar OFF as grip builds to restore mid-corner rotation** (thicker bar = higher initial but less
max grip), step tyre harder. Srcs: rsrc.biz ride-height, EuroRC setup guide, digital-rc, So Dialed, The RC
Racer / RCGuided sway-bar.

## 3. Time-of-day / weather (dew → drying → sun-baked → marbling)
Clay AM tacky→hard tyre, PM dry→super-soft. Asphalt: cool-morning compound goes greasy by afternoon.
**Temp→oil: ±50 cSt per 10–15°F** (hotter → thicker to compensate the heat-thinning). R-compounds "wake up"
hotter → the car set cold isn't the car raced hot. Srcs: Hearns, Adrenaline, Call To Grid tyre-temp.

## 4. Qualifier vs final — tune for the END of the long final
Final runs later/hotter/most-rubber → grip highest + oil thinnest at the END. **"Thicken for the main, not the
hot qualifier"** (slightly thicker than baseline). Tyre-life: run harder in practice to save tyres, carry 3–4
compound options; weight durability/late-grip over early bite the longer the final. Cold final → start much
softer then tune back. Srcs: Adrenaline, VRX shock-oil guide, Hearns, The RC Racer low-grip.

## Confidence & conflict flags (KB author)
- **STRONG / multi-source (safe to author):** master principle · oil/ride-height/roll-centre directions ·
  off-road traction-roll cluster (lower RH + harder tyre + firmer insert + wider track) · "thicken for the main"
  · clay AM-hard → PM-soft.
- **HUDY-grounded (owned, page-citable):** downstop/ride-height p.10/p.12 — but **HUDY off-road book is
  XB808 1/8 off-road and does NOT cover on-road**; don't cite it for §2.
- **THIN / single-source (flag):** the exact "good early, pushes lap 4" carpet chain is assembled from general
  tutorials, not one carpet-specific authority — pair with the D55 on-road set (XRAY NT1 / AE-Reedy cheat
  sheets) before `confidence:high`.
- **CONFLICT:** The RC Racer anti-roll-bar *mechanism* is challenged in its own comments — author the
  *direction* (corroborated by RCGuided/So Dialed), not the causal wording.
- **OUT OF DOMAIN:** the F1 marbling article is full-scale motorsport — concept only; find an RC marble source
  before authoring.
- **Forum sources (rctech/Tekno/ARRMA):** practitioner consensus, weak as a SOLE citation under grounded-or-
  silent — pair each with a manufacturer/cheat-sheet anchor for a LIVE high-confidence rule.
- **Upgrade path:** a named-pro "tune for the main" interview (Maifield/Tebo/Cavalieri) would lift §4 from
  tutorial-grade to pro-documented — not located this pass.
