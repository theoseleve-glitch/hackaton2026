# Retention Redesign — `INPUT_GUESS` template

**Author:** senior party-game designer (retention-first pass)
**Date:** 2026-06-14
**Template:** `INPUT_GUESS` — `packages/games/input-guess/`
**Games on template:**
- `quizz-culture-ge` — **Au Pif ! / Ballpark!** — mode `closest-number` (`QUIZZ_CULTURE_GE_CONFIG`)
- `cinquante-cinquante` — **Cinquante-Cinquante / Fifty-Fifty** — mode `crowd-target` (`CINQUANTE_CINQUANTE_CONFIG`)

This brief is grounded in the actual reducer (`input-guess.ts`), `state.ts` (configs/views), `actions.ts` (wire schema), and the two shipped content packs (156 + 132 items). Where the design docs and the code disagree, **the code is authoritative** and I call the drift out.

---

## 0. The EXACT current loop (read from code, not docs)

### `closest-number` (Au Pif!)
- **`guess`** (`phaseKey: guess:r{n}`), `guessMs = 20_000`. Numeric keypad, integers 0..999,999,999 (`maxInputDigits: 9`). Submission → hidden `submissions` buffer. View exposes only `hasSubmitted: Record<PlayerId,boolean>` + own `mySubmission`. **`earlyAdvanceOnAllSubmitted: true`** → resolves the instant every *connected* player has submitted.
- **`reveal`** (`reveal:r{n}`), **`revealMs = 6_000`** in code (docs say 12_000 — **DRIFT, see R-DRIFT**). Atomic promote: all guesses + `answer` + `funFact` + per-player points become public. `round_revealed` on entry, `round_completed` on deadline exit (ad cue).
- **`over`** (untimed). Podium off cumulative `scores`. No reducer tiebreak; placement→XP upstream.
- Scoring: competition rank `pointsByRank: [100,50,25]`; `+50` exact (`d===0`); final round `×2`. `bustIfOver:false` (inert). `totalRounds: 8`.

### `crowd-target` (Cinquante-Cinquante)
- **`guess`** (`phaseKey: pick:r{n}`), `pickMs = 25_000`. Stem + announced `targetYesPct` (public from pick on) + `cardsPerRound = 6` cards (id+text only; `crowdYesPct` stripped). Tap ONE card → hidden buffer (display index). Early-advance is **always on** for crowd-target (`earlyAdvance()` returns true for the mode unconditionally).
- **`reveal`** (`reveal:r{n}`), **`revealMs = 6_000`** (docs say 12_000 — **DRIFT**). Cards flip to `crowdYesPct` + `distance`; scoring applied.
- **`over`** (untimed).
- Scoring per card `d = |crowdYesPct − targetYesPct|`: closest (min-d) pickers `+3`; second-distinct-d pickers `+1`; bullseye (min-d ≤ `bullseyeWindowPct=2`) adds `+2`. Only pickers score; non-pickers 0; ties pay all pickers full. `totalRounds: 7`.

### What a player actually *does* each phase
1. Read prompt → input ONE value (type a number / tap one card).
2. Wait. **After submitting, the player does nothing until the phase ends.**
3. Watch the reveal (6s).
4. Repeat 7–8×, then podium.

That step-2 wait is the single biggest retention hole on this template.

---

## 1. Lever scorecard (0–5, evidence from code)

