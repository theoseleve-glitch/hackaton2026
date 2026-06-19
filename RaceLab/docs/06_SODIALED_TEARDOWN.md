# 06 — So Dialed Teardown (competitive intel)

> Source: William's web-research teardown, 2026-06-11 (app page, Getting Started guide, App Store + Play listings, sodialed.com/setups). The **physical benchmark** — feeding their AI Mechanic ("Arcy") our 10 eval scenarios from a phone — is still open and is the head-to-head receipt for the pitch.

## Their app structure

| Surface | What it does |
|---|---|
| Garage / Cars | Add a car from **600+ models** (1/5–1/12, on-road/off-road/drag/dirt-oval/drift/speed-run) or a generic template fallback ("2WD Off-road") |
| Setups list | Setups per car, with a **"starred settings"** filter so frequently-tuned params surface first |
| Locked Setups | Read-only manufacturer kit setups as reference baselines |
| Shared Setups | Community setups ranked by "Thanked"/"Copied"; follow drivers, copy a setup, compare it vs your active one |
| AI Mechanic ("Arcy") | Chat button on the setup screen — cloud/LLM-based, knows the car's settings/kit defaults/community values |
| Race Log | Race entries with track conditions, grip, weather; review later which changes improved lap times |
| My Gear | Pre-configured tire sets / batteries / motors swapped into a setup without re-entry |
| Tools | Gear-ratio calculator (FDR + rollout) |

## Key behaviors

- **Setup workflow:** base setup entered once into the car template; "Add Setup" duplicates and **auto-diffs vs the source with changes highlighted in orange**; a "vs" button compares any two setups.
- **AI:** conversational, condition questions handled ("what should I change for low-grip dirt"). **Cloud-only — needs connectivity — and only works on manually-entered setups** (PDF uploads don't feed it). Metered on the free tier.
- **Offline "Dinosaur Mode":** storage works without signal, syncs later — but the AI does not.
- PDF export to manufacturer sheets for supported models; sodialed.com hosts a free pro setup-sheet database as the funnel.
- **Monetization:** free = few cars/setups + limited AI questions; Sportsman $4.99/mo / $39.99/yr = unlimited everything + race log + starred + images + change history + dark mode. App Store 4.8★ (**only 105 ratings**), v1.6.9, actively maintained.

## What we conclude (chief-officer read)

1. **Their moat is content breadth, not technology.** 105 ratings = a small, beatable niche. Nothing in their stack is hard to copy; our cited deterministic advisor is hard for them to copy without abandoning their cloud-AI subscription logic.
2. **D18 confirmed by their weaknesses:** their AI is metered, connectivity-dependent, non-reproducible, and blind to non-manual setups. Positioning line locked as **D20**: *"Their mechanic stays home when the track has no signal. Ours rides in your pit box — free, unlimited, and it cites the page it learned from."*
3. **Steal three validated UX patterns** (cheap for us — our immutable-versions model produces them structurally): diff-on-duplicate with changed-field highlights + "vs" compare; starred settings; locked kit baseline with one-tap diff-vs-kit. → Built into the versioned-setups slice.
4. **Promotions in docs/03:** My Gear presets (validates B5/B10) → V1.1; their race log is the clumsy after-the-fact version of our conversational outcome loop — keep ours integrated at the moment of decision.
5. **Pricing:** they charge $4.99/mo with metered AI; we plan $3.99 with the advisor free/unlimited. Underpriced better offer — keep as the acquisition weapon.
