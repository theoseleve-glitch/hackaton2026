# RaceLab — Full Context File (single-file brief)

> Consolidated from `README.md`, `DEV_PLAN.md`, and `docs/00–05` (branch `william/racelab`, 2026-06-10).
> Purpose: one file with everything needed to evaluate existing code (e.g. LapCoach/telemetry projects) for reuse and to start building.

---

## 1. What is RaceLab

**"The Strava of RC racing."** A mobile app for RC car racers (1/8 nitro & e-buggy, 1/10 offroad first) built around four pillars, in priority order:

1. **Save setups** — digital setup sheets per chassis, versioned, with photos.
2. **Comment setups** — notes attached to every sheet and every change.
3. **AI Race Engineer** — KB-grounded advisor that recommends ONE change, aware of track, surface, weather, grip, driver feedback, and the driver's history.
4. **Share** — publish setups with conditions + results, fork others' setups with lineage, follow drivers.

**Elevator pitch:** *"So Dialed tells you what a setting does. RaceLab tells you what to change right now, on this track, in this weather, based on what worked for you last time — and learns from every run."*

**Team:** William (product, design/DA ✅ done, chassis templates content, tuning KB, AI prompts/evals, monetization, community) · Théo (architecture, mobile, backend, sync/offline, AI pipeline, store releases).

**Status:** concept phase, docs complete, **no code yet**.

---

## 2. The core loop (this IS the product)

```
RACE/PRACTICE (laps + conditions captured)
  → LOG (setup attached to run, feedback tags "pushes mid-corner", comments, photos)
  → AI ENGINEER (one grounded change to try, with the why)
  → RESULT (better/same/worse → AI learns YOU on THIS track)
  → SHARE (setup published with results; others fork/prop/comment it)
  → back to top
```

Every logged run produces a labeled `(setup change, conditions, outcome)` triple — the data moat no competitor collects.

**North-star metric:** closed loops per week (runs logged with a setup attached AND an outcome rating).

---

## 3. Competitor — So Dialed (sodialed.com)

The incumbent. Has: 600+ car setup recording, kit setups preloaded, "AI Mechanic" chat, race log, sharing (flat public/private flag), calculators, PDF export. Freemium $2.99/mo / $29.99/yr.

**Their weaknesses = our attack surface:**
- AI has no condition context (no weather/surface/grip) and no learning loop
- No real social layer (no feed, follows, forks, track communities)
- Race log is after-the-fact data entry, not a race-day companion
- No setup diffing/lineage
- 600-car breadth = shallow everywhere; we go deep on 1/8 + 1/10 offroad

---

## 4. Locked decisions (D1–D9)

| # | Decision |
|---|---|
| D1 | Name: **RaceLab** (trademark/app-store collision check pending) |
| D2 | Positioning: "Strava of RC" — utility wrapped in a social/progress layer |
| D3 | Launch scope: 1/8 & 1/10 offroad, ~15–20 chassis (not 600) |
| D4 | **Offline-first is a hard requirement** — only the AI call and social may need network |
| D5 | Setup sheets are **schema-driven JSON** — one template per chassis; new chassis = data file, no code |
| D6 | AI is **KB-grounded RAG, one-change-at-a-time, learning loop** — never freeform LLM advice |
| D7 | Build phase: parallel work with strict area ownership, contracts-first, git as sync medium |
| D8 | Core scope (`02`) vs exploratory ideas (`03`) kept strictly separate; promotion = logged team decision |
| D9 | Monetization: freemium; AI + advanced analytics behind Pro ~$3.99/mo / $34.99/yr |

---

## 5. Committed feature scope