| # | Lever | closest | crowd | Evidence |
|---|---|---|---|---|
| 1 | **No dead time** | **2** | **2** | One action per round, then idle. `earlyAdvanceOnAllSubmitted` only helps when *everyone* is fast; one slow/AFK player pins the whole table at a `hasSubmitted` board for up to 20–25s. Reveal is a passive watch. No reactive beat anywhere. |
| 2 | **Legible stakes/scoring** | **4** | **3** | closest: "closest wins, exact = scream" is instantly legible; `pointsByRank` flat top-3 reads clean. crowd: "+3/+1/bullseye+2 vs a *second-distinct* distance" is **not** legible mid-pick — players can't tell why they got +1 not +3. Running `scores` shown both. |
| 3 | **Payoff beats** | **3** | **3** | The number-line slam / card-flip is genuinely good. BUT `revealMs:6_000` (code) is **half** the designed 12s — the "no way" argument gets cut off. funFact/incriminating-stat is the engineered laugh; quality is uneven (47% of funFacts read drier — §5). |
| 4 | **Tension & comeback** | **3** | **2** | closest has `×2` finale (real comeback lever) + flat payouts (swingy). crowd has **nothing**: flat +3 every round, no finale multiplier, no catch-up → a strong crowd-reader runs away by round 4 and rounds 5–7 are dead rubbers. |
| 5 | **Social fuel** | **2** | **3** | crowd's incriminating stat ("62% stalk their ex, you're six") is the strongest social hook on the template. closest is solitaire-ish: you guess a number, you were wrong, mild. Neither has call-outs, accusations, or "who guessed THAT" surfacing in the reveal data even though `guesses`/`picks` are fully public at reveal. |
| 6 | **One-more-round pull** | **1** | **1** | **Nothing.** No streaks, no escalating spice, no cliffhanger, no micro-unlock between rounds. The loop ends at `over` and relies entirely on the session shell's XP. Within a match there is zero "I need the next round" hook. |
| 7 | **Onboarding by doing** | **4** | **3** | closest: type a number — needs zero rules. crowd: "pick the card closest to the target %" is learnable in one round but the *scoring* (second-distinct, bullseye window) is opaque on round 1; players learn it only after a confusing reveal. |
| 8 | **Replay variety** | **4** | **3** | closest: 156 items, seed-shuffled, 8/match → deep. crowd: 132 items but burns harder (once you've seen the %s the round is dead) and target distribution is skewed (14 extreme / 71 mid / 47 coin — the 95/5 signature is underweight). |
| 9 | **Pace per phase** | **3** | **3** | 20s/25s collect is fine→slightly long for a single tap; reveal at 6s is **too short** for the argument. No mid-phase rhythm. |

**Template-wide verdict:** the *inputs* are sticky and legible; the *between-input* experience is dead. The template loses players to **dead time (L1)** and **zero one-more-round pull (L6)**, and `crowd-target` additionally has a **runaway-leader (L4)** problem. The reveal is good but **shipped at half its designed length (R-DRIFT)**, kneecapping the one payoff beat that exists.

---

## 2. Retention risks (ranked)

1. **`revealMs: 6_000` ships at half the designed 12_000 (both configs).** The reveal is the *only* payoff/social beat in the loop and it's cut in half. Highest-ROI fix on the whole template. (`state.ts:117`, `state.ts:130`.) — *severity: high*
2. **Post-submit dead time.** After acting, players idle 14–24s watching a boolean board. No reactive beat. — *severity: high*
3. **`crowd-target` runaway leader / dead-rubber rounds.** Flat +3, no finale multiplier, no comeback → strong reader locks the match by round 4. — *severity: high*
4. **No one-more-round pull inside a match.** No streak/escalation/cliffhanger; relies 100% on the shell. — *severity: high*
5. **crowd scoring not legible at decision time.** "Second-distinct distance" and bullseye window are invisible while picking; players can't form a strategy. — *severity: med*
6. **Reveal data wasted as social fuel.** `guesses`/`picks` are fully public at reveal but nothing surfaces "who was wildest / who nailed it / TOI t'as voté ça?!" — the call-out is the product (voice guide §1.4, §4.6) and it's unbuilt. — *severity: med*
7. **Content drift toward bland/AI in the tails.** ~47% of Au Pif funFacts lack a roast-pronoun/drop; longest crowd completion 88 chars (over the 60 ceiling); extreme targets underweight. — *severity: med*
8. **`bustIfOver` path is dead weight** (inert in config) — not a risk, but a free "Juste Prix" tension lever sitting unused. — *severity: low*

---

## 3. Proposed mechanic changes

Each change names: lever, impact, risk, code scope, test impact, priority. All respect the pure `GameModule` contract (server-authoritative, per-viewer redaction, seeded RNG, reject-by-same-reference, no runtime AI). None require a new effect type — the ad still fires off `phaseKey → over`.

### P0 — build first (high impact, low/med risk)

#### P0-1 — Fix `revealMs` drift: 6_000 → 12_000 (both configs)
- **What:** restore the designed reveal length so the funFact / incriminating-stat / number-line argument actually lands. One-line constant change each.
- **Lever:** 3 (payoff), 5 (social), 9 (pace). **Impact: high. Risk: low.**
- **Code scope:** `state.ts` `QUIZZ_CULTURE_GE_CONFIG.revealMs` and `CINQUANTE_CINQUANTE_CONFIG.revealMs`. No reducer change (`phaseDurationMs` already returns `config.revealMs`).
- **Test impact:** trivial — update any test asserting `phaseDurationMs` at reveal; deadline-advance tests use the value abstractly, no logic change.
- **Note:** keep host-tunable `revealMs` range (8_000–20_000) from the docs. Ship 12_000 as the default; 10_000 acceptable if telemetry shows drag.

#### P0-2 — Live submission ticker instead of a boolean board (kill dead-time waiting)
- **What:** during `guess`, the view already exposes `hasSubmitted`. Add a **count + ordinal of locked-in players** so the table feels a live race ("4/6 verrouillés… Léa first, you're last"). No secret leak — `hasSubmitted` is already public; we only add a derived count/order field. Client renders it as a filling pressure bar with a "last to lock loses face" tone (spicy-0 social pressure, voice §1.8).
- **Lever:** 1 (dead time), 5 (social). **Impact: high. Risk: low.**
- **Code scope:** `view()` guess branch — add `submittedCount: number` and optionally `lockOrder: PlayerId[]` (derive from a new `submitOrder` field appended in `reduce` when a submission first lands; tiny state add to `InputGuessState`). Redaction-safe: order of *who locked in* is already implied by `hasSubmitted`; we never expose the value.
- **Test impact:** add `submitOrder` to state init (`emptyPlayerMap`→`[]`); assert ticker count increments and order is append-only; **redaction audit must confirm no `value`/`cardIndex` leaks** via the new fields.
- **Why low risk:** purely additive to the view; no scoring/timing change.

#### P0-3 — `crowd-target` comeback lever: finale `×2` + escalating-stakes rounds
- **What:** give crowd-target the same anti-runaway machinery closest already has. Add `finalRoundMultiplier` to `CrowdTargetConfig` (default 2) applied in `resolveCrowd`, and an **escalating points curve by round** (e.g. last two rounds worth more) so a round-4 leader can't coast. Simplest version: reuse the existing `multiplier` pattern from `resolveClosest` (round === totalRounds-1 → ×2).
- **Lever:** 4 (tension/comeback), 6 (one-more-round). **Impact: high. Risk: med** (balance — could overcorrect into "only the last round matters").
- **Code scope:** `state.ts` add `finalRoundMultiplier: number` to `CrowdTargetConfig` + config value; `input-guess.ts` `resolveCrowd` — compute `multiplier` exactly like `resolveClosest` and apply to `pts`. ~6 lines.
- **Test impact:** new reducer tests: finale doubles crowd points; non-finale unchanged; bullseye+finale stacks correctly (`(3+2)×2`). Update worked-example expectations.
- **Mitigation for the balance risk:** ship `finalRoundMultiplier: 2` (matches closest, already proven swingy), NOT a steeper curve, and gate promotion on score-blowout telemetry per the docs' D10.

#### P0-4 — Reveal "table awards" — surface the call-out from public reveal data
- **What:** the reveal already has every `guess`/`pick` public. Derive 2–3 **named superlatives per round** from existing data and put them in `lastResult` (no new secrets): closest → `"Pile !"` already exists; add `wildest` (max `|guess−answer|`) and, for crowd, `mostFooled` (picked the worst card) + `lone-genius` (only picker of the closest card). Client renders "TOI t'as guessé 3 millions ?!" — the eye-contact moment the voice guide calls the highest-value beat (§1.4).
- **Lever:** 5 (social), 3 (payoff), 6 (one-more-round). **Impact: high. Risk: low.**
- **Code scope:** `input-guess.ts` `resolveClosest`/`resolveCrowd` — compute `wildest`/`loneGenius` from the already-built `ranked`/`picks` arrays; add fields to `ClosestRoundResult`/`CrowdRoundResult` in `state.ts`; expose via existing reveal view (already passes `result`).
- **Test impact:** deterministic — assert `wildest`/`loneGenius` selection (ties → roster order, same stable-sort convention already used). No redaction concern (reveal is fully public).

### P1 — high impact, higher risk (or med impact, low risk)

#### P1-1 — In-match streak / "on fire" multiplier (one-more-round hook)
- **What:** track per-player consecutive top-finishes (closest: rank-0 finishes; crowd: closest-card hits). 2-in-a-row lights a streak; 3+ grants a small `streakBonus` and a client "🔥 En feu" tag. This is the missing **one-more-round pull** — players chase/break streaks.
- **Lever:** 6 (one-more-round), 4 (tension). **Impact: high. Risk: med** (another runaway vector if bonus is large).
- **Code scope:** `InputGuessState` add `streak: Record<PlayerId, number>`; update in `resolve*`; add `streakBonus` config (small, e.g. +20 closest / +1 crowd) and expose `streak` in the reveal view. Resets on a non-top round.
- **Test impact:** streak increments/resets; bonus applied; redaction — `streak` is public (fine).
- **Mitigation:** keep the bonus *small* (flavor, not a score driver) and cap at one streak tier; the *feeling* of the streak tag does the retention work, not the points. Ship behind a config flag; A/B the bonus size.

#### P1-2 — Two-stage reveal pacing (suspense before the slam)
- **What:** split the reveal into a 1.5s "incoming…" hold (cards face-down / answer hidden, guesses already on the line) then the slam, all inside the same `reveal` phase via client animation timing off `revealMs`. No reducer change — purely a client-render contract using the longer `revealMs` from P0-1. Documented here because it's the payoff-beat design intent.
- **Lever:** 3 (payoff). **Impact: med. Risk: low.**
- **Code scope:** none in the module (client-side animation budget). Spec note only.
- **Test impact:** none at reducer level.

#### P1-3 — Make crowd scoring legible at pick time
- **What:** during `pick`, show the **bullseye window** and "+3 closest / +1 next / +2 bullseye" rule as a persistent legend (client), and at reveal annotate each card with *why* it scored. The data exists (`bullseyeWindowPct`, `distance`); only the view legend is missing. Optional reducer support: expose `bullseyeWindowPct` in the guess view.
- **Lever:** 2 (legible stakes), 7 (onboarding). **Impact: med. Risk: low.**
- **Code scope:** `view()` crowd guess branch — add `bullseyeWindowPct` to the projection. Mostly client.
- **Test impact:** view-shape assertion; no logic change.

### P2 — nice-to-have / experimental

#### P2-1 — Ship the "Juste Prix" sibling (`bustIfOver: true`) as a config-only variant
- **What:** the reducer path already exists and is *inert*. A themed sibling config flipping `bustIfOver:true` adds price-is-right over-bid tension to closest-number for zero code. Roadmap v2 per the docs.
- **Lever:** 4 (tension), 8 (variety). **Impact: med. Risk: low.** **Code scope:** new config export only. **Test impact:** the `busted` path is already coded but untested in production config — add coverage before shipping the sibling.

#### P2-2 — Per-player early-advance grace (soften the AFK pin)
- **What:** today one slow player pins the room to the full deadline. Experimental: a shorter "stragglers" sub-window once ≥75% have locked in (client countdown nudges late players; reducer still resolves on `allActed` or deadline). Reduces the worst dead-time case.
- **Lever:** 1 (dead time), 9 (pace). **Impact: med. Risk: med** (feels rushed if mistuned). **Code scope:** client-driven nudge + optional shorter effective deadline via `phaseDurationMs` is risky (changes determinism contract subtly) — keep client-only at first. **Test impact:** none if client-only.

#### P2-3 — Spicy-1 sibling packs (content-only, no code)
- **What:** both games escalate naturally (Au Pif → saucier records; Cinquante → after-dark crowd %s). Separate pack ids, `minAge 18`, byte-identical reducer. Pure content op. **Lever:** 6, 8. **Impact: med. Risk: low.** **Code scope:** none. Build on demonstrated demand.

---

## 4. Concrete timing proposals (ms per phase)

| Game | Phase | Current (code) | Proposed | Why |
|---|---|---|---|---|
| both | reveal | **6_000** | **12_000** | P0-1. Restore the designed argument/payoff beat; it's currently half-length. Host range 8k–20k. |
| Au Pif | guess | 20_000 | **16_000** | A single number-type rarely needs 20s; tighten to keep energy. Early-advance already shortcuts fast tables. |
| Cinquante | pick | 25_000 | **22_000** | 6 cards + target to read justifies more than Au Pif, but 25s drags once the table groks the format. Pair with P1-3 legend so 22s is comfortable. |
| both | reveal (2-stage) | n/a | 1_500 hold + ~10_500 argument | P1-2, inside the 12_000 — client-side, suspense before the slam. |

Collect-phase cuts are **med confidence** — validate against abandon telemetry before locking; the reveal fix is **high confidence, ship immediately**. All remain inside the documented host-tunable ranges.

---

## 5. Writing-polish priorities

The content is the retention engine for this template (replay variety + payoff beats live in the pack, not the reducer). Priorities:

### Au Pif (`quizz-culture-ge`) — funFacts must ALL end on a drop
- **Problem:** ~47% of funFacts (74/156) read drier — provenance/explanation without a roast-pronoun or punch drop. The voice (§5.4) is "smug-encyclopedia, every funFact ends on a drop." A funFact that just states the answer + source is the AI-tell.
- **Action:** audit-rewrite the dry tail so every funFact closes on a verdict aimed at the player's guess or the world. Keep the verified `answer`/`source` untouched (those are load-bearing trust); rewrite only the funFact prose.
- **Also:** D1 difficulty sits exactly at the 24-item floor — author a ≥6-item buffer before promoting past rolloutPct 5 (content-ops, not code).

**Example rewrite (dry → drop):**
> BEFORE: « 1 665 marches. Le public n'a droit qu'à l'escalier jusqu'au 2e étage — au-delà, même tes mollets disent merci à l'ascenseur. »
> AFTER: « 1 665 marches. Le public s'arrête au 2e — le reste, c'est en ascenseur. T'avais dit 400 ? Cheh, t'es essoufflé rien qu'en y pensant. »

(Adds the §1.4 call-out on the *guess*, not just the world. Note: the reveal now knows each player's actual guess via P0-4 — the funFact template can interpolate "T'avais dit {wildest}" client-side for the named roast.)

### Cinquante (`cinquante-cinquante`) — escalation + legibility + extreme targets
- **Problem 1 (escalation):** completions must escalate "universal → indefensible" (§5.5). Several items plateau (all six cards equally mild) — the comedy dies if the last card isn't the most incriminating.
- **Problem 2 (length):** longest completion is 88 fr chars (ceiling is ~60). 6 long cards in 22–25s on a phone is the readability edge — lint completion length ≤60/locale; trim or drop to 5 cards (host-tunable) for long-card items.
- **Problem 3 (distribution):** extreme targets underweight (14/132). The 95/5 signature ("aim for 5% YES") is the most argument-generating target — author the next pack toward the ⅓/⅓/⅓ lint.
- **Action:** rewrite reveal copy to weaponize numbers against the room (§5.5: "62% stalkent leur ex. Vous êtes six. Faites le calcul."). The reveal currently shows %s but the *caption* is generic — that caption is the payoff and should be an attackable provocation.

**Example rewrite (plateau → escalation, with the incriminating drop):**
> BEFORE stem « Honnêtement, j'ai déjà… » last card: « …secrètement espéré qu'un pote se plante » (yes 38%)
> AFTER (sharpen the last card to indefensible + a reveal caption): card « …secrètement espéré qu'un pote rate son date pour pouvoir le raconter » + reveal caption « 38% l'ont avoué. Vous êtes six à table. Regardez-vous. »

(Last card is now the most incriminating; reveal caption is a §4 call-out, not a summary.)

### Cross-cutting
- Kill the AI-tells from voice guide §1.12 in any tail items: no Title Case, no 😂, no "quelque chose de coquin" coyness, no explained jokes.
- FR/EN must be **transcreated not translated** (§6) — re-estimate crowd %s per locale; Au Pif units localized (km↔miles, already mostly done).

---

## 6. KEEP AS-IS (do not touch — these are already sticky)

Change-for-its-own-sake hurts a working game. Leave these alone:

- **The numeric-keypad / single-card-tap input.** Zero-text → zero moderation surface → instant onboarding-by-doing. This is the template's structural genius (L7). Do not add free text to the base modes.
- **`pointsByRank: [100,50,25]` flat competition ranking (closest).** Keeps rounds swingy at any player count; legible. Verified in reducer tests. Don't curve it.
- **`finalRoundMultiplier: 2` (closest).** The proven comeback lever — copy it to crowd (P0-3), don't replace it.
- **`+50` exact "Pile !" bonus.** The engineered scream moment (L3). Untouchable.
- **Hidden-buffer + atomic-reveal redaction.** `answer`/`funFact`/`crowdYesPct` as value-secrets until reveal is the entire payoff mechanic. Per-viewer redaction is correct and audited. Never weaken it.
- **Seed-shuffled pool + per-round card display order fixed at init.** Determinism + no-repeat-within-session is correct (L8). Don't reshuffle mid-match.
- **Presence handling** (`playerLeft`/`playerRejoined`, `allActed` over `connectedPlayers`, same-reference rejection). An absent player never blocks the room — this is load-bearing and correct.
- **The incriminating-statistic fantasy (crowd) and estimation-hubris fantasy (closest).** The room fantasies are strong; all my changes amplify the existing reveal, none replace the core loop.
- **`reject-invalid-event → same state reference`** contract throughout. Don't add side effects to rejection paths.

---

## 7. Ship order (one paragraph)

Ship **P0-1 (revealMs fix)** today — it's a two-constant change that restores the only payoff beat to its designed length and is pure upside. Then **P0-2 (live ticker)** and **P0-4 (table awards)** to kill dead time and turn the reveal into the social call-out the voice guide demands, both additive-to-view and redaction-safe. Then **P0-3 (crowd finale ×2)** to fix the runaway-leader dead-rubber problem in cinquante, with a reducer test for the doubled-points path. P1-1 (streaks) is the highest-value *one-more-round* lever but carries balance risk — ship it behind a config flag and A/B the bonus size. Content rewrites (§5) run in parallel as a Cadence-B pipeline op (no deploy): they are the long-tail retention driver and the funFact/escalation drift is the slow churn risk. Leave §6 alone.
