# RaceLab — Development Plan

> ⚠️ **Read the concept docs first** — start at [`README.md`](README.md) → [`docs/`](docs/). This file covers *execution* (stack, roadmap, work split); product scope is defined in `docs/02_FEATURES_CORE.md` (committed) vs `docs/03_FEATURES_EXPLORATORY.md` (proposed). Where this file and the docs disagree, the docs win.

> **The AI race engineer for RC racing.** Store your setup sheets, tune trackside, and get condition-aware AI advice that actually understands your track, your weather, and your driving.

**Team:** 2 people — William (Product / Design / Content / AI knowledge / Monetization) + Dev partner (Architecture / Backend / Mobile engineering)

---

## 1. Vision & Positioning

RC racers (1/8 nitro & e-buggy, 1/10 offroad, onroad, etc.) manage setups today with paper sheets, PDFs, or the **So Dialed** app. So Dialed is the incumbent: setup recording for 600+ cars, kit setups preloaded, an "AI Mechanic", race logging, gear calculators, PDF export, freemium at $2.99/mo or $29.99/yr.

**RaceLab wins by being a race engineer, not a notebook.** So Dialed's AI gives generic advice on a static setup. RaceLab closes the loop:

```
Setup → Run → Driver feedback ("pushes mid-corner") + conditions (weather, surface, grip)
      → AI recommends ONE prioritized change with rationale
      → Next run → "Did it improve?" → AI learns what works for YOU on THIS track
```

That feedback loop — per-driver, per-track, per-conditions memory — is something no competitor has.

### Elevator pitch
*"So Dialed tells you what a setting does. RaceLab tells you what to change **right now**, on **this track**, in **this weather**, based on what worked for you last time — and learns from every run."*

---

## 2. Competitive Analysis — So Dialed

| Area | So Dialed (today) | RaceLab (our answer) |
|---|---|---|
| Setup storage | 600+ cars, manufacturer PDF export | Start with top ~20 popular 1/8 & 1/10 offroad chassis, pixel-perfect sheets, PDF export. Quality > quantity at launch. |
| AI | "AI Mechanic" — chat-style advice on your setup | **Condition-aware race engineer**: live weather API, surface/grip model, driver-feedback vocabulary, one-change-at-a-time discipline, post-run learning loop |
| Race day workflow | Race log (after the fact) | **Session mode**: live timeline of runs, quick-diff between setups, voice/quick-tag feedback between heats, works fully offline |
| Setup history | List of sheets | **Git-style diff & timeline**: see exactly what changed between Q2 and Q3 and what it did to your lap times |
| Track database | Basic | Track profiles: surface type, typical grip evolution through the day, community setups per track per condition |
| Community | Public/private setups | Same + "what the fast guys ran here last weekend in similar conditions" |
| Pricing | Free tier + $2.99/mo / $29.99/yr | Comparable freemium — undercut on value, not on price (see §9) |

**Weaknesses we exploit:** their AI has no condition context and no learning loop; race-day UX is built around data entry, not the practice/qualify/main rhythm; no setup diffing; no link between a change and its measured outcome.

---

## 3. Target Users

1. **Club racer (primary)** — races 2–4×/month, owns 1–3 cars, copies pro setups and doesn't fully understand tuning. Wants: "tell me what to change."
2. **Serious regional racer** — understands tuning, wants fast logging, diffs, history, and a sanity check from the AI.
3. **Beginner** — needs the kit setup, explanations of what each setting does, and confidence.

---

## 4. Feature Set

### MVP (v0.1 — internal, ~4 weeks)
- [ ] Auth (email + Apple/Google sign-in)
- [ ] Garage: add cars from a chassis template catalog (start: Kyosho MP10/MP11, Team Associated RC8B4/B7, TLR 8IGHT-X/22 5.0, Tekno NB48/EB48 2.1, Mugen MBX8R, Xray XB8, Sworkz — ~15–20 chassis)
- [ ] Digital setup sheet per chassis: suspension (springs, oil, pistons, camber, toe, ride height, droop, sway bars, shock positions), diffs (F/C/R oil), tires (compound, insert, wheel), gearing (pinion/spur or clutch bell), wing, ackermann, ESC/engine section
- [ ] Setup CRUD: duplicate, rename, notes, photos
- [ ] Track database: create track (name, GPS, surface type: clay / hard-packed dirt / astro / carpet / grass, indoor/outdoor)
- [ ] **Offline-first**: everything above works with zero connectivity (tracks have terrible signal — this is a hard requirement, not a nice-to-have)

### V1 — public launch (~8–10 weeks)
- [ ] **AI Race Engineer** (the differentiator — see §5)
- [ ] **Session mode**: race-day timeline (practice → qualifiers → mains), attach a setup to each run, log lap times / TQ / finish, quick driver-feedback tags (push-in / push-mid / push-exit, loose on power, bouncy in bumps, traction rolls…)
- [ ] **Setup diff**: side-by-side comparison of any two sheets with changes highlighted
- [ ] Weather auto-capture per session (Open-Meteo: temp, humidity, rain, wind) + manual track temp / grip level
- [ ] PDF export on the manufacturer's sheet layout
- [ ] Setup sharing (link + public/private), import a shared setup into your garage
- [ ] Subscriptions (RevenueCat) — free tier limits + Pro

