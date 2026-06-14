# Retention Redesign — `rule-hunt` (Trouvez la Règle / Find the Rule)

**Template:** `RULE_HUNT` · **Games on it:** `trouvez-la-regle` (sole inhabitant, spicy-0)
**Code:** `packages/games/rule-hunt/src/{state,rule-hunt,round,actions,index}.ts`
**Pack:** `content/packs/trouvez-la-regle.json` (63 items, 21 gesture / 21 verbal / 21 social; 7 decoys each)
**Author:** senior party-game design, retention-first pass
**Date:** 2026-06-14

---

## 0. TL;DR — the honest verdict

`trouvez-la-regle` is the **most mechanically ambitious and best-written game on the platform**, and also the one with the **single biggest retention hole**: a 180-second `live` phase in which **the two/one detectives have almost nothing to do and the followers have no scored reason to act at all**. The core loop (conspiracy performs → someone snitches → the snitch IS the clue) is genuinely brilliant on paper. The problem is that the *reducer* only models the snitch/tribunal/guess events — the **3 minutes of "perform the rule" between interrupts is unmodelled, unprompted, and unscored**, so in practice the room can sit and do nothing and the game still "works" mechanically while dying socially.

The redesign is therefore **not** a rewrite. It is: (1) **kill the dead air in `live`** by giving the engine periodic *prompted micro-moments* that force every follower to perform (the rule has nothing to bite on otherwise); (2) **fix the detective's idle-watching problem** with a cheap "heat" read so they always have a decision; (3) **re-pace the phases** (the shipped `revealMs` is a 6 s blur that throws away the best payoff beat in the game); (4) **add a one-more-round hook** (the crime-parfait streak is computed but never surfaced); (5) tighten the small content gaps. The brilliant parts — the tribunal-as-clue betrayal, public detectives, the softened scoring, the banked clock — **stay untouched**.

**Headline finding (must-fix before anything else):** `state.ts` ships `revealMs: 6_000` but the design doc, the by-game spec, and §6 of the same doc all say `12_000`. The reveal is *the* "ohhh / vendu par les tiens" payoff beat and it currently lasts 6 seconds. This is a one-line P0.

---

## 1. The EXACT current loop (grounded in the reducer)

Per round (3 rounds, detectives rotate via hidden `detectiveOrder`):

| Phase | `phaseKey` | Duration (shipped) | What each player actually does |
|---|---|---|---|
| **briefing** | `briefing:r{r}` | `briefingMs` 20 s | Detectives announced publicly. Each connected **follower** reads `myRule` and taps `ackRule`. **Detectives sit and wait** (inert — `if (isDet) return same state`). Early-exit on `allActed`. |
| **live** | `live:r{r}:s{seg}` | `liveRemainingMs` (banked, starts 180 s) | **THE HOLE.** Free play. The *only* reducer-recognised events are `accuse` (follower, 1 token) and `openGuess` (detective). There is **no prompt, no per-player action, no scored beat** for the 3 minutes between interrupts. Followers are *supposed* to perform their rule, but nothing in the engine asks them to, times them, or rewards them. Detectives watch. |
| **tribunal** | `tribunal:r{r}:i{n}` | `tribunalMs` 25 s | Eligible followers (`eligibleVoters`: connected, alive, not-accused) tap `tribunalVote` guilty/notGuilty. First vote locks. Detectives **cannot** vote (by design — *who* is accused is their clue). |
| **guess** | `guess:r{r}:i{n}` | `guessMs` 20 s | Opening detective only taps `pickCandidate` on the 8-grid. Correct → reveal `guessed`. Wrong → grey it, spend 1 of 3 shared `teamGuesses`, resume live. |
| **reveal** | `reveal:r{r}` | `revealMs` **6 s (BUG: spec says 12)** | Rule + outcome + per-player points. `scoreRound` applied on entry. `round_completed` fired. |
| **over** | `over` | null | `gameOver(scores)`; shell ranks → placement XP. |

