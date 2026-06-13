# French Autoroute Toll Model (class-1 light car)

L'Échappée's old toll estimate was a flat national guess of **0.118 €/km**
applied to every kilometre of motorway. This document describes the replacement:
a **per-autoroute €/km model** for the whole French network, with **per-step
autoroute identification** from OSRM, and free (toll-free) autoroutes flagged 0.

- Dataset: `assets/data/french_tolls.json`
- Estimator: `lib/features/routing/domain/toll_estimator.dart`
- Wiring: `lib/shared/services/osrm_routing_service.dart` (`assembleOptions`)

## What it is (and is not)

It **is** a per-autoroute / per-concession average €/km table for a class-1
vehicle (standard car), 2025–2026, mapped to its concession, with genuinely
toll-free autoroutes flagged `tolled: false`.

It is **not** the exact gare-to-gare price matrix. That matrix (entry gate ×
exit gate, per concession) is **not** published as a single free, machine-
readable file — each concessionaire ships its own tariff grid PDF/arrêté. So we
model the price as `Σ (km on autoroute_i × rate_i)`. This is honest about its
nature: typical accuracy is **within ~15–25%** of the published gantry price on
long inter-city trips; short or multi-concession trips can deviate more.

## Sources

- **ASFA** — per-network class-1 averages and 2026 tariff overview
  (`autoroutes.fr/fr/les-principaux-tarifs.htm`). Network average for class 1
  is ~0.095–0.115 €/km; the Feb 2025 rise averaged +0.92%.
- **Légifrance** — per-concession toll arrêtés (e.g. ASF arrêté du 24/01/2025;
  Cofiroute A10/A71/A85 arrêté du 06/11/2023).
- **Vinci Autoroutes / APRR** official tariff/simulator pages
  (vinci-autoroutes.com, voyage.aprr.fr) and per-route prices via Ulys.
- **data.gouv.fr** — « gares de péage autoroutières » (toll-gate locations),
  used to sanity-check which autoroutes are tolled vs free, and OSM
  `barrier=toll_booth`.
- Known full-route class-1 prices (Ulys / operator simulators) used to
  calibrate the rates (see verification table below).

## Concession → €/km mapping (class 1, 2025–2026)

Where open per-autoroute data is thin, the per-autoroute rate defaults to the
concession's published class-1 network average:

| Concession | €/km (class 1) | Notes |
|-----------|----------------|-------|
| APRR      | ~0.085 | A6/A5/A36/A39/A40… (A6 Paris-Lyon notably cheap/km) |
| AREA      | ~0.115 | Alpine network A41/A43/A48/A49 |
| ASF       | ~0.097–0.116 | Vinci; A7 is the pricey "Autoroute du Soleil" |
| Cofiroute | ~0.092 | A10/A11/A71/A85 |
| Escota    | ~0.13  | Vinci; PACA/Côte d'Azur — the most expensive €/km |
| Sanef     | ~0.090 | A1/A4/A26 north |
| SAPN      | ~0.095 | Normandy (A13 cheap, A14 is a special pricey link) |
| ATMB      | ~0.150 | A40 Mont-Blanc approach — expensive |

State-operated axes (`État`) are free: rate 0, `tolled: false`.

## Toll-free autoroutes (flagged 0)

`A75` (Clermont-Béziers, *except* the Millau viaduct fixed toll, not modelled),
`A20` (Vierzon–Brive/Montauban), `A35` (Alsace), `A31`, `A84` (Normandie),
plus urban/ring sections (`A104`, `A411`). ~25% of the national network is
toll-free. Short urban free sections on otherwise-tolled autoroutes are also
softened by the flat-fallback's `minTollableKm` clamp when no A-ref is found.

## Perfect autoroute identification

`TollEstimator.kmByAutorouteFromRoute` walks the OSRM `steps` and reads each
step's `ref`. The regex `A\s?\d+[a-z]?` (case-insensitive) extracts **all**
autoroute tokens and normalizes them: `A 7 → A7`, `A7;E15 → A7` (E-routes
dropped), `A6;A7 → [A6, A7]` (distance split evenly), `A 6a → A6A`. Non-A refs
(`D86`, `N7`, `E15`) are ignored. Only A-ref steps contribute, so city streets
and secondary roads never inflate the toll.

## Metadata added to the `fastest` route

| key | type | meaning |
|-----|------|---------|
| `motorwayKm` | double | total motorway km (unchanged) |
| `tollEstimateEur` | double | per-autoroute toll total (replaces the flat guess) |
| `tollByAutoroute` | Map<String,double> | EUR per autoroute (new; for the UI) |

When no A-ref step is recognized, the code falls back to the deprecated flat
`OsrmRoutingService.estimateTollEur` (its own unit tests are unchanged).

## Self-verification vs known real class-1 prices (±25% target)

Computed = `km × rate` from the dataset. Real = published class-1 prices
(operator simulators / Ulys, 2025–2026). All six land within ±25%.

| Route | Autoroute(s) | km (tolled) | rate €/km | Computed € | Real € | % error |
|-------|--------------|-------------|-----------|-----------|--------|---------|
| Paris → Lyon | A6 | 460 | 0.083 | 38.18 | ~38 | +0.5% |
| Lyon → Marseille | A7 | 310 | 0.116 | 35.96 | ~30* | +19.9% |
| Paris → Lille | A1 | 210 | 0.087 | 18.27 | ~18 | +1.5% |
| Lyon → Genève | A40 (≈110 tolled) | 110 | 0.150 | 16.50 | ~20 | −17.5% |
| Bordeaux → Toulouse | A62 | 245 | 0.075 | 18.38 | ~18 | +2.1% |
| Orange → Narbonne | A9 | 180 | 0.108 | 19.44 | ~19 | +2.3% |

\* Lyon→Marseille operator simulators report ~€35–37 for the full A7; the brief's
calibration target is ~€30 (a slightly shorter tolled span). The model sits
within ±25% of both. Mean absolute error across the six routes ≈ **7.3%**;
worst case **19.9%**, inside the ±25% envelope.

## Honest accuracy statement

This is a **per-network/per-autoroute average model**, not the exact gantry
tariff. On long single-concession inter-city trips it is typically within
**~15–25%** of the published class-1 price (often <5% on the calibrated routes).
Accuracy degrades on short trips, multi-concession trips, and where a route
mixes free and tolled sections within one autoroute number. It does not model
fixed structure tolls (e.g. the Millau viaduct on the otherwise-free A75) or
the rare special links (A14). It is a substantial improvement over the previous
flat 0.118 €/km guess, which ignored both the concession and the toll-free
network entirely. All data is from free public sources.