### MVP (internal build, ~4 weeks)
- Auth (email + Apple/Google)
- **Garage**: cars from chassis template catalog (Kyosho MP10/MP11, Associated RC8B4/B7, TLR 8IGHT-X/22 5.0, Tekno NB48/EB48 2.1, Mugen MBX8R, Xray XB8/XB4, Sworkz… ~15–20). Each template ships with the manufacturer kit setup preloaded.
- **Setup sheets**: schema-driven editor. Sections: suspension (springs, oil, pistons, camber, toe, ride height, droop, sway bars, shock positions), diffs (F/C/R oil), tires (compound, insert, wheel, glue/sauce), gearing (pinion/spur or clutch bell), wing/body, ackermann/steering, electronics (ESC) or engine (needles, plug, shims).
- Setup CRUD: create, duplicate ("start from Q2 sheet"), rename, archive, photos. **Every save is a version** — browsable timeline (powers diffing + AI history; not optional polish).
- Free-text commentary on every sheet and every change; timestamped, searchable, fed to the AI.
- **Track database**: name, GPS, surface (clay / hard-packed / loam / astro / carpet / grass), indoor/outdoor, photos, notes.
- **Offline-first** for all of the above.

### V1 (public store launch, ~8–10 weeks)
- **AI Race Engineer** (see §7)
- **Session mode**: session = race day/practice at a track. Timeline of runs (practice/qualifier/main), each run linked to the exact setup version. Per run: lap times/result (manual entry in V1), feedback tags + free text. Weather auto-captured (Open-Meteo) + manual grip level (green/medium/high/blue groove) and track temp.
- **Setup diff**: side-by-side, only changed params highlighted, git-style; each diff line can carry a comment.
- **PDF export** on the manufacturer's blank sheet layout (pixel-faithful).
- **Sharing/social** (see §8)
- Subscriptions via RevenueCat. Free: 2 cars, 10 setups, 5 AI recs/month, last-3-versions diff. Pro: unlimited everything.
- iOS + Android, EN first, FR fast-follow.

### Explicitly OUT of V1 scope
600-chassis coverage · live timing import (MyLaps/LiveRC — manual laps in V1) · feed/clubs/leaderboards/challenges · voice input, photo-based AI · onroad tuning depth · web app (share links open a read-only web view only).

### V1 Definition of Done
Create car → load kit setup → drive to a no-signal track → start session → log run with laps + "pushes mid-corner" → (network) get one grounded recommendation → apply, comment → mark "better" → back home, publish the setup, a friend forks it. PDF export matches the manufacturer sheet. Both stores, subscriptions live.

---

## 6. Data model (core entities)

```
User ──< Car (chassis_template_id, name, photo)
Car ──< Setup (versioned; structured JSON matching the chassis template schema)
Setup ──< SetupChange (diff vs parent — enables timeline & diffing)
Track (name, gps, surface, indoor, notes)
Session (user, track, date, weather_snapshot) ──< Run
Run (session, setup_id, type: practice/qual/main, lap_times, result, feedback_tags[], feedback_text)
Recommendation (run_id, input_snapshot, advice, kb_rules_used[], outcome: better/same/worse)
ChassisTemplate (brand, model, scale, class, sheet schema + PDF layout)
KBRule (setting, direction, effects[], conditions, confidence, source)
```

Social additions: fork lineage is a DAG on setup *versions* (`forked_from_version_id`), tombstones not hard deletes (GDPR + survives renames). Public/private split planned at the API layer day one (public web view served without auth). Public aggregates gated on n ≥ 8 (small clubs are deanonymizable).

---

## 7. AI Race Engineer (differentiator #1)

Mantra: **grounded or silent, one change at a time, learns from every run.**

**Inputs (auto-assembled context bundle):** active sheet + version history + user's own comments · track (surface, grip level, temp) · weather (Open-Meteo live + race-window forecast) · driver feedback tags + free text · history of `(change, conditions, outcome)` triples for this driver/track · skill signal.

**Feedback tag taxonomy** = (symptom, phase[, evolution]):
- Symptom: understeer/push · oversteer/loose · bouncy · bottoming · traction roll · unstable braking · no forward bite · sluggish steering
- Phase: corner entry · mid · exit · on power · off power · braking · jumps/landing · rough sections
- Evolution: from lap 1 · as tires heat up · as track grips up · only when pushing

