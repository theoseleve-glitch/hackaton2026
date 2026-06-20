# On-Road Tyre Prep / Additive / Insert — Grounded Tuning Knowledge (2026-06-20, night)

Internal grounding research (D53) gathered to **unblock racer-audit suggestion #4** ("on-road tyres are
compound-only — no additive-timing or foam/insert rule"). This is the knowledge a KB author needs to turn
into cited rules for 1/10 electric touring (carpet + asphalt), 1/10 nitro 200mm, and 1/8 GT / 1/12 pan foam.
Every direction below traces to a real source; honesty flags mark what's NOT yet strong enough to author.
**Not user-facing copy — provenance for rule authoring (William's call).**

## Lever 1 — Tyre additive / traction compound (rubber)
- **Soak/cook window:** ~10–20 min to penetrate; ~30 min in cold; shorten on high-bite tracks. Carpet ~15 min
  soak / wipe ~10 min before run; asphalt 20–30 min / wipe 10 min before. **Direction: longer soak → more grip
  but shorter window / more aggressive on already-grippy tracks.**
- **Application zone:** full circumference+width → max overall grip; edge/inner-edge of fronts → more rotation
  (steering); full coat on rears → rear bite. **Zone biases balance without touching suspension.**
- **Wipe dry immediately before the run** — running wet tyres loses grip and is unpredictable.
- **Warmers:** accelerate the reaction, drive softeners deeper; target ~110–125°F (43–52°C). Mainly an
  **asphalt** tool; "unnecessary" on carpet (one experienced-racer view).
- Sources: rcpress.com/wp/?p=7851 · fiveeight0sixsix (rubber-tyre-prep basics) · racing-cars.com Schumacher
  SXT 3.0 · rcmart traction-compound guide.

## Lever 2 — Inserts / foam (touring rubber + GT foam)
- **Firmer insert → holds tyre shape under cornering load, more stable/predictable** (high-grip / heavier /
  high-speed). **Softer insert → more flex/conformability** (low-grip / lighter car).
- **Wear signal: fastest wear down the middle = insert too hard** (balloons at speed, shrinks contact patch).
- **Pairing rule: match insert to compound** (soft+soft, firm+hard).
- Open-cell = conformable/slow recovery; closed-cell = instant feedback.
- Sources: Hearns Hobbies (off-road foam inserts) · rcteam (foam inserts) · rctech (tires/inserts touring).

## Lever 3 — Tyre temperature / overheating (the mirror of the cold cure)
- **Graining / >~50°C after a run = compound too soft for track temp.**
- **Cure for too-hot/greasy: HARDER compound** (consistent grip, no ballooning) + **firmer insert** (resists
  ballooning, balanced against center-wear).
- **Chassis load-shedding when over-gripped/hot:** wider track (less lateral transfer / traction-roll), higher
  roll-centre (sheds side bite); generally "as grip comes up, make the car harder" — thicker oil, harder
  springs, lower ride height.
- **Opposite (cold/low grip): SOFTER compound** — the exact inverse. *(This mirrored pair is what makes a
  `tyre_overheating` symptom safe to add — see racer-audit #18.)*
- Sources: Hearns compounds guide · sodialed track-width + roll-center · reflexracing traction-roll 12th.

## Lever 4 — Foam-tyre specifics (1/12 pan / 1/8 GT)
- **Shore by temp/grip:** 1/12 ~32–45, 1/8 GT 25–45; **higher shore = hot/high-bite (resists overheat, lasts),
  lower = cold/low-bite.**
- **Front 2–5 shore HARDER than rear → stability** (softer front → more steering).
- **Diameter/stagger:** smaller rear/front gap → more rotation; **smaller overall diameter → flatter car, less
  traction-roll/body-roll** (high-bite carpet → cut smaller, ~58–60mm). Finish truing 100–200 grit.
- **Foam sauce:** soak then wipe ~15 min before → "comes in quicker"; asphalt 20–30/wipe 10; sidewall CA glue
  → more rigidity, less grip-roll/chunking.
- Sources: oople foam-tyres archive · racing-cars.com GT8 foam · rcmart pan-car foam · pphaneuf foam-tyres.

## Authoring guidance (for the KB owner)
- **Strong enough to author cited rules now:** additive soak window + zone→balance + wipe-before-run · firmer/
  softer insert direction + center-wear-signal · harder-when-hot / softer-when-cold mirrored pair + wider-track/
  higher-roll-centre load-shedding · foam shore-by-temp + F-harder-than-R stagger + smaller-diameter→less-roll +
  foam sauce timing.
- **Under-sourced — leave draft / Tier-B, do NOT assert:** oil-vs-solvent additive distinction (sources split
  on carpet-vs-asphalt formulation, not oil-vs-solvent) · dual-stage/progressive insert detail beyond "firmer =
  more support" · precise longevity/window NUMBERS (the grip-vs-window tradeoff is directional, not quantified).
- Most numeric windows corroborated across ≥2 sources. Strongest single sources: Hearns Hobbies compounds guide
  (overheat/graining/insert-wear) and RCPRESS (additive zone/timing/warmers).
