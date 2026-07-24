# RaceLab — State of the Art & the Purchase Question (2026-07-24)

> Author: William's Claude (chief-officer read). Method: 10-lens adversarial audit + RC-market
> research (34 agents, 2.7M tokens, 0 errors), every internal claim re-verified by running the
> engine/reading the files, every external claim cited. This doc supersedes the optimistic
> "current state" bullets in CLAUDE.md where they disagree — **measured reality wins.**

---

## 0. The one-paragraph truth

RaceLab has a **genuinely excellent engine and a genuinely good app that are barely connected to
each other**, wrapped in a **launch posture that cannot currently ship**. The deterministic race
engineer is real: **414 grounded, model-gated KB rules, eval 30/30, full suite green, CI live**,
and for a 1/8 or 1/10 off-road racer with a balance problem it gives advice *better than a forum
answer and worth money*. But the flagship chatbot is unmounted dead code, the tire advisor is not
even exported, the setup sheet a racer laboriously fills in has **zero effect on the advice**, only
**1 of 237 cars** has a kit baseline, the paywall gates nothing, and the app **cannot produce a
store binary** (no bundle id, no permission strings) while its own copy commits App-Store
anti-steering violations. **The work that remains is almost entirely wiring, content entry, and
launch hygiene — not new invention.** That is the good news: the hard part (a trustworthy engine)
is done.

---

## 1. What the project contains (verified)

### 1.1 The engine & knowledge base — the crown jewel (real)
- **414 LIVE rules** across 14 YAML files, passing citation + capability + contradiction + caster +
  source-marker gates (`npm run validate-live`). Verified count, not the doc's "417".
- **Engine eval 30/30**; full monorepo suite green (exit 0); CI active
  (`.github/workflows/racelab-ci.yml`, D74).
- The **D18 invariant is real and enforced**: deterministic, offline, no API/model/key on the advice
  path. This is the defensible moat — the incumbent's AI is a cloud LLM that *by its own admission*
  "will occasionally hallucinate."
- The balance loop is strong: for 12 canonical complaints across the 10 classes that have rules, the
  engine answered **145/160** with specific magnitudes ("0.5° at a time"), stated physical effects,
  and a revert cost.

### 1.2 The app — a well-built shell (real, but hollow at the core)
- Expo SDK 56 RN app, ~10,176 LOC: 6 tabs (Garage · Sheet · Tracks · Runs · Engineer · Social) +
  Settings + onboarding/trial gate.
- **Genuinely finished:** run log, sheet versioning, tracks/corners, compare overlay, pit strategy
  (TIME-first), podium/achievements, and disciplined offline-first storage.

### 1.3 Backend & packages — built, tested, and entirely dark
- 16 packages + `server/` (~5,037 LOC), all tested. But **five whole packages (storage 1,957 LOC,
  weather 1,062, speedhive 1,146, account 1,040, pdf 279) plus server/ have ZERO consumers** in the
  app. The app reimplements weather and speedhive inline instead. Roughly **10,500 LOC of tested
  package code + 5,000 LOC of server** are unreachable — against an app of ~10,176 LOC.
- **The server has never run.** API host returns `DEPLOYMENT_NOT_FOUND`; `server/package.json` has
  no dependencies; the 12-table schema has never touched a Postgres (all 24 suites run against
  hand-written fakes).

---

## 2. The gap — where value leaks (verified, ranked)

