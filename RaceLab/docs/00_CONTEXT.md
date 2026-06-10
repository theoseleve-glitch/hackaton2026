# 00 — Context

> Everything you need to know to contribute to RaceLab without having been in the early conversations. If a decision isn't logged here, it hasn't been made.

## 1. What is RaceLab

A mobile app for RC car racers (1/8 nitro & e-buggy, 1/10 offroad, onroad…) built around four pillars, in this order:

1. **Save setups** — digital setup sheets per chassis, versioned, with photos.
2. **Comment setups** — notes/commentary attached to every sheet and every change ("worked great once the track grooved up").
3. **AI Race Engineer** — a chatbot that tells you *which component to change or modification to try*, aware of the track you're on, the weather, the surface type, and your driver feedback. Grounded on a curated tuning knowledge base — not generic LLM chat.
4. **Share** — publish your setups, browse and fork others', follow fast drivers. **"The Strava of RC."**

Artistic direction / visual identity: **already done** (William).

## 2. The team

| Who | Owns |
|---|---|
| **William** | Product direction, design/DA, chassis template content, tuning knowledge base, AI prompt design & evals, monetization, community |
| **Théo** | Architecture, mobile app, backend, sync/offline, AI pipeline integration, store releases |
| **Claude (AI pair)** | Decision support, doc upkeep, implementation. Used in-session with subagent fan-outs; during build phase, parallel terminals with strict area ownership (see §6) |

## 3. Competitor teardown — So Dialed

