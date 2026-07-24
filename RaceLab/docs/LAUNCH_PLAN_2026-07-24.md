# RaceLab — Launch Plan v2 (2026-07-24)

> Synthesized from a 3-angle strategy panel (trust-first / loop-first / launch-hygiene-first),
> cross-judged on time-to-payer · trust · team-realism · defensibility. **Loop-first won (25/40)**;
> this plan takes its spine and grafts the best of the other two — plus a fix for the flaw the
> judges found in **all three**: none of them tested whether anyone will actually *pay*.
> Companion to `docs/STATE_OF_THE_ART_2026-07-24.md`. Supersedes the roadmap tail in CLAUDE.md.

---

## The reframe: this is a severed circuit, not a missing-features list

RaceLab is a finished race car with the ignition unwired. The engine (414 grounded rules, eval
30/30) is severed from the app at **four joins**:

```
  ①pick MY car+conditions ──→ ②grounded advice ──→ ③apply to sheet ──→ ④next run: better? ──→ learns
        (registry unused,        (chat unmounted;       (no apply           (loop never
         sheet ignored)           tire advisor            button)             closes)
                                   unexported)
```

**Sequencing rule: reconnect the circuit in the loop's own order, and FREEZE all off-loop work**
(backend, social, paywall, 237-car breadth, on-road) until one loop has closed end-to-end for a
real racer. That freeze is the discipline that stops a 10k-LOC app with a 30/30 engine from doing
nothing.

---

## North star (revised — proves *pay*, not just *helps*)

> **At one real 1/8 off-road race day: ≥5 racers each take a grounded, car-specific answer to a
> real setup question, apply it to their sheet, AND ≥3 make a revealed commitment to pay** (reserve
> a season pass / leave a card / pre-order at the shown price), with every refusal and mis-answer
> captured as the ranked next backlog.

The panel's biggest shared weakness was stopping at "3 said it helped." *"Would you pay?"* at a
track is the least reliable signal in product discovery — so we show the **real price** and ask for
a **real commitment**. That is the only test of the one risk the market says is lethal: that
€-premium pricing into a ~4,500-member TAM against a $4.99 pro-endorsed incumbent is indefensible.

---

## Two shape-decisions to make BEFORE any code (William — reserved calls)

These two decisions each delete more launch blockers than any code we could write:

1. **v1 is FREE at launch, on-device only.** No paywall, no IAP, no external-web subscribe, no
   backend for v1. This removes the App-Store 3.1.1 anti-steering rejection, the never-run server,
   and `packages/account` from the critical path in one stroke. Monetization is *earned* in Phase 4,
   not built in Phase 0. → **Decision needed: William ratify "free v1."**
2. **Re-price now, on the evidence.** €9.99/€99.99 is 2.3–2.9× the incumbent with less content and
   no proof. Market research recommends **"one set of tires per season" — €39–49/yr, optional €19.99
   lifetime.** The field test in Phase 3 shows *this* price. → **Decision needed: William ratify the
   new price (this also resolves the long-open D29 sign-off).**

---

## Phase 0 — Honesty purge + narrow to the one job  ·  ~3–5 days · **William-side, no app-tier bottleneck**

The unanimous day-one, no-regrets move. Every finding here is also an App-review blocker regardless
of strategy.

| Item | Owner | Size | Gap |
|---|---|---|---|
| **Delete** (not flag-hide) the Speedhive mock — fabricated 1970-dated laps as a real detected run | W | S | #5 |
| **Delete** the fabricated Social network (invented drivers, palmarès, working Follow) — remove the 6th tab | W | S | #6 |
| Scope v1 to **1/8 off-road only** at app + engine surface — this also removes the 22 self-contradicting REVIEW-note rules (mostly on-road) from the shipped path *for free* | W | M | #11 |
| Strip any "AI"/over-claim copy — position as **deterministic, grounded-or-silent engineer** | W | S | — |
| Kill the two anti-steering copy blocks NOW (`OnboardingScreen.tsx:73-79`, `SettingsScreen.tsx:122-125`) — they're illegal and moot under "free v1" | W | S | #12 |

**Exit:** a fresh install surfaces zero fabricated data; only the 1/8-off-road honest core is
reachable; D18 intact; `validate-live` + eval + full suite green.

---

## Phase 1 — Reconnect the loop (the four joins, in order)  ·  ~3–4 weeks · **app-tier critical path**

The realism move that halves the app-tier work: **v1 enriches the already-mounted structured
EngineerHub surface — it does NOT mount the free-text chat** (`EngineerScreen`/`RaceEngineerChat`),
which mishears 87% of phrasings and is the fastest trust-killer at a race day. A picker cannot
misunderstand.