| # | Finding | Severity | Evidence |
|---|---|---|---|
| 1 | **Flagship chatbot is dead code.** `EngineerScreen.tsx` (the only file instantiating `RaceEngineerChat`) is imported by nothing. The "Engineer" tab is the *form-based report*, not the chat. | Blocker | `grep EngineerScreen apps/` → 1 self-hit |
| 2 | **Tire advisor (D75–D78) is physically unreachable.** Not exported from engine index, not in `bundle.json`, loads YAML via `node:fs`. 4 research sessions, 22 grounded entries, 0 user value. | Blocker | `index.ts` has no tire export; bundle keys lack `tires` |
| 3 | **Setup-sheet values don't affect advice.** MP11-with-kit, empty template, and half-filled sheet all return **byte-identical** recommendations. The most laborious feature buys nothing. | Blocker | Ran `buildReport` ×3; `offline.ts:106` is the only setup read |
| 4 | **The paywall gates nothing.** `trialDaysLeft` drives one banner; app works forever after day 15 while Settings says "Trial over." Revenue is 0€ by construction. `packages/account` imported by zero app files. | Blocker | grep for daysLeft/entitle/paywall across `apps/mobile` |
| 5 | **Speedhive MOCK ships fabricated laps as real.** Offline (the normal case) pops "🏁 NEW RUN DETECTED · 1970-01-01 · best 23.33s" with invented times from a Dutch track. | Blocker | `speedhive.ts:16 MOCK=true`, `:99-116 mockSessions()` |
| 6 | **Social tab is a fabricated network** with invented drivers, invented palmarès, and working Follow buttons — no "demo" label. | Blocker | `socialnet.ts:18 SOCIAL_MOCK=true` |
| 7 | **Only 1 of 237 cars has a kit baseline.** Everyone but one Kyosho model opens a 43–72-field **blank** sheet — exactly the chore the app promised to remove. | High | 16 categoryTemplates all have `kit_default: 0` |
| 8 | **NLU drops ~87% of non-canonical phrasings.** "It wheelies on the straight" → "I couldn't pin the symptom down." First impression = "the chatbot is fake." | Blocker | 50-phrase corpus: 33/50 miss on 4 chassis |
| 9 | **No "apply recommendation to sheet" button** — the learning loop is broken at the join; the racer must hunt the field among 46–72 manually. | High | Only sheet writers are manual edit + fork import |
| 10 | **Switching tabs mid-run-form destroys everything typed** (conditional unmount, no draft persistence). | High | `App.tsx:241`, 20 local `useState` in RunFormV2 |
| 11 | **22 LIVE rules carry REVIEW notes admitting they contradict their own cite** (21 at confidence:high); `validate-live` catches none. On-road GT has ~1-in-4 chance the first advice contradicts its source. | High | scan of `rules/*.yaml`; `validate-live.ts:99` regex misses them |
| 12 | **Cannot build a store binary.** No `eas.json`, no `ios.bundleIdentifier`, no `android.package`; camera/location/photo used in 3 components with no `infoPlist` purpose strings → guaranteed iOS rejection + runtime crash. | Blocker | `app.json` (read in full) |

**Corrections to earlier assumptions (audit refuted these):** the weather forecast a racer supplies
*does* drive cited adjustments through `buildRacePlan`→`applyForecast` (not dark); there are 16
category templates, not 2 (but they carry no kit defaults); `proposePlan` *is* reached — only via
the unmounted chatbot; the app *does* capture some tyre info in `RunFormV2`.

---

## 3. The market (researched, cited)

- **The incumbent is deeper than our docs assumed.** So Dialed (Degree3) ships **7–8 RC apps**,
  **600+ cars**, 4,317+ shared setups, **named factory-driver endorsements** (incl. a ROAR National
  Champion), a separate **"RC AI Mechanic"** (OpenAI-backed, free, 10K+ installs), and since Feb 2026
  is the **official app of MyRCM** (the dominant European timing platform). Its AI is weakest exactly
  where we're strongest (1/8 off-road) — that's the wedge.
- **Price gravity is toward zero.** The whole market sits at **$2.99–$4.99/mo, $9.99–$44.99/yr**. So
  Dialed just raised to **$4.99/$39.99**; its AI advice sells as a **$6.99/$19.99 one-time IAP**. A
  2025–26 entrant wave (SetupRC, minircsetup with its own "AI Tuning Coach," RaceBench, Live RC
  Buddy) is claiming the analytics/community angles we planned — and minircsetup's founder *moved
  features to free based on racer feedback*.
