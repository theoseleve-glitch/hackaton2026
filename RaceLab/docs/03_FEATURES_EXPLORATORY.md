# 03 — Exploratory Features (PROPOSED, not committed)

> **Idea backlog.** Nothing in this file is promised. Produced by a 3-lens ideation fan-out (Strava-style social mechanics · racer lifecycle pain points · AI capabilities), deduplicated and rated. Each idea carries a **verdict** — my recommendation as decision-maker, open to challenge.
>
> **Verdicts:** 🔼 *Promote next* (strongest candidates for V1.5, right after launch) · ✅ *V2* (moat-building, needs V1 data/users) · 🕐 *V3/Later* · 🧊 *Park* (good idea, wrong time).
> **Effort:** S/M/L.

---

## ⭐ The Top 10 I'd promote first

| # | Idea | Why it's first | Effort |
|---|---|---|---|
| 1 | [A1] Setup Fork & Lineage | Turns sharing into a status game AND feeds the AI (which deviations work in which conditions). Biggest structural edge over So Dialed | M |
| 2 | [B1] Race Day Companion (change→result loop) | THE data flywheel: every race day yields labeled `(change, conditions, outcome)` triples nobody else has | L |
| 3 | [C1] Voice Pit Notes | Dirty hands + 10-min windows = typing fails. Voice → structured feedback tags makes the loop actually get used | M |
| 4 | [B2] Lap Import (MyLaps Speedhive / LiveRC) | Objective outcomes instead of vibes; unlocks leaderboards, rivals, analytics, verified setups — the Strava GPS-trace equivalent | L |
| 5 | [C2] Pre-Race Setup Proposal | "Open the app the night before, get a starting sheet from the forecast + your history" — the clearest single demo of condition-aware AI | M |
| 6 | [A2] Track Intel Network | Solves the traveling racer's #1 problem and creates non-race-day app opens; feeds AI condition models | M |
| 7 | [C3] Setup Delta Explain | Import a pro sheet → AI explains each difference vs yours and ranks which deltas matter *for your conditions/level*. Kills the #1 amateur mistake | M |
| 8 | [B3] Wrench Mode (run-count maintenance) | "Rebuild your diffs before Sunday" pushes = retention notifications users *want*; deepens garage lock-in | M |
| 9 | [A3] Season Wrapped | Cheapest viral surface; racers will post it to the Facebook groups where our next users live | S |
| 10 | [C4] Setup Sanity Scan | Pre-save coherence check ("soft springs + heavy bar fight each other", typo'd 45° camber). Cheap, builds AI trust daily | S |

---

## A — Social & community (Strava layer, beyond core sharing)

| ID | Idea | Description | Effort | Verdict |
|---|---|---|---|---|
| A1 | **Setup Fork & Lineage** ⭐ | Fork any shared setup onto your chassis; app tracks the diff and ancestry ("forked from Tessmann's Worlds sheet, 230 forks"). Fork counts = creator status; lineage data = AI gold. Needs a field-mapping layer for chassis-version mismatches (MP10→MP11) | M | 🔼 |
| A2 | **Track Intel Network** ⭐ | Every track gets a living page: surface, layout photos, grip evolution, crowdsourced condition reports ("watered this morning, blue groove by noon"), aggregated anonymized tire/setup stats ("78% of A-main finishers ran clay-compound pins"). Waze-for-grip + the traveling racer's best friend | M | 🔼 |
| A3 | **Season Wrapped** ⭐ | Shareable end-of-season card: laps turned, race days, A-mains, best finish, gallons of nitro / packs charged, most-raced track. Spotify-Wrapped virality into RC Facebook/Instagram groups | S | 🔼 |
| A4 | **Race Feed** | Auto-generated feed cards from results ("William — Q3 @ MRT, bumped from the B, best lap 34.2"). Zero-effort posting is what made Strava work; manual-only feeds become ghost towns → depends on B2 | M | ✅ (after B2) |
| A5 | **Props** | One-tap reactions, RC-flavored: "Dialed", "Send it", "Tough break" (half of nitro racing is mechanical carnage; commiseration is the pit's social glue) | S | ✅ (ships with A4) |
| A6 | **Lap Leaderboards** | Per-track/per-class boards from transponder data: fastest lap, fastest 5-min run, TQ history, with "layout generations" (tracks rebuild yearly). Strava segments, translated 1:1 | L | ✅ (after B2) |
| A7 | **Clubs & Series Standings** | Club spaces tied to a home track; admins publish race nights + points series (drop weeks, marshal bonuses…) replacing the whiteboard/Facebook post. B2B2C wedge: 1 admin = 40 racers onboarded | M–L | ✅ |
| A8 | **Rivals** | Auto-detected head-to-head vs drivers repeatedly in your heats: qual-gap trend, "you've beaten Marc 4 of the last 6 mains". Club racing IS rivalry; keep it friendly + opt-out | M | ✅ (after B2) |
| A9 | **Pro Setup Drops** | Verified factory-driver accounts publish event setups as followable drops (pros already post JPEGs on Instagram — give them structure + audience). Sponsor/BD revenue line; solves social cold-start | M + BD | ✅ |
| A10 | **Monthly Challenges** | "Race 3 club nights", "Make an A-main", consistency challenges (20 laps within 2% std-dev — consistency wins club races). Badges | M | 🕐 |
| A11 | **Track Passport** | Map + badges of every track raced (10 tracks, 3 regions, raced a Worlds venue…). Racers collect tracks like climbers collect summits | S | 🕐 |
| A12 | **Bump-Up Progression** | Long-term chart: B→A-main rate, qual trend, gap-to-TQ. The emotional core of club racing made visible; frame around PBs to avoid demotivating plateaus | S | 🕐 |
| A13 | **Event Boards** | Big-race hubs (entry lists, who's going, pit-space/carpool threads). Must beat the existing Facebook event groups via entry-list integration or skip | M | 🕐 |
| A14 | **Heat-Tagged Media** | Photos/videos at a race auto-tag to event/heat/drivers (parents film everything); tagged-photo notifications = classic growth loop. Storage cost + tagging UX risk | M | 🕐 |
| A15 | **Marshal Karma** | Opt-in club tool: marshal check-ins earn visible karma. Solves a real club pain (no-shows) but must never feel like surveillance | S | 🧊 |
| A16 | **Newbie ↔ Wrench-Buddy Matching** | Opt-in pairing of new racers with club veterans for first-race-day help. Fights the hobby's brutal newbie churn; keep it a badge + intro ping, not a program | S | 🧊 |

## B — Race-day & lifecycle tools (utility layer)

| ID | Idea | Description | Effort | Verdict |
|---|---|---|---|---|
| B1 | **Race Day Companion (change→result loop)** ⭐ | Between heats: log a change in ≤2 taps/10s; next heat's laps auto-attach to it; instant verdict ("consistency +1.8% after the diff change as grip came up"). The killer retention loop and the moat's data source. UX must survive pit chaos | L | 🔼 |
| B2 | **Lap Import — MyLaps Speedhive / LiveRC** ⭐ | Link transponder number → auto-pull heats, results, per-lap times. Foundation for A4/A6/A8, analytics, verified setups. Risks: Speedhive API rate limits; LiveRC has no public API (scraping/ToS question — investigate early) | L | 🔼 |
| B3 | **Wrench Mode** ⭐ | Per-component run counters (shocks, diffs, clutch, engine bearings) auto-incremented per logged run; rebuild thresholds → "rebuild diffs before Saturday" push; guided rebuild log (oils, pistons, shims) | M | 🔼 |
| B4 | **Between-Heat Thrash Copilot** | Heat-schedule-aware countdown + thrash checklist + marshal-duty reminder + one-tap "what changed". Pairs naturally with B1/C5 | M | ✅ |
| B5 | **Tire Program Tracker** | Tire-set inventory (compound, insert, glue date, runs, wear) linked to runs/conditions; "your best Q runs on this clay were always M4 closed-cell". Tire choice is the most-asked question in offroad | M | ✅ |
| B6 | **Nitro Needle Logbook + Density-Altitude Assistant** | Log needle positions/plug/shims with auto weather; compute density altitude, suggest richen/lean *within hard safety bounds*; flameout symptom diagnoser. Nitro 1/8 racers are the highest-spend segment | M | ✅ |
| B7 | **Fuel Mileage & Pit-Window Calculator** | Measure run time per tank → main-event pit plan ("pit laps 9/18/27, 30s margin"). Table stakes (So Dialed has calculators) but cheap | S | ✅ |
| B8 | **LiPo Fleet Manager** | Per-pack profiles (cycles, IR per cell, punch-fade flags, storage-charge reminders, "best pack for the main") | M | 🕐 |
| B9 | **Gearing/Rollout Calculator + Temp Guard** | FDR calculator with motor-temp log per run; "12° hotter than safe — drop a tooth". Electric counterpart of B6 | S | ✅ |
| B10 | **ESC/Radio Profile Vault** | Store ESC (drag brake, punch, timing) + transmitter (EPA, expo) profiles with the sheet; shared setups include electronics, not just suspension | S | 🔼 (cheap — fold into core schema now) |
| B11 | **Tech Inspection Self-Check** | Class rules library (ROAR/EFRA/club: min weight, widths, handout tires, sauce bans) + pre-tech checklist; clubs publish local rules | M | 🕐 |
| B12 | **Race-Day Packing List** | Auto checklist from chassis type (nitro vs electric kits differ) + "did you charge TX/RX/starter box" pre-departure ping | S | 🕐 |
| B13 | **Engine Hour Meter & Resale Log** | Per-engine runtime/plug/rebuild provenance; exportable report for selling used engines (real resale-value impact) | S | 🕐 |
| B14 | **Engine Break-In Guide** | Timer-driven guided break-in (rich heat cycles, temp targets) with permanent record on the engine profile. Beginner-saving, nitro-only | S | 🕐 |
| B15 | **Qualifying Format Helper** | Per-event format awareness ("rocket round: only your best run counts — send it" / live "what you need in Q3" math) | S | 🕐 |
| B16 | **Paper/PDF Setup OCR Import** | Photo a manufacturer sheet (or a So Dialed PDF export…) → vision-extracted into a structured digital sheet. Kills the retyping barrier AND is our competitor-migration ramp | L | ✅ (strategic) |
| B17 | **Club Hub (owner portal)** | Lightweight club page: announcements, entries, track-condition posts, push to followers. The full version of A7's B2B2C wedge | L | ✅ (with A7) |

## C — AI Race Engineer extensions (beyond the core spec)

| ID | Idea | Description | Effort | Verdict |
|---|---|---|---|---|
| C1 | **Voice Pit Notes** ⭐ | Push-to-talk 30s rant → STT → structured feedback tags feeding the engineer. Built for fuel-covered hands | M | 🔼 |
| C2 | **Pre-Race Setup Proposal** ⭐ | Track + date → forecast + surface profile + your history → starting setup as a *delta sheet* vs your last sheet there, every line citing its KB rule | M | 🔼 |
| C3 | **Setup Delta Explain** ⭐ | On import/fork: AI explains each difference in cause→effect terms and ranks which 2–3 deltas matter for your conditions and level, with a one-change-at-a-time adoption plan | M | 🔼 |
| C4 | **Setup Sanity Scan** ⭐ | Pre-save coherence check: contradictory combinations, physically suspect values. Rule-based over the KB; LLM only writes the explanation | S | 🔼 |
| C5 | **Race-Day Engineer Mode** | Knows your heat schedule + the clock; filters advice by available wrench time ("Round 3 in 25 min — diff change won't fit; sway bar is 8 min, do that"). Requires time-cost metadata per change type | M | ✅ |
| C6 | **Post-Session Debrief (shareable card)** | Auto-composed: changes made, what you said, what the laps showed, verdict, next thing to try. Feed content + viral surface + the learning loop made visible | S–M | ✅ |
| C7 | **Tire Wear Vision** | Photo of a worn tire → wear-pattern classification (coning, graining, ballooning) → camber/compound/insert advice with annotated photo. Zero competitor equivalent; needs a labeled image set (collect from community early!) | L | ✅ |
| C8 | **Per-Driver Style Model** | Learning loop aggregated into a profile: rotation-hungry vs stability-seeking, skill tier from lap consistency; recommendations re-ranked accordingly. Preference data + re-ranking, not heavy ML | M | ✅ |
| C9 | **Fleet Learning — "what's working here this weekend"** | Anonymized cross-user signal: "softer front springs rated better by 7/9 drivers here today". THE network-effect moat; flagship Pro feature. Needs user density + privacy-safe aggregation with minimum-sample gating | L | ✅ (V2 flagship) |
| C10 | **A/B Practice-Day Planner** | "I have 6 runs" → ordered one-variable-per-run test plan; end-of-day personal findings appended to your profile. Turns practice from vibes into data | M | ✅ |
| C11 | **Crash Part Triage** | Photo of broken part → part ID + part number for your chassis + spares list (affiliate revenue) + setup-cause flags ("bent hinge pins twice = too much droop") | M–L | 🕐 |
| C12 | **Wrench Checklist Generation** | Accepted recommendation → chassis-specific steps, needed parts/oils, time estimate. Feeds C5's time filter | S | ✅ |
| C13 | **Plug/Temp Nitro Assist** | Glow-plug photo + temp-gun reading → rich/lean diagnosis bounded by hard safety limits (audio-based rich/lean detection = research, later) | M (photo) / L (audio) | 🕐 |
| C14 | **Pro Setup Explainer Packs** | Partner content: pro sheets sold/sponsored *with AI explanation rights* (C3 applied to premium content). The sheet is free everywhere — the explanation is the product | S tech + BD | 🕐 |

## D — Moonshots (park, revisit when big)

| ID | Idea | Note |
|---|---|---|
| D1 | **Onboard telemetry** (gyro/RPM/temp logger plugged into the receiver) | Hardware play; the "Strava recorded ride" of RC. Huge, not now |
| D2 | **Video line analysis** (phone on a tripod at the driver stand → AI compares your line/apexes vs the fast guys) | Computer vision heavy; differentiating someday |
| D3 | **Setup marketplace** (paid setups from pros with rev-share) | Needs C14 + big audience first |
| D4 | **Manufacturer insights dashboards** (anonymized aggregate: what springs people actually run) | B2B revenue; only valuable at scale, privacy-sensitive |

---

## The 3 failure modes that would kill us (from the AI-lens review — design constraints, not features)

1. **A recommendation ruins someone's race weekend.** → Practice vs Race-Day modes; race day = high-confidence + fast-reversible only; every rec states reversal cost; below the confidence bar the engineer says *"stick with what you have"* — knowing when to say nothing is what real race engineers do.
2. **Hallucinated/dangerous mechanical advice** (over-lean nitro = dead $400 engine). → LLM never emits raw numbers for safety-critical settings; deterministic bounds-checker keyed to the engine/chassis DB; mandatory temp reading before any lean suggestion; visible refusal outside the KB. Architectural layer, not a prompt instruction.
3. **"ChatGPT in a trench coat"** — generic advice during cold start, indistinguishable from So Dialed. → Condition context mandatory and *echoed back* in every answer; citations always visible; KB seeded from pro sheets/team tuning guides so day-one answers are specific; learning surfaced visibly as it accrues ("based on your 12 logged runs here").