| Join | Item | Owner | Size | Gap |
|---|---|---|---|---|
| ② | Export + bundle `recommendTires`/`tireContextFromTags` from engine `index.ts` (trivial; currently unreachable) | W | S | #2 |
| ① | **Model picker** feeding registry ids into `ContextBundle` — unlocks the 237-model gating | T | L | #7 |
| ① | Union `surfaceToTags` + `powerTypeToTags` into `ContextBundle.track.conditions` so advice becomes condition-specific | T | M | #3 |
| ② | Enrich EngineerHub: show the **tire-advisor pick** + make the report read the **real selected model + conditions** (this is the proof gap #3 is fixed) | T | M | #2,#3 |
| ③ | **"Apply recommendation to sheet"** button on the report verdict card — closes the loop; tag the version with the rule id | T | M | #9 |
| ④ | Fix run-form data loss on tab switch (draft persistence) | T | S | #10 |
| — | **CI guard:** a deterministic regression eval that FAILS the build if a filled sheet ever again produces byte-identical advice to an empty one — permanently locks gap #3 | W | S | #3 |

**Exit:** the same symptom on two different cars/conditions yields *different* grounded advice; a
racer goes symptom → advice → applied-sheet in-app without hitting a blank sheet or a lie.

---

## Phase 2 — Real content, narrow & deep  ·  ~1–2 weeks · **William-side, overlaps Phase 1**

Precision for cars that matter beats breadth of blank sheets.

| Item | Owner | Size | Gap |
|---|---|---|---|
| Pick the **target club**; enumerate the ~8–15 1/8 off-road chassis its racers actually run | W | S | — |
| Extract **kit baselines** for JUST those chassis via the existing pipeline — the ~12 that matter, not all 237 | W | L | #7 |
| One-line `resolveTemplate` fix so a picked model resolves to its real per-model template | W | S | #7 |
| Expand NLU/symptom coverage for the top ~20 real 1/8 off-road complaints, tested | W | M | #8 |
| Fix the wing-field naming mismatch (6 rules dark for 67/68 1/8 models incl. the only jump rule) | W | S | audit |

**Exit:** every chassis that will be at the race day opens a **real baseline sheet**; the top real
complaints are all understood; suite green.

---

## Phase 3 — Field-validate the moat (reach the north star)  ·  ~1–2 weeks · **calendar-gated by the club's race day**

Spend **nothing** on store accounts yet. This is the go/no-go for the whole business.

| Item | Owner | Size |
|---|---|---|
| Free Android side-load build (free Expo account — no Google Play, no Apple $99) | T | M |
| Local-only capture (D18-safe): question asked · advice given · applied? · one-tap "did this help?" | T/W | M |
| **Show the real (re-priced) plan + a real commitment ask** ("reserve your season pass") — the willingness-to-pay test | W | S |
| Put it on ~5 phones at the club; **William present** to observe + interview | W | S |
| Debrief: every refused/mis-answered question → ranked next backlog | W | S |

**Exit = the north star:** ≥5 used it at a real race day, ≥3 made a revealed pay-commitment, every
failure captured.

---

## Phase 4 — Decide, then (only if proven) launch hygiene  ·  conditional

Field proof — not hope — authorizes the first money spent.

| Item | Owner | Size |
|---|---|---|
| **Go/iterate gate** on the north-star result. Not met → loop back to captured failures; do NOT proceed to store | W | S |
| ONLY if proven: launch-hygiene bundle — `eas.json`, `ios.bundleIdentifier`/`android.package`, camera/location/photo purpose strings, privacy policy + App-Privacy/Data-safety, in-app account deletion | T | L |
| ONLY if proven: choose the **compliant** monetization shape (native IAP/StoreKit+RevenueCat is the store-legal path; external-web is not, EU or US) | W+T | L |
| ONLY if proven + real buyer signal: William opens store accounts, ratifies final price | W | human |

**Exit:** a signed go/iterate decision recorded; any store-account or money spend happens strictly
against real field proof.

---

## The cut list (explicitly NOT for v1)

- **Free-text AI chat** — ship the structured picker; revisit only after NLU is proven on real questions.
- **All Social/feed/follow + Speedhive** — delete, don't flag-and-forget.
- **On-road entirely** — v1 is 1/8 off-road only (also removes the weakest, self-contradicting rules).
- **Paywall / `packages/account` / purchase path** — never gate a free field trial; proof precedes pricing.
- **Backend server / cloud backup / export** — 100% on-device *is* the moat for v1.
- **225+ of the 237 car baselines** — only the ~12 chassis that will be at the target club.
- **Store accounts + any money spend** — behind the Phase-4 gate (William's reserved authority).

---

## The #1 risk, named and mitigated: Théo is the single point of failure

Every join in Phase 1 is React Native work, and that zone has been frozen since **2026-06-19 (~5
weeks)**. If the app tier stays dark, the 30/30 engine stays unreachable no matter how strong it is.

**Mitigations, in priority order — this is the #1 program action, before any code:**
1. **Re-engage Théo, or explicitly reassign the RN wiring.** No plan survives a frozen critical path.
2. **Scope every app-tier item to the smallest possible RN surface** — enrich the already-mounted
   EngineerHub, do NOT build new navigation or mount the chat.
3. **Push every mechanical edit to William's Claude** — Phase 0 (deletions, scope, copy), the engine
   exports, the CI guard, all content, and `resolveTemplate` are William-landable today; only the
   picker / tag-union / apply-button / draft-persistence genuinely need the app engineer.

---

## Pricing recommendation (for the D29 sign-off)

| | Incumbent (So Dialed) | RaceLab proposed | **Recommended** |
|---|---|---|---|
| Monthly | $4.99 | €9.99 | — (annual-first) |
| Annual | $39.99 | €99.99 | **€39–49/yr** ("one set of tires") |
| Lifetime | — | — | **€19.99** (matches the RC-AI-Mechanic anchor) |

Framed against a racer's real spend (~$1,400–2,000/season, ~$65–86 per tire set), a season pass that
saves one wrong tire choice pays for itself. The premium is only defensible if RaceLab demonstrably
does the three things the incumbent's LLM fails at: **never invents a number, works with zero
signal, and knows the racer's exact car** — which is exactly what Phases 1–2 deliver.