**Scoring (`scoreRound`):** `guessed` → det +4, surviving follower +1, eliminated +0. `timeUp & perfect` (0 convictions) → det +1, follower +3. `timeUp & not perfect` → det +1, surviving +2, eliminated +1. Tribunals and wrong guesses move **no points directly**.

**The structural truth:** the reducer is a *near-perfect model of the interrupts* and a *complete non-model of the performance*. Everything dramatic (snitch, vote, guess, reveal) is engine-driven and tight. The thing the game is actually *about* — twelve people overacting a secret rule — happens entirely outside the state machine. That's where retention leaks.

---

## 2. Retention scorecard (0–5, evidence from real code)

| # | Lever | Score | Evidence |
|---|---|---|---|
| 1 | **No dead time** | **1** | `live` is 180 s where, in code, a follower with their token unused does literally nothing the reducer sees, and a detective's only action is `openGuess`. `reduce` has no per-tick follower beat. The whole *point* of the game (performing) is unmodelled and unprompted. This is the lever the game fails hardest. |
| 2 | **Legible stakes & scoring** | **3** | Scoring is exact and asymmetric, but it's only legible at `reveal` (6 s). During `live`, a follower has **zero scored reason to perform** — perfect-round +3 is invisible until the end, and nothing tells you the room is "clean" right now. Stakes are real but hidden until too late. |
| 3 | **Payoff beats** | **2** | The reveal *content* is great (`vendu par les tiens`, true-index highlight) but `revealMs: 6_000` guillotines it. `lastTribunal` (the "TOI t'as voté ça?!" tally) is published but flashes by inside a resumed `live`. The two best "no way" moments are under-timed. |
| 4 | **Tension & comeback** | **4** | Genuinely strong. Detective rotation (`pickDetectives`) means a trailing player becomes a +4-eligible detective next round; softened scoring (D5) prevents runaway; tie/zero-vote = not guilty prevents grief snowball. Banked clock keeps every round live. Minor: a follower who's never picked as detective caps at +3/round. |
| 5 | **Social fuel** | **4** | The tribunal-as-clue betrayal is the best social engine on the platform. `accuse` names a victim, `lastTribunal` exposes the tally. Limited only because it fires *occasionally* (1 token/follower) instead of as a steady beat. |
| 6 | **One-more-round pull** | **2** | `infractions`/`perfect` are computed but **never streak-surfaced**. A "crime parfait" is the bragging prize the design names — and nothing tracks it across rounds or teases the next. No escalation, no cliffhanger between rounds. |
| 7 | **Onboarding by doing** | **3** | `ackRule` (read + tap) is a decent "learn by reading your rule" beat, but the *detective* learns nothing by doing in briefing (inert), and a first-time follower has no idea *when* to perform once live starts — there's no first prompt. |
| 8 | **Replay variety** | **4** | 63 items × 3 rounds = low collision; gesture/verbal/social mix; difficulty range; rotation reshuffles roles. Excellent. Only risk: the *structure* of every round is identical (briefing→cruise→maybe snitch→reveal), so variety is content-deep but loop-shallow. |
| 9 | **Pace per phase** | **2** | `liveMs 180_000` is too long for a phase with no forced beats (drags); `revealMs 6_000` too short for the payoff (rushed). `briefingMs 20_000` is fine. The pace is inverted: long where empty, short where rich. |

**Weighted read:** the game is an A on social/tension/variety and a D on no-dead-time/pace/one-more-round. Every P0 below targets the D's without touching the A's.

---

## 3. Retention risks (ranked)