### V2 — moat building (3–6 months)
- [ ] Community track pages: "setups run here, in these conditions"
- [ ] Improvement analytics: lap-time trend vs. setup changes ("your switch to 5.5wt front oil gained you 0.4s/lap at this track")
- [ ] Voice feedback between heats ("rear feels loose exiting the sweeper") → transcribed → fed to AI
- [ ] Gear/fuel/rollout calculators (table stakes, cheap to add)
- [ ] Wrenching checklists (pre-race maintenance per car, shock rebuild reminders by run count)
- [ ] Pro/team accounts: a team manager sees all drivers' setups

---

## 5. The AI Race Engineer (core differentiator)

### Inputs to every recommendation
1. **Current setup** (full structured sheet — not free text)
2. **Track**: surface type, layout notes, indoor/outdoor, current grip level (user-set: green / medium / high / blue groove)
3. **Weather**: live API + forecast for the race window (temp swings matter — a track at 9am ≠ same track at 3pm)
4. **Driver feedback**: structured tags + free text ("understeers on corner entry under braking")
5. **History**: what changes were made before on this track/conditions and whether they helped (the learning loop)

### Output contract (strict)
- **One primary change** + max 2 alternatives, ranked
- For each: what to change, by how much, **why** (mechanism), expected effect, and how to revert
- Confidence level + "if this doesn't work, the problem is probably X instead"
- Never recommend 5 changes at once — real race engineers change one thing at a time

### How we keep it grounded (no hallucinated advice)
- **Tuning knowledge base**: a structured cause→effect graph of RC tuning (e.g., "thicker front diff oil → more on-power steering, less off-power steering"), curated by William. **We already have a head start: the SETUP_RC nomenclature knowledge base (Kyosho Inferno MP11) gets generalized into this.**
- AI (Claude via API) is **grounded on this KB with RAG** — it reasons over our verified tuning facts, current conditions, and the user's history. It does not free-associate from training data.
- Every recommendation cites which KB rules it used → auditable, and the KB improves when advice is wrong.

### Learning loop
After each run: "Did the change help?" (better / same / worse + optional note). Stored as `(setup_delta, conditions, outcome)` tuples → injected into future prompts for this user/track → over time RaceLab knows *your* driving style and *your* track better than any generic app.

---

## 6. Data Model (core entities)

```
User ──< Car (chassis_template_id, name, photo)
Car ──< Setup (versioned; structured JSON matching the chassis template schema)
Setup ──< SetupChange (diff vs parent setup — enables timeline & diffing)
Track (name, gps, surface, indoor, notes)
Session (user, track, date, weather_snapshot) ──< Run
Run (session, setup_id, type: practice/qual/main, lap_times, result, feedback_tags[], feedback_text)
Recommendation (run_id, input_snapshot, advice, kb_rules_used[], outcome: better/same/worse)
ChassisTemplate (brand, model, scale, class, sheet schema + PDF layout)
KBRule (setting, direction, effects[], conditions, confidence, source)
```

Key decision: **setup sheets are schema-driven JSON**, one schema per chassis template. Adding a new chassis = adding a template file, no code.

---

## 7. Tech Stack (recommendation)

| Layer | Choice | Why |
|---|---|---|
| Mobile app | **Expo (React Native) + TypeScript** | One codebase → iOS + Android (So Dialed is on both; we must be too). Expo EAS handles builds/store submission. |
| Local data | **expo-sqlite + a sync layer** (e.g. Drizzle + custom sync, or PowerSync) | Offline-first is non-negotiable at tracks. Local DB is the source of truth; sync when online. |
| Backend | **Next.js (App Router) API on Vercel** | Zero-ops, fast to ship, easy cron (weather snapshots), good AI SDK story. |
| Database | **Neon Postgres** (Vercel Marketplace) | Serverless Postgres, branchable for dev. |
| Auth | **Clerk** | Apple/Google/email sign-in solved in a day. |
| AI | **Claude API (latest Sonnet-tier) via Vercel AI SDK / AI Gateway** | Best reasoning for the engineer persona; structured output for the recommendation contract; KB grounding via RAG. |
| Weather | **Open-Meteo** | Free, no key, hourly forecast + history. |
| Payments | **RevenueCat** | Cross-platform subscriptions without store-API pain. |
| File storage | **Vercel Blob** | Setup photos, exported PDFs. |
| Analytics/crash | PostHog + Sentry | Know what features get used; fix crashes fast. |

*Alternative considered:* Supabase (auth+DB+storage in one) — fine too; pick whichever the dev partner is faster with. The mobile/offline architecture doesn't change.

---

## 8. Roadmap & Work Split

