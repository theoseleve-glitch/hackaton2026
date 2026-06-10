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
- [ ] Garage: add cars from a chassis template catalog (**6–8 launch chassis** per D14 — MP11 first, rest by club survey)
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
- [ ] Free tier with server-metered AI cap (subscriptions move to V1.1 — D16)

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
Car ──< SetupVersion (immutable; parent_version_id; forked_from_version_id;
                      structured JSON matching the chassis template schema)
        — diffs are COMPUTED on read from two versions + the shared template,
          never stored (no SetupChange entity; one source of truth)
        — change comments attach to (version_id, field_id) pairs
Track (name, gps, surface, indoor, notes)
Session (user, track, date, weather_snapshot — backfilled from Open-Meteo
         historical API at sync time if captured offline) ──< Run
Run (session, setup_version_id, type: practice/qual/main, lap_times, result,
     feedback_tags[], feedback_text)
Recommendation (run_id, input_snapshot, advice, kb_rules_used[], offline_or_llm,
                outcome: better/same/worse)
ChassisTemplate (brand, model, scale, class, versioned sheet schema + pdf_map)
KBRule (setting, direction, effects[], conditions, confidence, source)
```

Key decisions: **setup sheets are schema-driven JSON**, one schema per chassis template — adding a chassis = adding a data file, no code (D5). The template format must nail from day one: **stable field IDs + template_version on every sheet**, a **canonical setting taxonomy** (`front_diff_oil` is canonical; each template field declares its canonical id — this is what lets KB rules work across chassis), units on field definitions, composite/diagram-picker field types (MP11 bushing grids, tower holes), an `extensions` block outside the manufacturer-mapped fields, and a `pdf_map` (acroform field names or overlay coordinates — D12).

---

## 7. Tech Stack (recommendation)

| Layer | Choice | Why |
|---|---|---|
| Mobile app | **Expo (React Native) + TypeScript** | One codebase → iOS + Android (So Dialed is on both; we must be too). Expo EAS handles builds/store submission; EAS Update for OTA fixes. |
| Local data | **expo-sqlite, local DB = the ONLY source of truth** (D11) | No sync engine in V1: append-only outbox → cloud backup when online; restore on fresh install; publish = server-side snapshot. "Custom sync" and conflict resolution are off the menu — real sync is V2 (team accounts). |
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

## 8. Roadmap & Work Split (AI-first ordering per D15)

> Standing rules: GitHub Issues + one board mirroring these gates; every scope change = a D-row in `docs/00_CONTEXT.md` the same day; CI = typecheck + lint + **eval-set run**; weekly TestFlight / Play-internal build from week 4. Pre-agreed cut order if velocity is below plan: **social → faithful PDF layouts → anything else — never the AI.**

### Phase 0 — Validate the bet (Weeks 1–2)
| William | Théo |
|---|---|
| ⚠️ **Name check (blocker)**: racelab.app collision — clear it or switch to backup name before any more branding | **Throwaway AI prototype** (a script, not an app): MP11 template + first 30 KB rules + hardcoded context bundle → Claude structured output |
| First **30 KB rules** + the 5-scenario So Dialed benchmark (install Premium, feed it real scenarios, save answers) | Eval harness (runs the scenario set against the prototype; lives on in CI) |
| Recruit **2 club fast-guys** as eval reviewers / founding creators | Repo + Expo skeleton; **create Apple & Google developer accounts** (lead times start now — D17) |
| Design system + core screens (sheet editor first) | Schema-driven sheet renderer PoC (JSON template → form UI) |

**Gate A (end W2): our prototype visibly beats So Dialed's AI Mechanic on the benchmark scenarios — or we stop and rethink the differentiator. Also: end-of-W1 velocity calibration → re-cut this plan against Théo's observed throughput.**

### Phase 1 — MVP at a real track (Weeks 3–5)
| William | Théo |
|---|---|
| KB → ~80 reviewed rules; feedback-tag taxonomy; eval set → 25 scenarios + 5 traps | **Week 3: hard-coded MP11-only MVP** — local-only, no auth: garage(1 car), sheet editor, versions, session log → **take it to a real practice day** |
| Remaining UI design (sessions, AI card, history) | Weeks 4–5: generalize — schema-driven renderer for real, template format locked (stable IDs, canonical taxonomy, pdf_map), tracks, photos, outbox backup |
| Chassis templates 2–4 (AI-extracted from PDFs, William reviews — the MP11 pipeline) | First TestFlight + **Play closed test build (starts the 14-day clock — D17)** |

**Gate B (end W5): we ran a full session on the app ourselves at a track, offline, and didn't reach for paper.**

### Phase 2 — AI in the app + compliance (Weeks 6–8)
| William | Théo |
|---|---|
| Eval pass with the 2 club reviewers; AI advice UX polish (present / accept / revert / rate) | AI pipeline in-app: deterministic retrieval + **on-device offline card path** + server LLM path + guard layer (template-enum validator) + learning-loop storage |
| Chassis templates 5–8 | Session mode complete (runs, laps, tags), computed diff view, weather backfill |
| Beta recruitment (local clubs, FB groups) — target 20 testers | Auth (local data never session-gated), share link (publish snapshot → static PDF page), import/fork, **account deletion + privacy policy + data-safety form**, analytics/crash |

**Gate C (end W8): eval pass bar met (≥80% helpful, 0 dangerous, refusals correct) AND the offline path works in airplane mode for 48h.**

### Phase 3 — Launch (Weeks 9–10)
| William | Théo |
|---|---|
| Store listings, 3 demo videos ("RaceLab fixed my mid-corner push"), seed content: our raced setups + founders' sheets published | Free-tier AI metering server-side, store submissions (expect review iterations — UGC + AI advice), crash triage, PDF export (MP11 acroform + generic layout) |

**Gate D: 20 active beta users, crash-free > 99%, Play 14-day test complete → public launch. V1.1 (~2 weeks later): Pro subscription (RevenueCat), props/comments+moderation, profiles/follows, faithful PDF maps for remaining chassis.**

---

## 9. Monetization

**V1.0 launches free** with the AI capped at 5 recommendations/month (server-metered — needed for cost control anyway); **Pro ships in V1.1** ~2 weeks post-launch when there are users to convert (D16 — IAP out of the launch-review critical path). Target model:

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
| AI gives bad tuning advice → instant credibility death | KB-grounded only, eval gate before launch, confidence display, "one change at a time", engine advice refused in V1 (D13), beta with real racers |
| AI isn't visibly better than So Dialed's | Gate A at week 2 (prototype benchmark) — we find out before building the app around it |
| Offline complexity | Solved by subtraction (D11): no sync engine, backup/restore only; AI has a deterministic on-device path (D13) |
| Chassis template treadmill (So Dialed has 600+) | 6–8 at launch (D14); templates AI-extracted + reviewed; schema-driven = data, not code; community templates V2 |
| Two-person bandwidth / unproven velocity | Week-1 calibration gate; hard phase gates; pre-agreed cut order (social → faithful PDFs → …, never the AI) |
| Store review surprises (UGC, AI advice, IAP) | Accounts week 1, Play 14-day test from week 4, compliance built in Phase 2, payments deferred to V1.1 (D16/D17) |
| Name collision (racelab.app exists in sim racing) | This-week blocker: clear or rename before more branding (D1 escalation) |
| So Dialed copies condition-aware AI | Our moat is the per-user learning loop + KB quality — data they don't have |

---

## 11. Definition of Done — V1 Launch

- A racer can: create their car → load the kit setup → go to the track → start a session → log a run → say "it pushes mid-corner" → get one grounded recommendation → apply it → mark it "better" — **entirely offline except the AI call**, syncing later.
- PDF export matches the manufacturer sheet.
- Apps live on App Store + Play Store with subscriptions working.

---

## 12. Immediate Next Actions (this week)

**Blocker (both): name decision.** racelab.app already exists in sim racing — clear it or pick the backup name now, before another asset is made.

**William:**
1. Install So Dialed Premium → feed its AI Mechanic 5 real tuning scenarios, save the answers (the benchmark Gate A must beat)
2. First 30 KB tuning rules (diff oils, shock oil/springs, sway bars, camber/toe, tires by surface) — MP11 chassis file is done (`chassis/`), rules reference its canonical settings
3. Ask the 2 club fast-guys (eval reviewers + founding creators — one ask)

**Théo:**
1. Read `docs/` + challenge the Decisions log (D1–D17) — it's cheap now
2. Throwaway AI prototype + eval harness (Gate A is yours to make fail-fast)
3. Create Apple + Google developer accounts (lead times start immediately)
4. Expo skeleton + schema-driven renderer PoC

**End of week together:** confirm stack against Théo's strengths, velocity calibration → re-cut the plan, confirm the 6–8 chassis launch list (club survey).