**Tuning KB** (William's main content job, ~150 rules for V1, versioned in-repo as data): cause→effect rules with effects, amplifying/reducing conditions, counter-indications, magnitude guidance, reversal cost in minutes, confidence (high/medium/low), sources, chassis scope. Seeded from the SETUP_RC MP11 nomenclature work + manufacturer/team tuning guides.

**Pipeline:** context bundle → deterministic symptom mapping (tags → KB nodes) → retrieval (rules × symptom × conditions × chassis) → Claude with structured output, reasoning over ONLY retrieved rules → **deterministic guard layer**: numeric bounds per setting per chassis; safety-critical settings (nitro needles!) — LLM may say direction, never an out-of-range number; lean advice requires a temp reading; race-day mode rejects low-confidence/slow-to-reverse advice → rendered with citations + confidence + revert info → outcome captured on next run. LLM cannot cite a non-retrieved rule (validated). Empty retrieval → honest refusal. All AI calls server-side (key security, metering).

**Output contract (schema-enforced):** exactly ONE primary change (+ ≤2 ranked alternatives), each with: setting, change amount, mechanism (why), expected effect, confidence, KB citations, revert cost, "if this doesn't help, the cause is probably X". `do_nothing_option` replaces everything when confidence is insufficient on race day.

**Modes:** Practice (exploratory, medium confidence OK) vs Race-day (high-confidence, fast-reversible only; "stick with what you have" is a valid answer).

**Eval gate before launch:** 50 real scenarios with known-good expert answers; ≥80% expert-rated helpful/neutral, 0 dangerous outputs, 100% citation validity, refusals trigger on all out-of-KB traps; must visibly beat So Dialed's AI Mechanic AND vanilla ChatGPT on the same set; re-run in CI on every KB/prompt/model change.

**Cost:** Sonnet-tier via AI Gateway, ≪ $0.02/rec → Pro is margin-positive; free tier metered server-side at 5/month.

**The 3 failure modes (design constraints):**
1. A rec ruins someone's race weekend → race-day mode, reversal cost shown, "stick with what you have" below confidence bar.
2. Hallucinated dangerous advice (over-lean nitro = dead $400 engine) → deterministic bounds layer, not a prompt instruction.
3. "ChatGPT in a trench coat" → condition context echoed back in every answer, citations always visible, KB-specific day-one answers, learning surfaced visibly.

---

## 8. Social layer (differentiator #2)

V1 is deliberately lean — utility first, social wraps utility:

- **Publish**: private (default) / unlisted link / public. Published setup carries context: chassis, class, track, surface, grip, weather snapshot, date, comments, attached results when available. **Embargo option** ("publish after the event" — respect racer culture). Share link = read-only web page with install CTA (the only web surface in V1).
- **Browse & fork**: filter by chassis → track → conditions → popularity. Import = fork with provenance; app immediately shows diff vs your current sheet. Cross-version forks (MP10→MP11) blocked in V1 with a clear message.
- **Profiles & follows**: avatar, home track, classes, garage, shared setups, race history. Only 2 notification types in V1: *followed driver published a setup for a chassis you own* · *someone forked/commented your setup*.
- **Props & comments**: threaded comments on shared setups; RC-native reactions: **Dialed 🔧 · Send it 🚀 · Tough break 💥**. Moderation = report button + author delete + admin tools.

**Growth model:** share-link pages → Season Wrapped cards → club wedge (one admin onboards 40 racers) → pro setup drops → timing-data network effects. **Cold start:** seed kit baselines + our own raced setups, launch dense in French offroad clubs, recruit 5–10 fast locals as founding creators (free Pro for life).

---

## 9. Exploratory backlog (NOT committed — top 10 by priority)

1. **A1 Setup Fork & Lineage** (fork ancestry, fork counts = creator status)
2. **B1 Race Day Companion** (≤2-tap change logging between heats; change→result verdicts) — THE data flywheel
3. **C1 Voice Pit Notes** (push-to-talk → STT → feedback tags; dirty hands)
4. **B2 Lap Import** (MyLaps Speedhive / LiveRC; unlocks leaderboards/rivals/verified setups; API/ToS risk — investigate early)
5. **C2 Pre-Race Setup Proposal** (night-before delta sheet from forecast + history)
6. **A2 Track Intel Network** (living track pages, crowdsourced condition reports)
7. **C3 Setup Delta Explain** (AI explains a fork's diffs, ranks which matter for you)
8. **B3 Wrench Mode** (per-component run counters → rebuild reminders)
9. **A3 Season Wrapped** (shareable end-of-season card, viral surface)
10. **C4 Setup Sanity Scan** (pre-save coherence check, rule-based over KB)

Also notable: B16 paper/PDF setup OCR import (competitor-migration ramp) · C9 fleet learning "what's working here this weekend" (V2 flagship, network-effect moat) · C7 tire wear vision · B6 nitro needle logbook + density-altitude assistant. Moonshots parked: onboard telemetry hardware, video line analysis, setup marketplace, manufacturer dashboards.

---

## 10. Tech stack (recommended — open to challenge before code exists)

| Layer | Choice | Notes |
|---|---|---|
| Mobile | **Expo (React Native) + TypeScript** | One codebase, EAS builds. *(Alternative on the table: team has Flutter/Supabase experience from RouteCore)* |
| Local data | **expo-sqlite + sync layer** (Drizzle + custom, or PowerSync) | Offline-first; local DB is source of truth. Riskiest piece — spike first |
| Backend | **Next.js (App Router) on Vercel** | Zero-ops, crons, AI SDK story |
| DB | **Neon Postgres** | Serverless, branchable. *(Supabase considered fine too)* |
| Auth | **Clerk** | Apple/Google/email in a day |
| AI | **Claude (Sonnet-tier) via Vercel AI SDK / AI Gateway** | Structured output, RAG over KB |
| Weather | **Open-Meteo** | Free, no key |
| Payments | **RevenueCat** | Cross-platform subscriptions |
| Files | **Vercel Blob** | Photos, PDFs |
| Analytics | PostHog + Sentry | |

Monorepo plan: `apps/mobile` · `apps/api` · `packages/schema` (data model + API types + chassis template format — written and agreed FIRST) · `packages/kb`.

---

## 11. Roadmap & gates

- **Phase 0 (wk 1)**: identity/design (W) · repo scaffold, offline/sync spike, schema-driven sheet renderer PoC (T)
- **Phase 1 MVP (wk 2–4)**: 15–20 chassis templates + KB start (W) · garage/setup/track CRUD, offline storage, auth, PDF export (T). **Gate: we use it ourselves at a real practice day.**
- **Phase 2 (wk 5–8)**: KB completion, prompt design, 50-scenario eval set, beta recruitment (W) · session mode, diff view, AI pipeline, sync hardening (T). **Gate: AI beats "ask ChatGPT" blind test, zero dangerous advice.**
- **Phase 3 launch (wk 9–10)**: store listings, pricing, demo videos (W) · subscriptions, gating, sharing, store submission (T). **Gate: 20 active beta users, crash-free > 99%.**

**Risks:** bad AI advice = credibility death (KB-grounding + evals) · offline sync hardness (spike week 1, use a local-first lib) · template treadmill (schema-driven = data) · 2-person bandwidth (hard gates, cut scope never AI quality) · So Dialed copies us (moat = learning-loop data + KB quality).

---

## 12. Prior art we own (reuse candidates)

- **SETUP_RC** (`hackaton2026/SETUP_RC` branch/project): Kyosho MP11 setup-sheet PDF generation with AI grounded on a nomenclature KB → seeds chassis templates, tuning KB, and the PDF export pipeline. The `MP11_EditableSetupSheet.pdf` in this folder is the reference sheet.
- Local machine projects potentially reusable: `LapCoachLogger_sessions`, `RaceLabApps`, telemetry loggers (VRS-TelemetryLogger) — to be evaluated for lap/session/timing code reuse.

---

## 13. Glossary (essentials)

**Setup sheet** = full record of a car's tunable settings · **1/8, 1/10** = scale classes · **Diff oil F/C/R** = silicone oil viscosity in differentials, major handling lever · **Blue groove** = high-grip line forming on dirt during the day · **TQ** = top qualifier · **A-main/B-main** = finals; "bumping up" = winning the B · **Heat** = qualifying run group; 10–40 min between heats to wrench · **Transponder** = personal timing chip (MyLaps/Speedhive, LiveRC) · **HSN/LSN** = nitro carb needles; too lean = destroyed engine · **Traction compound/sauce** = tire additive, track-legal or banned · **Tech inspection** = legality check, fail = DQ.