- **The proposed 9.99€/99.99€ is 2.3×–2.9× the incumbent** — with no users, no endorsements, no
  proof, and less content. Indefensible as designed.
- **TAM is hard-capped.** ROAR ≈ 4,500 members / 200 clubs; the six-year category leader has 10K+
  installs and ~105 iOS ratings. At the ~2.1% freemium median that's a few hundred payers — a
  side-income, not a venture.
- **The tire bet is directionally right** (best-evidenced pain, nobody sells it) but mis-framed:
  the higher-frequency decision is *"which of the sets I already own do I bolt on for THIS round,"*
  and experts say **compound (temperature) beats tread** — we weight tread-by-surface.
- **Search will never deliver this audience.** Discovery is YouTube tuners, forums, and the ~200
  clubs directly.

---

## 4. THE ANSWER — what would make an RC driver purchase this tool?

A racer opens their wallet when a tool **saves them a race they'd otherwise have lost, or money
they'd otherwise have wasted** — and *only* if they trust it. Concretely, four things must ALL be
true. Today, **zero of the four hold.**

### ① "It knows MY car." (trust through specificity)
The racer picks their exact chassis and the app shows the **kit baseline they'd otherwise copy by
hand**, then tunes *from that setup*. Today: 1 of 237 cars has a baseline; the sheet doesn't affect
advice. **This is the single highest-leverage fix** — it turns "generic lookup table" into "my race
engineer." Cost: kit-default data entry (~25–30 numbers/car) + a one-line `resolveTemplate` change +
make setup values feed ranking.

### ② "It gives me ONE answer, right now, in my words, between heats." (the loop actually closes)
Ask in plain pit-lane language → get one prioritized change with a revert cost → **one tap to write
it into the sheet** → next run, "better/same/worse?" → it learns. Today: the chatbot isn't mounted,
NLU drops 87% of real phrasings, and there's no apply button. Fix: mount the chat, widen NLU (~40
patterns), add "Apply to sheet." This is what makes it *a race engineer, not a notebook* — the entire
positioning.

### ③ "It never lies to me, and it works with no signal." (the moat, made visible)
Grounded-or-silent, on-device, cited. This is the one thing the incumbent's cloud LLM *cannot copy
without abandoning its subscription model*. Today it's real in the engine but **invisible** (D53 hid
citations) and undermined by 22 self-contradicting rules + fabricated mock data. Fix: kill the mocks,
quarantine the contradicting rules, and — carefully — **surface a trust signal** ("grounded in HUDY
p.26" as a tap-to-reveal), because invisible integrity converts nobody.

### ④ "It's worth what a set of tires costs — and I can actually pay." (honest, compliant, proven)
Price it as **"one set of tires per season" (€39–49/yr, optional €19.99 lifetime)** — not 2.5× the
incumbent. Make it purchasable (the paywall must exist and gate the *advice*, never the racer's
data). And prove it with **≥1 endorsed racer + real race results**, because hobbyists convert on
proof, not features. Today: no purchase path, indefensible price, zero field validation ("beta with
real racers" appears only as a *planned* risk mitigation — nobody has tested this at a track).

**In one line:** *An RC driver buys RaceLab when it demonstrably knows their exact car, answers in
their words between heats with one change they can apply in a tap, never invents a number, works with
no signal — and costs less than the tires they'll save.*

---

## 5. Why this is a winnable position

The moat is narrow but real and defensible: **on-device + grounded + 1/8-strong** is precisely the
incumbent's weakness. The engine that's hard to build is built. What's left is the part a 2-person
team can actually finish: wire what exists, enter the content, fix the launch hygiene, and validate
with 5 real racers at one club. See `docs/LAUNCH_PLAN_2026-07-24.md` for the sequenced plan.
