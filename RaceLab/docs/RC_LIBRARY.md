# RaceLab — RC Tuning Library

*The engine's knowledge base. Per William (2026-06-17): the app does NOT show citations to users —
these sources are internal QA so the engineer is built on real RC expertise (the edge over So Dialed's
generic-LLM advice), and we widen that knowledge by gathering broadly. Full catalogs:
`docs/research/rc-library/{books,free-guides,theory}.json` + `docs/research/sources-scan/*.json`.*

---

## Tier 1 — Free + ingestable NOW (fetch → `pdftotext` → author/correct rules)

The high-value downloadable concept guides (cause→effect, not blank sheets):

| Source | Covers | Why it matters |
|---|---|---|
| **RC Cheat Sheets** (petitrc, ~113pp) | on-road + off-road + nitro + pan + oval | the closest thing to a complete cross-category effect encyclopedia — one concept per page |
| **Guyatt R/C Handbook V3–4** | off-road buggy + touring | largest single guide, brand-agnostic, with glossary |
| **HUDY Setup Tips** (in-repo) | **off-road** | the off-road rules are already grounded on this (D-log re-citation) |
| **HUDY On-road/Touring Set-Up Book** (free PDF) | **on-road** | the on-road sibling — re-grounds touring/GT/nitro the same way |
| **XRAY NT1 / T1R Set-Up Books** | on-road touring/nitro | Hudy-family one-topic-per-page, on-road |
| **JQRacing "THE Guide"** | 1/8 buggy | plain-prose 1/8 off-road, world-champion author |
| **Mugen MSR Off-Road** + **TLR 8IGHT** guides | 1/8 nitro buggy | on-power/off-power framing; locks down the 1/8 class |
| **Murfdogg Chassis Tuning 101** | dirt oval | the only narrative stagger/wedge/cross-weight source (fills the oval gap) |
| **AE RC Handbook V2** + **TC3** + **RC10B4** | fundamentals + per-model | clean baselines |
| **Bob Wright "The Science of Setup"** (9-part) | theory, all | the *why-it-works* spine (see Theory below) |
| **CompetitionX Tuning Guide hub** (web, ~60 pages) | all parameters | a ~60-tunable direction-of-effect map + a symptom→adjustment "Quick Setup Guide" — ideal seed for a deterministic advisor |

Plus: Touring Car Setting V1, Racing Lines On-Road, Buggy Setup Guide, Serpent 710, Oval Pan Car Setup, Set-up Black Book.

## Tier 2 — Worth acquiring (ranked by knowledge value; spending = William's call)

1. **Dave B Stevens — *Essential Off-road RC Racer's Guide*** — ~$9.95 ebook, 330pp, champion-backed (Coelho/Easton). Best value; A-to-Z per-setting effects for 2WD/4WD/truck/e-buggy.
2. **Dr. Achim Schulz — *RC-Car Fahrwerktechnik*** (German) — the only **first-principles vehicle-dynamics** book in RC, by a **Porsche Motorsport chassis engineer**. The deepest "why" reference (needs translating).
3. **Stevens — *Essential Touring Car Guide*** (264pp, Rheinard/Völker) — the on-road/touring depth upgrade.
4. **Stevens — *Essential 1/12 & F1 Guide*** (Spashett/Ratheisky) — the only real pan/F1 reference (unlocks Tier-B categories).
5. **Schleicher — *The R/C Car Bible*** — cheap broad fundamentals (Kindle) as a sanity baseline.

## Theory backbone (the mechanism layer — so the engine reasons, not just looks up)

- **Bob Wright "Science of Setup"** — physics-first RC curriculum (best single backbone)
- **Weight transfer + roll center** (Wavey Dynamics geometric-vs-elastic; Racing Car Dynamics `ΔW=(W·Ay·h)/t`; tire-load-sensitivity) — the physics that *justifies* nearly every rule: stiffen one end's roll resistance → more load there → *less* relative grip there
- **CompetitionX suspension guide** — the completeness cross-check for `rc-setup-fields.json`

## Coverage & gaps (know our limits)

- **Well-covered** (reason confidently): suspension geometry, weight transfer, roll centers, shocks/springs direction-of-effect, diffs, anti-squat, tyres direction-of-effect.
- **GAP — aero & chassis flex**: no rigorous RC-specific mechanism source exists (only intermediate/anecdotal). → the engine should stay **conservative** on wing/flex (direction-of-effect only, lower confidence) until a deeper source appears.
- **GAP — large-scale (1/5–1/6)**: no concept-explaining free guide found (matches `sources.json` Tier-C — engine refuses category-specific large-scale tuning).
- **Thin** — shock-damping *mechanism* (bladder/emulsion, pack as velocity² effect): stitched from general-automotive + vendor pages, adequate but not single-source.
- **Locked behind Cloudflare**: RCTech "Understanding Tuning" wikis/threads (real + rich, but 403 to automated fetch — manual capture only).

## How this feeds the engine

The books/guides are **source material I read to author and correct rules** — NOT raw text in the deterministic path (D18). Plan:
1. **Re-ground the 126 on-road rules** on the free **HUDY On-road book + XRAY NT1 + AE Cheat Sheets** (same pass as the off-road Hudy re-citation).
2. **Widen** off-road with JQ THE Guide + Mugen MSR + TLR 8IGHT + Guyatt + Bob Wright (deepen the mechanism behind each rule).
3. **Validate directions** against the XRAY VIP DB (~19.5k real setups) + champion setup sheets.
4. **Fill/flag gaps** (aero/flex stay conservative; large-scale stays silent).
5. **Acquisitions** unlock pan/F1 (Stevens 1/12&F1) and first-principles depth (Schulz).