### Phase 0 — Foundations (Week 1)
| William | Dev partner |
|---|---|
| Name/logo/visual identity, app design system (dark, pit-lane aesthetic) | Repo setup (monorepo: `apps/mobile`, `apps/api`, `packages/schema`), Expo + CI/EAS, Vercel project, Neon, Clerk |
| Define the **setup sheet schema** for the first 3 chassis (start from SETUP_RC's MP11 work) | Local DB + sync architecture spike (the riskiest technical piece — de-risk first) |
| Competitive teardown: install So Dialed, document every screen & friction point | Schema-driven sheet renderer proof of concept (JSON template → form UI) |

### Phase 1 — MVP (Weeks 2–4)
| William | Dev partner |
|---|---|
| 15–20 chassis templates (sheet schemas + kit setups), validated against real manufacturer sheets | Garage, setup CRUD, track CRUD, offline-first storage, photo attachments |
| All UI design: garage, sheet editor, track screens (Figma → handoff) | Auth, sync, settings |
| Start the **tuning knowledge base**: cause→effect rules, sourced from manufacturer guides + pro tuning guides | PDF export pipeline (sheet JSON → manufacturer layout) |

**Gate: MVP in our own hands at a real practice day. We use it ourselves for a full session.**

### Phase 2 — AI Race Engineer + Session Mode (Weeks 5–8)
| William | Dev partner |
|---|---|
| KB completion + review of every rule; driver-feedback tag taxonomy; prompt design & eval set (50 real tuning scenarios with known-good answers) | Session mode (runs, lap times, feedback capture), setup diff view |
| AI advice UX: how a recommendation is presented, accepted, reverted, rated | AI pipeline: RAG over KB, weather integration, structured-output recommendation endpoint, learning-loop storage |
| Beta tester recruitment (local club, FB groups, RC forums) | Sync hardening, conflict resolution, performance |

**Gate: AI beats "ask ChatGPT" blind test on our 50-scenario eval set, and gives zero dangerous/nonsense advice.**

### Phase 3 — Launch (Weeks 9–10)
| William | Dev partner |
|---|---|
| Store listings (screenshots, copy), pricing setup, launch content (3 demo videos: "RaceLab fixed my mid-corner push"), community seeding | Subscriptions (RevenueCat), free-tier gating, sharing/import, crash/analytics, store submission (TestFlight → release) |

**Gate: 20 active beta users, crash-free rate > 99%, then public launch.**

---

## 9. Monetization

Match So Dialed's price point, win on value:

| | **Free** | **Pro — $3.99/mo or $34.99/yr** |
|---|---|---|
| Cars | 2 | Unlimited |
| Setups | 10 | Unlimited |
| AI Race Engineer | 5 recommendations/month | Unlimited + learning loop + weather-aware |
| Setup diff & history | Last 3 versions | Full timeline |
| PDF export | ✅ | ✅ |
| Sessions/race log | ✅ | ✅ + analytics |

Rationale: free tier is genuinely useful (better retention than So Dialed's), but the AI — our best feature and our main cost (API tokens) — is the paywall. Later: team plan for clubs/teams.

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| AI gives bad tuning advice → instant credibility death | KB-grounded RAG only, eval set before launch, confidence display, "one change at a time", beta with real racers |
| Offline sync is hard (conflicts, partial sync) | Spike it in Week 1; local-first library (PowerSync/similar) instead of hand-rolling; last-write-wins per field is acceptable v1 |
| Chassis template treadmill (So Dialed has 600+) | Schema-driven templates = data, not code; community-submitted templates in V2; launch focused on 1/8 & 1/10 offroad where we race |
| Two-person bandwidth | Phases have hard gates; cut scope, never quality of the AI |
| So Dialed copies condition-aware AI | Our moat is the per-user learning loop + KB quality — data they don't have |

---

## 11. Definition of Done — V1 Launch

- A racer can: create their car → load the kit setup → go to the track → start a session → log a run → say "it pushes mid-corner" → get one grounded recommendation → apply it → mark it "better" — **entirely offline except the AI call**, syncing later.
- PDF export matches the manufacturer sheet.
- Apps live on App Store + Play Store with subscriptions working.

---

## 12. Immediate Next Actions (this week)

**William:**
1. Install So Dialed Premium, document teardown (screens, flows, AI quality — feed it 5 real scenarios and save its answers as our benchmark to beat)
2. Draft the MP11 + RC8B4 + 22 5.0 sheet schemas (reuse SETUP_RC nomenclature work)
3. First 30 KB tuning rules (diff oils, shock oil/springs, camber/toe, tires by surface)

**Dev partner:**
1. Scaffold monorepo: Expo app + Next.js API on Vercel + Neon + Clerk
2. Offline/sync spike — pick the local-first approach and prove create-offline → sync-later works
3. Schema-driven sheet renderer PoC: JSON template in → editable setup form out

Decide together at end of week: confirm stack, confirm the 20-chassis launch list, name check (trademark search for "RaceLab" in app stores — there are existing apps with similar names, verify before branding work).
