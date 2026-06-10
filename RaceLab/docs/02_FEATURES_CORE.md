# 02 — Core Features (COMMITTED)

> **This file is the agreed product scope.** Everything here has been discussed and decided by the team. Ideas that are *not* yet committed live in [`03_FEATURES_EXPLORATORY.md`](03_FEATURES_EXPLORATORY.md) — an idea only moves into this file by team decision logged in `00_CONTEXT.md §4`.
>
> Tiers: **MVP** = internal build we use ourselves at a real track · **V1** = public store launch.

---

## Pillar 1 — Setup storage (MVP)

### 1.1 Garage
- Add cars from a **chassis template catalog** (launch list ~15–20: Kyosho MP10/MP11, Associated RC8B4/B7, TLR 8IGHT-X/22 5.0, Tekno NB48/EB48 2.1, Mugen MBX8R, Xray XB8/XB4, Sworkz…). Car = template + name + photo + notes.
- Each template ships with the **manufacturer kit setup** preloaded as the baseline sheet.

### 1.2 Setup sheets
- Schema-driven editor (one JSON schema per chassis — Decision D5). Sections: **suspension** (springs, oil wt/cSt, pistons, camber, toe, ride height, droop, sway bars, shock positions), **diffs** (F/C/R oil), **tires** (compound, insert, wheel, glue/sauce notes), **gearing** (pinion/spur or clutch bell), **wing/body**, **ackermann/steering**, **electronics** (ESC profile) or **engine** (needles, plug, shims) depending on power type.
- CRUD: create, duplicate ("start from Q2 sheet"), rename, archive. Photos per sheet (chassis shots, shock build).
- **Versioning**: every save is a version; the timeline of a car's setups is browsable. (This powers diffing and the AI's history — it is not optional polish.)

### 1.3 Offline-first (hard requirement, D4)
- All storage/editing/browsing of your own data works with **zero connectivity**. Local DB is source of truth; background sync when online. Only the AI call and social features may require network.

### 1.4 PDF export (V1)
- Export any sheet onto the manufacturer's blank layout (pixel-faithful). Credibility feature — racers trust the familiar sheet — and the escape hatch that kills lock-in fear.

---

## Pillar 2 — Comments & history (MVP)

### 2.1 Commentary on setups
- Free-text notes on **every sheet** and on **every individual change** ("went 5.5wt front — much calmer into bumpy corners once track cleaned up").
- Notes are timestamped, attached to the version, and searchable. They are also AI input: the engineer reads your own commentary history for this car/track.

### 2.2 Setup diff (V1)
- Side-by-side comparison of any two sheets (yours vs yours, yours vs imported) with **only the changed parameters highlighted**, git-style.
- Each diff line can carry the comment that explains it. (Exploratory extension: AI explains the intent of each delta — see `03 §C`.)

### 2.3 Session log (V1)
- **Session** = a race day or practice at a track. Timeline of **runs** (practice / qualifier / main), each run linked to the exact setup version that was on the car.
- Per run: lap times / result (manual in V1; timing import is exploratory), quick **feedback tags** (push entry/mid/exit, loose on power, bouncy in bumps, traction rolls…) + free text.
- Weather **auto-captured** per session (Open-Meteo: temp, humidity, wind, rain) + manual grip level (green / medium / high / blue groove) and track temp.

---

## Pillar 3 — AI Race Engineer (V1) — full spec in `04_AI_RACE_ENGINEER_SPEC.md`

- Chat + structured recommendations: *which component to change or modification to try*, given **track, surface, weather, grip, your current setup, your feedback, and your history**.
- **Grounded on our curated tuning knowledge base via RAG** (D6) — every recommendation cites its cause→effect rule. Out-of-KB questions get an honest refusal, not a guess.
- **Output contract**: ONE primary change (+ ≤2 ranked alternatives), each with: what & how much, the mechanism (why), expected effect, how to revert, confidence level.
- **Learning loop**: after the next run, the user rates the change better/same/worse → stored as `(setup delta, conditions, outcome)` → future advice is personalized per driver and per track.
- **Safety rails**: numeric bounds enforced *outside* the LLM for safety-critical settings (nitro needles especially); race-day mode only proposes high-confidence, fast-reversible changes.

## Pillar 4 — Sharing / social (V1) — full spec in `05_SOCIAL_SPEC.md`

- **Publish a setup** (public / unlisted link / private), with conditions context and — when available — attached results.
- **Browse & import**: find setups by chassis / track / conditions; import ("fork") one into your garage, the app shows the diff vs your current sheet.
- **Profiles & following**: driver profile (garage, shared setups, race history); follow drivers; chassis-scoped notifications ("new MP11 setup from someone you follow").
- **Props & comments** on shared setups — the pit-lane conversation, captured.
- V1 social is deliberately lean: feed/clubs/leaderboards are exploratory (see `03 §A`) until the utility core is loved.

---

## Cross-cutting (V1)

| Feature | Detail |
|---|---|
| Auth | Email + Apple/Google sign-in (store requirement for social features) |
| Track database | Create/search tracks: name, GPS, surface type (clay / hard-packed / loam / astro / carpet / grass), indoor/outdoor, photos, notes |
| Subscriptions | Freemium per D9. Free: 2 cars, 10 setups, 5 AI recs/month, last-3-versions diff. **Pro $3.99/mo / $34.99/yr**: unlimited everything, full AI + learning loop, full history/analytics |
| Platforms | iOS + Android (Expo/React Native), single codebase |
| Languages | EN first; FR fast-follow (we're French — and France has a huge offroad scene) |

---

## Explicitly OUT of scope for V1

So we never argue about it mid-build:

- ❌ 600-chassis coverage (launch list only; community templates later)
- ❌ Live timing integration (MyLaps/LiveRC import is exploratory — manual lap entry in V1)
- ❌ Feed/clubs/leaderboards/challenges (exploratory §A)
- ❌ Voice input, photo-based AI (tire wear, broken parts) (exploratory §C)
- ❌ Onroad-specific depth (templates may exist, but tuning KB targets offroad first)
- ❌ Web app (mobile only; share links open a read-only web view at most)

## V1 Definition of Done

A racer can: create their car → load the kit setup → drive to a track with no signal → start a session → log a run with lap times and "pushes mid-corner" → *(network for this step)* get one grounded recommendation → apply it, comment it → mark it "better" → back home, publish the setup and a friend forks it. PDF export matches the manufacturer sheet. Both stores, subscriptions live.