The incumbent ([sodialed.com](https://www.sodialed.com/), iOS + Android). What they have — **don't underestimate them**:

- Setup recording for **600+ cars** (1/5 to 1/28 scale: offroad, onroad, oval, drift, drag), kit setups preloaded for 60+ popular buggies (Associated, TLR, Tekno, Schumacher, Kyosho, XRAY…)
- An **"AI Mechanic"** chat that knows your entered setup, kit defaults, and common community values
- Race log, public/private setup sharing, gear/speed-run/fuel calculators, export to manufacturer PDF layouts
- Freemium: free for casual use; **$2.99/mo or $29.99/yr** for unlimited cars/setups/AI

Their structural weaknesses (= our attack surface):

| Weakness | Why it matters |
|---|---|
| AI has **no condition context** (no weather, no surface, no grip evolution) | Real tuning decisions are 80% conditions |
| AI has **no learning loop** — it never finds out if its advice worked | Generic advice forever; ours compounds |
| **No real social layer** — sharing is a flat public/private flag | No feed, no following, no forks, no track communities → no network effect |
| Race log is **after-the-fact data entry**, not a race-day companion | The between-heats moment is where racers actually need help |
| No setup **diffing/lineage** | Comparing two sheets = eyeballing two PDFs |
| 600-car breadth = shallow everywhere | We go deep on 1/8 + 1/10 offroad first |

**Action item (William):** install So Dialed Premium, feed its AI Mechanic 5 real tuning scenarios, save its answers — that's the benchmark our engineer must visibly beat.

## 4. Decisions log

| # | Decision | Rationale | Date |
|---|---|---|---|
| D1 | Name: **RaceLab** | "Lab" = the experiment/learn loop. ⚠️ Pending trademark & app-store collision check before launch branding | 2026-06-10 |
| D2 | Positioning: **"Strava of RC"** — utility (setup storage + AI) wrapped in a social/progress layer | Utility gets installs; social keeps them | 2026-06-10 |
| D3 | Launch scope: **1/8 & 1/10 offroad first** (~15–20 chassis), not 600 cars | Quality > breadth; it's where we race and can validate | 2026-06-10 |
| D4 | **Offline-first is a hard requirement** | RC tracks have terrible connectivity; only the AI call may require network | 2026-06-10 |
| D5 | Setup sheets are **schema-driven JSON** (one template per chassis) | New chassis = new data file, no code | 2026-06-10 |
| D6 | AI is **KB-grounded (RAG), one-change-at-a-time, with a learning loop** — never freeform LLM advice | Trust is the product; see `04_AI_RACE_ENGINEER_SPEC.md` | 2026-06-10 |
| D7 | Concept phase: single-session work with AI subagent fan-outs. Build phase: parallel terminals **with area ownership + contracts-first + git as sync** (no "terminals watching each other") | Coherence now, parallelism later | 2026-06-10 |
| D8 | Core vs exploratory features kept in **two separate files** (`02` vs `03`); promotion requires a logged team decision | Keeps committed scope honest | 2026-06-10 |
| D9 | Monetization: freemium, AI + advanced analytics behind Pro (~$3.99/mo / $34.99/yr) | Match So Dialed's price point, win on value; AI tokens are our main cost | 2026-06-10 |
| D10 | **V1.0 social = unlisted share link + fork/import only.** Share link = static page embedding the rendered sheet (PDF/PNG from Blob), install CTA — no public API, no web app. Profiles, follows, props, comments, public discovery → V1.1+ | Adversarial review: the social spec was 3–4 engineer-weeks hiding in a 1-week roadmap slot; comments also trigger Apple UGC guideline 1.2 (filtering + report + **block**) | 2026-06-10 |
| D11 | **No bidirectional sync in V1.** Local SQLite is the only source of truth; append-only outbox → cloud backup when online; restore on fresh install; publishing creates a server-side snapshot at publish time. Real sync = V2 (first true multi-reader case is team accounts) | A racer has one phone; setups are immutable versions → no conflicts structurally exist. Kills the riskiest 2–3 week engineering item | 2026-06-10 |
| D12 | **PDF export = fill, never redraw.** Manufacturer blanks with AcroForm fields (MP11 verified: 51 text + 49 checkbox fields) get a `pdf_map` field-name mapping; flat blanks get coordinate overlay-stamping on the original PDF. Two renderers built once; per-chassis work = data entry. Generic RaceLab layout as fallback. Generated server-side | "Pixel-faithful by construction" in days instead of weeks per layout | 2026-06-10 |
| D13 | **V1 AI = chassis tuning only.** Engine/needle questions get a hard canned refusal until a per-engine safe-range DB exists (V2, with idea B6). Guard layer = validate proposed values against the chassis template's enums/ranges. Retrieval = deterministic filter over the YAML KB (no vector store/embeddings — ~80 rules fit a prompt). **KB ships on-device**: offline = deterministic tag→rule templated card ($0, no signal needed); LLM adds prose/arbitration when online, requests queue otherwise | The needle guard was specced against an engine DB that doesn't exist; the flagship feature must not die at no-signal tracks | 2026-06-10 |
| D14 | Content targets cut: **6–8 launch chassis** (the ones our clubs race), **~80 KB rules** (1/8 offroad first), **25-scenario eval set** + 5 out-of-KB traps. Templates AI-extracted from PDFs (the MP11 pipeline), William reviews instead of authors | William's content load was ~12–16 weeks scheduled into 10; D3 "quality > breadth" applies to 8 as well as 20 | 2026-06-10 |
| D15 | **AI-first ordering.** Weeks 1–2: throwaway AI prototype (MP11 template + first 30 KB rules + hardcoded context → Claude structured output) benchmarked against So Dialed's AI Mechanic on 5 real scenarios. Week 3: hard-coded MP11-only, local-only, no-auth MVP at a real practice day. Generalize (schema renderer, more chassis, auth) only after both gates pass | The entire bet is "our AI visibly beats theirs" — validate it in week 2, not week 7. End of week 1 = velocity calibration gate: re-cut the plan against Théo's observed throughput; pre-agreed cut order = social → faithful PDFs → payments | 2026-06-10 |
| D16 | **Launch free.** AI capped at 5 recs/month server-side (metering already needed for cost control). Pro subscription (RevenueCat) ships in V1.1, ~2 weeks post-launch | IAP is a top store-rejection source; payments in the launch window buy risk, not revenue (zero day-one subscribers) | 2026-06-10 |
| D17 | Store logistics start **week 1**: Apple + Google developer accounts created; Google Play closed test (12+ testers, 14 continuous days — mandatory for new accounts) running from week 4; in-app account deletion (Apple 5.1.1(v)), privacy policy, Play data-safety form scheduled in Phase 2, not Phase 3. i18n library wired from the first screen (strings externalized, EN shipped; AI output language = user locale via prompt; KB stays EN) | Store lead times are 3–5 weeks of silent slip if discovered at week 9 | 2026-06-10 |

*(Add new rows here. Théo: anything you want to challenge, challenge before code exists — it's cheap now.)*

> ⚠️ **D1 escalation (name):** an established sim-racing telemetry product already operates as **RaceLab (racelab.app)** — same name, adjacent racing category. The name check is now a **this-week blocker**: clear it or pick the backup name *before* any further branding/store-asset work.

## 5. Prior art we own

- **SETUP_RC** (separate project, `hackaton2026/SETUP_RC`): generates Kyosho Inferno MP11 setup-sheet PDFs with AI grounded on a *nomenclature knowledge base*. **Reuse:** the MP11 nomenclature/KB work seeds RaceLab's chassis templates and tuning KB; the PDF generation experience seeds the export pipeline.

## 6. How we work (build phase)

1. **Contracts first.** `packages/schema` (data model + API types + chassis template format) is written and agreed before splitting.
2. **Area ownership.** One person/terminal = one area (`apps/mobile`, `apps/api`, `packages/kb`…). Nobody edits outside their area.
3. **Git is the sync medium.** Own branch/worktree, small commits, frequent merges. Need to know the state of someone's work? Pull. Never read uncommitted sibling files.
4. **Docs are the source of truth.** Scope disagreements get resolved in `02`/`03` + the Decisions log, not in code comments.

## 7. Glossary (RC racing terms used across the docs)

| Term | Meaning |
|---|---|
| **Setup sheet** | The full record of a car's tunable settings (suspension, diffs, tires, gearing…). Manufacturers publish blank sheets per chassis |
| **1/8, 1/10** | Scale classes. 1/8 offroad = nitro buggy, e-buggy, truggy. 1/10 offroad = 2WD/4WD buggy, stadium truck, SC |
| **Diff oil (F/C/R)** | Silicone oil viscosity in front/center/rear differentials (e.g. 7000/10000/5000 cSt) — major handling lever |
| **Shock oil / pistons / springs** | Damper tuning trio; controls how the car absorbs bumps and transfers weight |
| **Camber / toe / droop / ride height** | Geometry settings, measured in degrees/mm |
| **Blue groove** | High-grip rubbered-in line that forms on dirt as a race day progresses; grip evolves hour-by-hour |
| **TQ** | Top Qualifier — fastest in qualifying |
| **A-main / B-main** | Finals, ranked. "Bumping up" = winning the B to start the A. The emotional core of club racing |
| **Heat / round** | A qualifying run group. Between your heats you have 10–40 min to wrench ("the thrash") |
| **Marshaling** | After your heat you flip crashed cars back over for the next heat. Mandatory club duty |
| **Transponder** | Personal timing chip; lap times go through MyLaps/Speedhive; live results often on LiveRC |
| **HSN/LSN** | High/low-speed needles on a nitro carb — engine tune. Too lean = destroyed engine |
| **Traction compound / sauce** | Tire additive; legal at some tracks, banned at others |
| **Rocket round / IFMAR points** | Qualifying formats: best-single-run vs points-per-round |
| **Tech inspection** | Pre/post-race legality check (weight, width, tires…) — failing = DQ |
