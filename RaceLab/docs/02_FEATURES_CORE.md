# 02 — Core Features (COMMITTED)

> **This file is the agreed product scope.** Everything here has been discussed and decided by the team. Ideas that are *not* yet committed live in [`03_FEATURES_EXPLORATORY.md`](03_FEATURES_EXPLORATORY.md) — an idea only moves into this file by team decision logged in `00_CONTEXT.md §4`.
>
> Tiers: **MVP** = internal build we use ourselves at a real track · **V1** = public store launch.

---

## Pillar 1 — Setup storage (MVP)

### 1.1 Garage
- Add cars from a **chassis template catalog** (launch list **6–8 chassis** — the ones our clubs race, MP11 first; D14. Candidates: Kyosho MP11/MP10, Associated RC8B4, TLR 8IGHT-X, Tekno NB48 2.1, Mugen MBX8R, Xray XB8 — final pick by club survey). Car = template + name + photo + notes. More chassis post-launch = pure data (D5).
- Each template ships with the **manufacturer kit setup** preloaded as the baseline sheet.

### 1.2 Setup sheets
- Schema-driven editor (one JSON schema per chassis — Decision D5). Sections: **suspension** (springs, oil wt/cSt, pistons, camber, toe, ride height, droop, sway bars, shock positions), **diffs** (F/C/R oil), **tires** (compound, insert, wheel, glue/sauce notes), **gearing** (pinion/spur or clutch bell), **wing/body**, **ackermann/steering**, **electronics** (ESC profile) or **engine** (needles, plug, shims) depending on power type.
- CRUD: create, duplicate ("start from Q2 sheet"), rename, archive. Photos per sheet (chassis shots, shock build).
- **Versioning**: every save is a version; the timeline of a car's setups is browsable. (This powers diffing and the AI's history — it is not optional polish.)

### 1.3 Offline-first (hard requirement, D4 — architecture per D11)
- All storage/editing/browsing of your own data works with **zero connectivity**. Local SQLite is the **only** source of truth; an append-only outbox backs up to the cloud when online; restore on fresh install. **No bidirectional sync in V1** — there is nothing to merge (one phone, immutable setup versions). Even the AI has an offline path (D13).

### 1.4 PDF export (V1)
- Export any sheet onto the manufacturer's blank layout — by **filling it, never redrawing it** (D12): AcroForm field-filling where the blank has form fields (MP11 does — verified), coordinate overlay on flat blanks. Per-chassis cost = a `pdf_map` data file. Generic RaceLab layout as fallback for unmapped chassis. Generated server-side (you print at home, not trackside).

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

## Pillar 3 — Race Engineer chatbot (V1) — full spec in `04_AI_RACE_ENGINEER_SPEC.md`

- A conversational advisor: *which component to change or modification to try*, given **track, surface, weather, grip, your current setup, your feedback, and your history**.
- **100% on-device and deterministic — no external API, no LLM (D18).** Our own chatbot: deterministic NLU parses the driver's words ("it pushes mid-corner") into symptom/phase tags, asks the one clarifying question a real engineer would, retrieves from the KB, and renders the card. Works with zero connectivity, $0 per recommendation, instant.
- **Scope: chassis tuning only** (D13). Engine/needle questions get a hard canned refusal until V2's engine database exists.
- **Grounded on our curated tuning knowledge base** (D6) — deterministic retrieval over the sourced YAML rules (no vector store); every recommendation cites its cause→effect rule. Out-of-KB questions get an honest refusal, not a guess.
- **Output contract**: ONE primary change (+ ranked alternatives held in reserve), each with: what & how much, the mechanism (why), expected effect, how to revert, confidence level.
- **Outcome loop**: the chatbot asks better/same/worse after the run — "worse" → revert + next ranked option; "better" → keep + log to the sheet; stored as `(setup delta, conditions, outcome)` for per-driver/per-track personalization.
- **Safety rails**: proposed values come from the chassis template's enums/ranges by construction; race-day mode only proposes high-confidence, fast-reversible changes ("stick with what you have" is a valid answer).

## Pillar 4 — Sharing (V1.0 lean per D10) — full spec in `05_SOCIAL_SPEC.md`

- **Publish a setup** as an **unlisted share link** (or keep private), with conditions context and — when available — attached results. The link is a static page embedding the rendered sheet (PDF/PNG) + install CTA — no public API, no web app in V1.0.
- **Import ("fork")**: open a shared setup in the app, import it into your garage with provenance kept; the app shows the diff vs your current sheet.
- **V1.1+ (already specced, deliberately deferred):** public discovery/search, profiles & following, props, threaded comments (requires Apple UGC 1.2 compliance: filtering + report + block), chassis-scoped notifications. Feed/clubs/leaderboards remain exploratory (`03 §A`).

---

## Cross-cutting (V1)

| Feature | Detail |
|---|---|
| Auth | Email + Apple/Google sign-in. **Local data is never gated behind a live session** — cached user ID; only network calls need a fresh token (test the "airplane mode for 48h" path) |
| Track database | Create/search tracks: name, GPS, surface type (clay / hard-packed / loam / astro / carpet / grass), indoor/outdoor, photos, notes. Weather backfilled from Open-Meteo's historical API at sync time when captured offline |
| Monetization | **V1.0 launches free** (D16). The advisor is deterministic and on-device (D18) → zero marginal cost → **advisor unlimited even in free tier**. **Pro $3.99/mo / $34.99/yr ships in V1.1**: unlimited cars/setups, full version history, analytics |
| Store compliance | In-app account deletion, privacy policy, Play data-safety form — built in Phase 2, not bolted on at submission (D17) |
| Platforms | iOS + Android (Expo/React Native), single codebase. Play closed test (14-day clock) running from week 4 |
| Languages | i18n wired from the first screen, EN shipped; FR fast-follow = translation, not retrofit. AI answers in the user's locale; KB stays EN (D17) |

---

## Explicitly OUT of scope for V1

So we never argue about it mid-build:

- ❌ 600-chassis coverage (6–8 at launch; community templates later)
- ❌ Live timing integration (MyLaps/LiveRC import is exploratory — manual lap entry in V1)
- ❌ Feed/clubs/leaderboards/challenges (exploratory §A)
- ❌ Profiles, follows, props, comments, public discovery (V1.1 — D10)
- ❌ Bidirectional multi-device sync (V2 — D11; V1 = backup/restore)
- ❌ Subscriptions/payments (V1.1 — D16)
- ❌ Engine/nitro-needle AI advice (V2 — D13)
- ❌ Voice input, photo-based AI (tire wear, broken parts) (exploratory §C)
- ❌ Onroad-specific depth (templates may exist, but tuning KB targets offroad first)
- ❌ Web app / public API (share links are static PDF-backed pages — D10)

## V1 Definition of Done

A racer can: create their car → load the kit setup → drive to a track with no signal → start a session → log a run and tell the chatbot "it pushes mid-corner" → get a grounded recommendation **fully offline, no API anywhere** → apply it, comment it → answer "better" → back home, share the setup link and a friend imports it into their app. PDF export fills the manufacturer sheet. Both stores live, advisor free and unlimited.
