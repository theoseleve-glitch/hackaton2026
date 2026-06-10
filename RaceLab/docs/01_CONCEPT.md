# 01 — Concept

## 1. One-liner

> **RaceLab is the Strava of RC racing: your setups, your progress, your community — with an AI race engineer in your pit.**

## 2. The insight

RC racing produces *perfect* data for a Strava-style product, and nobody is using it:

- Every racer obsesses over a structured artifact (the setup sheet) the way cyclists obsess over rides.
- Every race generates **objective, transponder-timed results** (MyLaps/LiveRC) — the equivalent of GPS traces — already digital, already public, just never connected to setups.
- The social fabric already exists offline: club nights, pit-lane setup conversations, "what are the fast guys running?", pros posting setup JPEGs on Instagram. It has **no digital home** — it's scattered across Facebook groups and paper sheets.
- Tuning advice is the most asked, least answered question in the hobby — and it depends on conditions (surface, weather, grip evolution) that current tools ignore entirely.

So Dialed built the notebook. Nobody has built the *loop*.

## 3. The core loop (this is the product)

```
        ┌──────────────────────────────────────────────────────┐
        │                                                      │
        ▼                                                      │
   RACE / PRACTICE                                             │
   transponder laps + conditions auto-captured                 │
        │                                                      │
        ▼                                                      │
   LOG  →  setup attached to the run, quick feedback           │
        │   ("pushes mid-corner"), comments, photos            │
        ▼                                                      │
   AI ENGINEER  →  one grounded change to try, with the why    │
        │   (knows track, weather, surface, your history)      │
        ▼                                                      │
   RESULT  →  better / same / worse → the AI learns YOU        │
        │                                                      │
        ▼                                                      │
   SHARE  →  setup published with verified results attached;   │
             others fork it, props it, comment it ─────────────┘
             (their forks + outcomes feed everyone's AI)
```

Each pillar feeds the next. The loop is also the **moat**: every logged run produces a labeled `(setup change, conditions, outcome)` data point that So Dialed structurally cannot collect — their AI never learns whether its advice worked.

## 4. Why "Strava of RC" is the right frame

| Strava | RaceLab |
|---|---|
| Activity (ride/run) | Race day / session, auto-created from timing data |
| GPS trace | Lap times + setup sheet attached to the run |
| Kudos | Props ("Dialed", "Send it", "Tough break") |
| Segments & leaderboards | Per-track, per-class lap leaderboards from transponder data |
| Clubs | Club spaces: race nights, series standings, track conditions |
| Following pros | Pro setup drops; chassis-scoped follows ("every new MP11 setup") |
| Year in Review | Season Wrapped (laps turned, A-mains, gallons of nitro…) |
| Premium analytics | "Why am I slow": consistency curves, run degradation, gap-to-A-main |
| — *(no equivalent)* | **The AI race engineer** — Strava tells you what you did; RaceLab tells you what to change |

The last row is the upgrade on the metaphor: Strava is descriptive, RaceLab is **prescriptive**.

## 5. Personas

1. **Théo-the-club-racer (primary)** — races 2–4×/month, 1–3 cars, copies pro sheets without fully understanding them. Wants: *"tell me what to change, and show me I'm improving."* Buys Pro for the AI.
2. **The fast regional** — understands tuning; wants frictionless logging, diffs, history, and a sanity check. Becomes a content creator (shared setups) if forks/props give status.
3. **The beginner** — overwhelmed by 40 tunable parameters, afraid of making the car worse. Needs kit baselines, plain-language cause→effect, guardrails. The hobby's churn point — and the market's growth lever.
4. **The traveling racer** — arrives at an unknown track, needs local intel (surface, tires, what locals run) *before* practice ends.
5. **The club organizer (B2B2C wedge)** — runs race nights on Facebook + a whiteboard. Give them standings/announcements/track-condition tools and they onboard 40 racers at once.

## 6. Positioning statement

For RC racers who want to get faster, **RaceLab** is the racing companion that turns every run into progress — unlike **So Dialed**, which stores your setups but doesn't know your track, your weather, or whether its advice ever worked.

## 7. Product principles

1. **Trackside-first.** Every core interaction must work with dirty hands, bad signal, and 10 minutes before your heat. Offline always; ≤10s to log a change; voice where typing fails.
2. **One change at a time.** Real race engineers isolate variables. The AI never dumps five suggestions; advice is ranked, reversible, and humble ("if this doesn't help, the cause is probably X").
3. **Grounded or silent.** Advice cites the knowledge-base rule it derives from, or it isn't given. Knowing when to say "stick with what you have" is a feature.
4. **Results make sharing honest.** A shared setup with verified race results attached beats an anonymous PDF. Reputation comes from the timing system, not from claims.
5. **Quality over coverage.** 20 chassis done perfectly beats 600 done shallow. Depth is the wedge; breadth comes via schema-driven templates + community submissions later.
6. **The data flywheel is sacred.** Any feature that captures a `(change, conditions, outcome)` triple gets priority; it compounds into an advantage no funded competitor can shortcut.

## 8. North-star metric

**Closed loops per week** — runs logged with a setup attached AND an outcome rating. It's the one number that proves utility (people log), engagement (people return mid-race-day), and moat (the AI's training signal grows). Supporting metrics: weekly active racers, setups shared/forked, free→Pro conversion.