| Lever | Problem | Severity |
|---|---|---|
| No dead time | `live` (180 s) is unmodelled performance time: the reducer asks nothing of followers and gives detectives one button. In a real room with a shy table this is 3 minutes of "…so are we doing the thing?" | **high** |
| Pace per phase | Pacing is inverted: dead air is long (`liveMs`), payoff is short (`revealMs 6 s`, contradicting the spec's 12 s). | **high** |
| One-more-round pull | `perfect`/`infractions` are computed and discarded each round; no streak, no escalation, no cliffhanger drives the next round. | **high** |
| Payoff beats | The reveal and the tribunal tally — the two engineered "no way" moments — are under-timed / buried in a resume. | **med** |
| Legible stakes | Followers can't see "the room is still clean (+3 on the line)" during `live`; the incentive to keep performing cleanly is invisible until reveal. | **med** |
| Onboarding | Detective is inert in briefing; no first-action teaches the live loop; the *single biggest concept* ("everyone is secretly doing a thing") is never demonstrated, only described. | **med** |
| Eliminated-player boredom | D13 accepted: a convicted follower spectates the rest of `live`. With 180 s rounds that's a long bench; the engine offers them nothing (no ghost beat). | **low** (short rounds cap it) |

---

## 4. Proposed mechanic changes (scoped, prioritised)

> Design constraint honoured throughout: **pure module**, server-authoritative, **seeded RNG only**, per-viewer redaction preserved, invalid events return the SAME state reference, no runtime AI. Every new beat is **deadline-driven** (the shell already arms `phaseDurationMs`), so nothing introduces a wall clock.

### P0 — build first (high impact, low/med risk)

**P0-1 · Fix the reveal duration (the 6 s bug).**
`revealMs: 6_000` → `12_000` in `TROUVEZ_LA_REGLE_CONFIG`. The spec, by-game doc, and §6 host table all say 12 s; the shipped constant is half that, and it's the game's best payoff beat. One-line change.
*Lever:* payoff beats / pace. *Impact:* high. *Risk:* low. *Code:* `state.ts` (one constant). *Test:* update any reveal-duration assertion in `phases.test.ts`; no logic change.

**P0-2 · "Heat check" — a periodic forced performance beat inside `live` (THE fix).**
Add an engine-driven micro-round inside `live`. On a fixed cadence (every `heatMs`, default **22–25 s**), the shell arms a deadline; on that deadline the reducer enters a brief **`spotlight`** sub-state (reuse the phase machinery, new `phaseKey` `spotlight:r{r}:i{n}`, default `spotlightMs` **10 s**) that **names one random connected non-eliminated follower** (seeded: `rng('{seed}:spot:{round}:{n}')`) and forces a tiny reaction from everyone:
- The **spotlit follower** must perform on cue — UI prompt "Tu. Maintenant. Sans te griller." No tap required (performance is physical), but a `spotlightSurvive` self-ack is available.
- **Every other follower** taps a one-shot `flagBreak` (a *free, soft* "I think they just broke it" ping — distinct from the costly `accuse` token) OR `looksClean`. This is a **binary, instant, every-player beat** — the no-dead-time fix.
- The **detective(s)** get the same binary read but their tap is `noteSuspicious(target)` — a private bookmark, no elimination power, no clue leaked to the room (redacted owner-only).

Resolution: tally is **never** auto-convicting (keeps the tribunal as the only elimination path — D4/D5 intact); it just (a) keeps the room *doing something every ~20 s*, (b) optionally surfaces an aggregate "heat" number to the detective ("3 people flinched at Léa"), and (c) banks the live clock exactly like `accuse`/`openGuess` already do (`bank(state, at)`, `interruptSeq++`).

*Lever:* no dead time (primary), onboarding, legible stakes. *Impact:* **high — this is the game-saver.** *Risk:* **med** (new phase, new redaction surface for `noteSuspicious`, banked-clock interaction must re-pass replay tests). *Code:* `state.ts` (config `heatMs`/`spotlightMs`, `RuleHuntPhase` += `'spotlight'`, view variant, `RuleHuntState` spotlight fields + `noteSuspicious` map); `actions.ts` (3 new action kinds + zod); `rule-hunt.ts` (`enterSpotlight`/`resolveSpotlight`, `phaseKey`, `phaseDurationMs`, view redaction of `noteSuspicious` to owner only); `round.ts` (seeded spotlight pick helper). *Test:* new `spotlight.test.ts`; extend `clock.test.ts` (spotlight banks like accuse), `redaction.test.ts` (`noteSuspicious` owner-only, spotlight target public, others' flags hidden), `phases.test.ts` (live→spotlight→live cadence, deadline race).

**P0-3 · Surface the "room is still clean" stake during `live` (and spotlight).**
Add `infractions` and a derived `roomClean: boolean` + `perfectOnTheLine: number` (the +3 each follower is currently protecting) to the **live/spotlight views**. Followers currently can't see they're sitting on a perfect round; making the +3 visible turns silent cruising into active protection ("don't be the one who breaks it").
*Lever:* legible stakes, no dead time. *Impact:* high. *Risk:* low (view-only; `infractions` already in state; no new secret). *Code:* `rule-hunt.ts` view base; `state.ts` view type. *Test:* `redaction.test.ts` (the number leaks nothing — it's already-public conviction count), small `phases.test.ts` assertion.

**P0-4 · Crime-parfait streak surfaced + carried (one-more-round hook).**
The reducer computes `perfect` every round and throws it away. Add `cleanStreak: number` to `RuleHuntState` (incremented at reveal when `perfect && kind==='timeUp'`, reset on any conviction or `guessed`). Expose on the reveal + over views so the shell/UI can tease "2 crimes parfaits d'affilée. Un troisième = légende." into the next briefing.
*Lever:* one-more-round, legible stakes. *Impact:* high. *Risk:* low (one accumulator, no scoring change — placement XP untouched). *Code:* `state.ts` (field + view), `rule-hunt.ts` (`enterReveal`/`startRound`). *Test:* `scoring.test.ts` (streak increments/resets correctly across the 3 rounds), `redaction.test.ts` (public, fine).

### P1 — high impact, higher risk (or med impact, low risk)

**P1-1 · Give the detective a briefing job (onboarding-by-doing).**
Detectives are inert in `briefing` (`if (isDet) return same state`). Give them a one-tap `callOpeningRead` that privately logs a *pre-game suspicion* or simply a "Je surveille {seat}" focus pick — a zero-power warm-up that teaches the detective their role *by doing* before the clock starts, and seeds `noteSuspicious`. Early-exit still gated on follower `ackRule` only (a detective never blocks).
*Lever:* onboarding, no dead time. *Impact:* med. *Risk:* med (new briefing action, must not affect early-exit or leak). *Code:* `actions.ts`, `rule-hunt.ts` briefing branch + view. *Test:* `actions.test.ts`, `phases.test.ts` (detective ack never gates), `redaction.test.ts`.

**P1-2 · `liveMs` 180 s → 150 s default (and re-band 120–240).**
With P0-2 filling the air with ~6–7 spotlight beats, the round no longer needs 3 full minutes; 150 s tightens energy and shaves ~90 s off the session (3 rounds). Keep host-tunable.
*Lever:* pace. *Impact:* med. *Risk:* low (config + band; banked-clock math unchanged). *Code:* `state.ts` config + host band in `templateParamsSchema`. *Test:* `clock.test.ts` band/default assertions.

**P1-3 · Detective "heat meter" payoff at guess.**
When the detective opens a guess, show them the **aggregate** flag/note heat they've accumulated (counts only — never *who* flagged, never the rule). Turns the spotlight flags into a *legible deduction aid*, making the guess feel earned rather than a 1-in-8 stab, and rewarding followers who (riskily) flagged honestly.
*Lever:* legible stakes, payoff. *Impact:* med. *Risk:* med (redaction: aggregate-only, per-target counts, must not become a per-voter side channel). *Code:* `rule-hunt.ts` guess view; depends on P0-2. *Test:* `redaction.test.ts` (aggregate-only, no ballot leak), `guess.test.ts`.

### P2 — nice-to-have / experimental

**P2-1 · Eliminated-follower ghost beat (R3 from the roadmap).**
A convicted follower gets a passive `ghostReact` during subsequent spotlights (no scoring, flavour only) so the bench isn't dead for up to 150 s. Gated on abandon analytics per D13.
*Lever:* no dead time (bench). *Impact:* low. *Risk:* low. *Code:* spotlight view for eliminated viewers. *Test:* `presence.test.ts`, `redaction.test.ts`.

**P2-2 · "Double or nothing" final round (config-reachable escalation).**
Optional host preset: round 3 scores ×1.5 (engine-side, *internal* points only — placement XP stays comparable per M1.1/TK16, so this is presentation escalation, not a leaderboard distortion). Gives the last round a stakes cliff.
*Lever:* one-more-round, tension. *Impact:* low/med. *Risk:* med (must NOT leak into cross-game XP comparability — keep it internal-scale only). *Code:* `scoreRound` round multiplier behind a config flag. *Test:* `scoring.test.ts` (multiplier only on flagged final round; placement unaffected).

**P2-3 · `candidateCount: 10` hard-mode preset (R5).**
Already config-reachable but blocked on pack re-authoring to 9 decoys. Leave for a content pass.
*Lever:* replay variety. *Impact:* low. *Risk:* low (content-gated). *Code:* none (config). *Test:* none (pack lint).

---

## 5. Timing proposals (ms per phase)

| Phase | Current | Proposed | Why |
|---|---|---|---|
| briefing | 20 000 | **18 000** | Rule is ≤120 chars; 18 s reads + acks comfortably, early-exits anyway. Trim 2 s of dead start. |
| live (master) | 180 000 | **150 000** | P0-2 fills it with ~6 spotlight beats; 150 s is plenty and tightens energy (P1-2). Host band 120–240. |
| **spotlight (NEW)** | — | **10 000** | New forced micro-beat: name a follower, everyone flags/clean. Long enough to react, short enough to stay punchy. Cadence `heatMs` ≈ 24 000 between spotlights. |
| tribunal | 25 000 | **22 000** | Binary vote; 22 s debate keeps heat without dragging. Host band already 15–40. |
| guess | 20 000 | **18 000** | 8-tile tap; 18 s is ample, shaves stall risk. |
| reveal | **6 000 (bug)** | **12 000** | **The payoff fix.** Restore the spec value; let `vendu par les tiens` + the true-index highlight + the tally actually land. |
| over | null | null | Unchanged — shell owns the summary. |

Net session: ~3 rounds × (18 + 150 + reveals/interrupts) lands near the design's ~13 min target while removing all dead air.

---

## 6. Writing-polish priorities

The pack is, frankly, **the best-written content on the platform** — specific, register-correct, voice-guide-compliant (custody/interrogation metaphors throughout: *« Ta main droite est en garde à vue »*, *« comme un suspect qui va craquer »*). It is **not** the bland-AI problem the co-founder flagged elsewhere. So the polish here is surgical, not a rewrite:

| Area | Game | Action |
|---|---|---|
| **Reveal copy (chrome)** | trouvez-la-regle | The mechanic is rich but the *reveal/streak chrome* is where the snitch-economy voice must land and currently leans on the engine. Author explicit reveal strings keyed to outcome: perfect → *« Crime parfait. Ni vu, ni pris. »*; conviction → *« Vendu par les tiens. La règle survit quand même. »*; guessed → *« Coffré. Le flic a trouvé la combine. »* These are UI chrome (evergreen, no trend nouns), not pack items. |
| **Spotlight prompts (NEW chrome)** | trouvez-la-regle | The new forced beat needs sharp deadpan copy: spotlit follower → *« Toi. Maintenant. Fais le truc sans te griller. »*; flaggers → *« Elle a tiqué ? Balance-la (gratuit, cette fois). »*; detective heat → *« 3 personnes ont flinché sur Léa. Hasard ? »* |
| **Difficulty signposting** | trouvez-la-regle | 15 `hard` rules (e.g. *« Ne termine jamais vraiment tes phrases… »*) are great but can feel un-performable to a shy table. No copy change to the rules — instead a one-line **briefing nudge** per difficulty so the room knows the bar: easy → *« Facile. Personne a d'excuse. »* / hard → *« Niveau expert. Si tu te grilles, c'est mérité. Cheh. »* |
| **Streak tease (NEW)** | trouvez-la-regle | Next-briefing copy off `cleanStreak`: *« 2 crimes parfaits. Un troisième et vous entrez dans la légende du quartier. »* Arms the one-more-round pull. |

**Concrete rewrites (chrome, both locales — transcreated, not translated):**

1. **Reveal — perfect round** (currently engine-implicit, no authored line):
   - FR: *« Crime parfait. Zéro balance, zéro arrestation. La règle repart au frais. »*
   - EN: *"Clean getaway. Nobody snitched, nobody cracked. The rule walks free."*
   - *Why:* evidence→verdict with a period (§1.2), snitch-economy register (§5.16), zero trend-noun so it ages — and it finally rewards the +3 that was invisible all round.

2. **Spotlight — flagger prompt** (new beat, needs to feel free-and-petty vs. the costly accuse):
   - FR: *« Toi là, t'as vu Léa tiquer. Balance — c'est gratuit cette fois. Le tribunal, c'est plus tard. »*
   - EN: *"You saw that flinch. Drop the name — this one's free. Save the trial for later."*
   - *Why:* call-out-the-room (§1.4), names the petty mechanic explicitly, distinguishes the free flag from the costly token so players grasp the new economy by reading one line.

---

## 7. Keep as-is (do NOT touch — these are already sticky)

- **The tribunal-as-clue betrayal** (`accuse` → `tribunal` → `lastTribunal` tally, detectives can't vote, *who* gets accused IS the clue). This is the best social engine on the platform. Changing it would gut the game.
- **Public detectives, announced at briefing** (D7). Hidden seekers would collapse this into a different (worse) genre.
- **Softened scoring / "funny never cruel"** (D5/D9: conviction downgrades but doesn't instant-lose; tie/zero = not guilty; eliminated follower +1). This is exactly right for retention (no rage, no dead-rubber). The `scoreRound` matrix is correct as shipped.
- **Detective rotation via hidden `detectiveOrder`** (`pickDetectives` with skip-forward + degenerate fill). The comeback engine and a clean redaction story. Leave it.
- **The banked pause/resume clock** (`bank()`, `liveSeg`, `interruptSeq`). The platform's trickiest determinism surface, fully tested. New beats must *reuse* it (P0-2 banks exactly like `accuse`), never replace it.
- **All redaction invariants** (`myRule` followers-only incl. eliminated; `trueCandidateIndex` never pre-reveal; `candidateTexts` omitted for unknown viewers; per-voter ballots never serialized; `detectiveOrder` never in any view; `items` hidden). Every new field (`noteSuspicious`, spotlight flags) must extend, never weaken, these — owner-only or aggregate-only.
- **The content pack's voice and specificity.** 63 items, custody/interrogation register, hyper-specific decoys. Do not "improve" the rules — they're calibrated and the §5.16 voice is locked. Polish is chrome-only (reveal/spotlight/streak strings), per §6.
- **The honor-system + 1-token economy** (D14/D15). The new free `flagBreak` (P0-2) is *additive soft signal*, deliberately kept separate from the costly `accuse` token so it doesn't inflate grief — the elimination path stays exactly as audited.

---

## 8. Build order & test impact summary

1. **P0-1** (revealMs 6→12) — 1 line, ~0 risk. Ship immediately.
2. **P0-3** + **P0-4** (live-clean stake + crime-parfait streak) — view/accumulator only, no new secrets. Cheap, high one-more-round payoff.
3. **P0-2** (spotlight forced beat) — the big one; new phase, new redaction surface, banked-clock interaction. Needs `spotlight.test.ts` + extensions to `clock`/`redaction`/`phases` tests. This is where the dead-time problem actually dies.
4. **P1-1/P1-2/P1-3** (detective briefing job, liveMs trim, heat-meter payoff) — once spotlight is green.
5. **P2** experiments behind config/analytics gates.

**Determinism gate (must stay green after every change):** the existing replay-equality, interrupt-vs-deadline race, and tiny-remainder-resume tests in `clock.test.ts`. Any change to `bank()`/`liveSeg`/`interruptSeq` keying (P0-2 touches `interruptSeq`) must re-pass them. The redaction audit in `integration-audit.test.ts` + `redaction.test.ts` is the second non-negotiable gate for every new view field.
