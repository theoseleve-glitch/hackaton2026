# Retention redesign — `option-vote` template (Tu Préfères + Gauche ou Droite)

**Date:** 2026-06-14
**Author:** party-game design (retention pass)
**Scope:** the `option-vote` module and its two shipped configs — `tu-preferes` (`predict-majority`, no debate) and `gauche-ou-droite` (`majority-herd` + debate). Grounded against the SHIPPED code in `packages/games/option-vote/src/{state,option-vote,actions,index}.ts` and its tests. **Where this doc and the per-game design docs disagree on a number, the CODE wins** — and the code already disagrees with the docs in one place (see the timing note below).

> **Authoritative numbers as actually shipped** (`state.ts`):
> - `TU_PREFERES_CONFIG`: `totalRounds 8`, `chooseMs 15_000`, **`revealMs 6_000`**, `debateMs 0`, `pointsCorrect 1`.
> - `GAUCHE_DROITE_CONFIG`: `totalRounds 7`, `chooseMs 15_000`, **`revealMs 6_000`**, `debateMs 35_000`, `debateSkipThreshold 0.5`, `pointsCorrect 1`.
>
> Both per-game docs claim `revealMs: 15_000`. The shipped code is **6_000**. Every timing proposal below is against the **real 6_000ms** reveal. This is also the single biggest retention bug on the template (see RR-1).

---

## 1. The exact current loop (what each player actually does)

### Tu Préfères (`predict-majority`)
1. **choose:r{n}** (15s). Dilemma card (Option A vs B) fills the screen. Each player makes ONE atomic ballot `{pick, predict}` into the HIDDEN buffer. The reducer rejects any ballot missing `predict` (returns same state). UI is "two-tap": tap your pick, tap your call for the room's majority, auto-submit. View exposes only `hasSubmitted` booleans + your own `myBallot` echo. Early-resolves the instant `allActed(connected, ballots)`.
2. **reveal:r{n}** (**6s**). Atomic promotion: `counts`, `majority`, public `picks` (avatars stack under A/B with names), `awarded` (+1 to correct predictors). Predictions stay private forever; only *whether* you were right (via `awarded`) is shown. Tie → `majority: null` → nobody scores → "PERFECT SPLIT" banner. **No input accepted. Pure timed beat.**
3. → straight back to **choose:r{n+1}** (`debateMs:0`, so `afterReveal` calls `endRound`). After 8 rounds → **over** (podium, `gameOver` with cloned scores).

### Gauche ou Droite (`majority-herd`)
1. **choose:r{n}** (15s). One pack-defined object/food/behaviour card fills the screen; each player taps one axis button (De gauche / De droite). Single hidden `pick` (no predict). Early-resolves on `allActed`.
2. **reveal:r{n}** (**6s**). Same atomic reveal; `majority` side each +1; minority players increment the non-scoring `minorityCount` (Contrarian superlative fuel). Tie → nobody scores, nobody's minorityCount moves.
3. **debate:r{n}** (35s). Phones show the item's `debateStarter` thesis + countdown; the table argues IRL. Anyone connected may tap "On passe". Ends early when `skips > 0.5 × connectedCount`. On deadline → `endRound`.
4. → **choose:r{n+1}**. After 7 rounds → **over** (herd-score podium + "L'esprit contraire / The Contrarian" from `minorityCount`).

**Round wall-clock:** Tu Préfères ≈ 21s (15+6); Gauche ≈ 56s (15+6+35).

---

## 2. Scorecard — 9 retention levers, 0-5, with code evidence

| Lever | Tu Préfères | Gauche ou Droite | Evidence |
|---|---|---|---|
| **1. No dead time** | **2** | **3** | The 15s `choose` is fine (everyone acts; `allActed` early-resolves). But the **6s reveal is a pure spectator beat with zero input**, and in Gauche the **35s debate has nothing on-phone for the people not arguing** — shy tables stare at a countdown. Idle-watching is structural in both reveals. |
| **2. Legible stakes & scoring** | **2** | **3** | Gauche is legible: "side with the room, +1, see the avatars." Tu Préfères is **opaque**: your `predict` is *never shown, even at reveal* (`scoring.test.ts` asserts no `"predict"` in any view). So a player who was wrong gets a silent 0 and **never sees what they predicted** — the scoreboard moves and they can't reconstruct why. The skill axis ("know your friends") is invisible. |
| **3. Payoff beats** | **3** | **4** | The avatar-stack-under-options reveal IS a good "ohhh" engine, and PERFECT SPLIT / Égalité parfaite is a genuine banner moment. But in Tu Préfères the *second, better* payoff the design promises — "you really thought I'd pick A??" — **is impossible to render**, because predictions are redacted at reveal. The funniest beat in the game's own pitch is not shippable on the current view contract. |
| **4. Tension & comeback** | **1** | **1** | This is the template's worst lever. `pointsCorrect:1`, flat, every round, no escalation, no catch-up. In an 8-round / 7-round game with +1 max per round, a 2-3 point lead by mid-game is **mathematically very hard to close** and there is **zero comeback mechanic**. Late rounds are dead-rubber: a trailing player has no lever. No streaks (TP7/GD13 deferred). Runaway-leader and dead-rubber are both live. |
| **5. Social fuel** | **3** | **4** | Public `picks` with names is real social fuel ("TOI t'as voté ça?!"). Gauche's `debateStarter` is purpose-built argument fuel and lands. Tu Préfères under-delivers: no debate phase, and the prediction call-out (the per-game pitch's whole social hook) is invisible, so the table can't dunk on a wrong predictor. |
| **6. One-more-round pull** | **1** | **2** | Nothing escalates within a match. No streak, no spice ramp, no cliffhanger, no micro-unlock. The seeded shuffle means content is fresh but **flat in intensity** — round 8 feels like round 1. The "BEGS to repeat" pull is carried entirely by the session shell (placement-XP, Night arc), not by the game itself. |
| **7. Onboarding by doing** | **4** | **4** | Strong. Two giant buttons, tap to play, the first reveal teaches the whole loop. Zero rules-reading. Tu Préfères' two-tap (pick THEN predict) is the only friction — a first-timer may not grok the second tap means "guess the room," costing the first round. |
| **8. Replay variety** | **5** | **5** | 261 / 222 items, seeded shuffle, balanced categories. Months of no-repeat. Not a concern — do not touch the pipeline. |
| **9. Pace per phase** | **3** | **2** | `choose` 15s is right. **Reveal 6s is too short** to actually read names off the avatar stacks and land the laugh (RR-1). Gauche's **debate 35s is too long for an average/shy table** (the design's own §8 flags dead-air); great for arguers, a drag for everyone else. Pacing is mis-tuned at both extremes. |

**Headline:** the template's content + onboarding + variety are genuinely sticky and should be left alone. The bleed is concentrated in **tension/comeback (lever 4)**, **one-more-round pull (lever 6)**, the **dead 6s reveal (levers 1/3/9)**, and — Tu-Préfères-specific — the **invisible prediction** that kills its single best payoff and stakes-legibility (levers 2/3/5).

---

## 3. Retention risks (ranked)

| ID | Lever | Problem | Severity |
|---|---|---|---|
| RR-1 | 1,3,9 | **6s reveal is a dead spectator beat AND too short.** Code says `revealMs:6_000` (docs wrongly say 15_000). 6s is not enough to read a 5-8 avatar stack, find your friends, and land the "TOI t'as voté ça?!". It's the payoff phase compressed below its own minimum, and it accepts zero input — pure idle-watch. | **high** |
| RR-2 | 2,3,5 | **Tu Préfères hides predictions at reveal — its best moment is unshippable.** The view redacts `predict` even post-resolve. Players who lose a point never learn what they guessed, can't be dunked on, and can't see the "know your friends" skill axis. The per-game pitch's headline beat ("you really thought I'd pick A??") cannot render. | **high** |
| RR-3 | 4,6 | **No comeback, no escalation, runaway leaders, dead-rubber late rounds.** Flat +1, no streak, no catch-up, no spice ramp. By round 5 of 7-8 the result is often decided; trailing players have no lever and the last rounds are filler. | **high** |
| RR-4 | 1,9 | **Gauche debate dead-air.** 35s with nothing on-phone for non-talkers; the skip-quorum needs a majority to even *try* to escape it. Shy/small tables sit in silence. (Design §8 already flags this; the fix is shipped-but-blunt: host can set `debateMs` lower.) | **med** |
| RR-5 | 6,8 | **Flat spice/stakes curve within a deck.** `tu-preferes` pack contains a large slug of low-stakes whimsy (jazz hands, creaky chair, squeaky shoes, dream-home, two surviving "superpower" items) that the voice guide §5.2 explicitly says to kill — these never split the table or start a fight. The deck draws them with equal probability as the genuinely divisive social-stakes items, flattening intensity. | **med** |
| RR-6 | 4 | **Tie-heavy small even rooms are score-starved.** Even-count rooms tie often (`majority:null` → nobody scores). At 4 players this can be a third of rounds. The PERFECT SPLIT banner softens it but the scoreboard stalls. (Design GD8 / D-risk already flags this.) | **med** |
| RR-7 | 7 | **Two-tap onboarding gap (Tu Préfères only).** A first-timer may not realise the second tap is "predict the room," not a confirm — round 1 is often a wasted prediction. | **low** |

---

## 4. Proposed mechanic changes (scoped, with code/test impact)

All changes respect the pure-GameModule contract: server-authoritative, seeded RNG only, per-viewer redaction, reject-invalid-by-same-reference, no live AI, unit-testable + redaction-auditable. None of them break the existing tests' *intent*; tests that assert specific timings/redaction will need updating where noted.

### P0 — build first (high impact, low/med risk)

#### MC-1 — Fix the reveal: 6s → ~9s and make it the payoff stage, not a flash
- **What:** Raise `revealMs` from 6_000 to **9_000** (Tu Préfères) / **8_000** (Gauche, where the debate phase carries the rest). This is the cheapest single retention win on the template — the reveal is where the "ohhh" lives and 6s clips it. Pure config edit; no reducer change.
- **Lever:** 1 (less rushed idle feel because the beat actually pays off), 3, 9.
- **Impact:** high. **Risk:** low.
- **Code scope:** `state.ts` — two constants. **Reconcile the two per-game docs to match code first** (they say 15_000; reality is 6_000 → proposed 8/9_000).
- **Test impact:** `phases.test.ts` asserts `phaseDurationMs === 6_000` for both reveals — update to 9_000/8_000. No reducer logic touched.

#### MC-2 — Reveal the prediction at reveal (Tu Préfères) — ship the game's best beat
- **What:** Add a `predictions: Record<PlayerId, Option>` field to `RoundResult`, populated **only at resolve** (the atomic promotion), exposed **only in the `reveal`/`over` views** — never pre-reveal. This lets the client render "X predicted A, the room went B — Tu connais pas tes potes." It turns a silent 0 into a public, dunkable, legible miss. Predictions remain HIDDEN in the `choose` view (the anti-stall guard is untouched).
- **Lever:** 2 (the skill axis becomes visible), 3 (the promised second payoff ships), 5 (the table can finally dunk).
- **Impact:** high. **Risk:** med — it **reverses a deliberate redaction decision** (D3/§8 chose to keep predictions private). The redaction *audit* must move: predictions go from "secret forever" to "secret until atomic reveal," exactly like `pick`. This is defensible (picks are already public at reveal; predictions are the same class of post-hoc info) but it is a design reversal, so flag it for product sign-off.
- **Code scope:** `state.ts` (`RoundResult.predictions?`, reveal/over view types), `option-vote.ts` (`resolveChoose` writes `predictions` from ballots; `view` exposes it in `reveal`/`over` only, redacted to `undefined` in `choose`).
- **Test impact:** `scoring.test.ts` `'predictions are never exposed in any view'` is the load-bearing assertion to **rewrite** — it becomes "predictions hidden in `choose`, exposed at `reveal`." Add a redaction test: a `choose`-phase view for any viewer must contain no other player's `predict`. This is the highest-value test change in the pass.
- **Note:** If product wants to keep the spicy sibling's anonymity promise, gate `predictions` behind the same `publicPicks` flag that already gates `picks` for `tu-preferes-spicy` — anonymous reveal stays anonymous.

#### MC-3 — Streak bonus (param-gated, ON by default for this template)
- **What:** Add one per-player `streak: Record<PlayerId, number>` counter to state and a `streakBonus` config field. On a scoring round (Tu Préfères: correct predictor; Gauche: majority voter), increment `streak[p]`; award **+1 bonus at streak 3, +2 at streak 5** (cap small). Reset `streak[p]` to 0 on any non-scoring round for that player. This is the canonical TP7/GD13 deferred mechanic — promote it from "off by default" to **on**, because it is the template's primary fix for both runaway-leader (a cold leader's streak resets) and one-more-round pull (a hot streak is a cliffhanger).
- **Lever:** 4 (a trailing player on a hot streak closes gaps fast; a leader who goes cold stalls), 6 (streak = the "one more" hook; "I'm on 4, one more for the bonus").
- **Impact:** high. **Risk:** med — adds reducer state and a new scoring branch; must stay deterministic (it is — pure per-player counter) and redaction-clean (`streak` is public, like `scores`).
- **Code scope:** `state.ts` (`streak` map, `streakBonus` config, view exposes `streak` in all phases), `option-vote.ts` (`resolveChoose` updates streak in both scoring branches; `init` seeds `streak[p]=0`; `endRound` does not reset it). Surface `streak`/`bonusAwarded` in `RoundResult` so the reveal can animate "🔥 x3 +1".
- **Test impact:** new `streak.test.ts` (increment, reset-on-miss, bonus-at-3, cap). Existing scoring tests assert exact `scores` maps with `pointsCorrect:1` only — keep `streakBonus:0` in those configs (or default streakBonus to 0 and set it per-config) so they stay green; add streak coverage in the new file. Keep it param-gated so the spicy sibling and any future config can opt out.

#### MC-4 — Reconcile docs to code + add `revealMs` to the host allowlist
- **What:** Fix both per-game docs' `revealMs:15_000` → the real value, and add `revealMs` to the lobby allowlist (Tu Préfères range **7_000–12_000**; it's already the de-facto debate window there since `debateMs:0`). Already host-tunable in spirit per TP9; just make the number honest and exposed.
- **Lever:** 9 (rooms self-tune pace), 1.
- **Impact:** med. **Risk:** low.
- **Code scope:** docs only + lobby param allowlist (shell-side, not the module).
- **Test impact:** none in the module.

### P1 — high impact, higher risk OR med impact low risk

#### MC-5 — Gauche debate: shorten default + give non-talkers an on-phone action
- **What:** Two parts. (a) Drop default `debateMs` 35_000 → **25_000** (the design's own allowlist already permits 0-60_000; 35 is tuned for arguers, 25 is tuned for the median table; arguers' host can raise it). (b) **Add a lightweight `agree`/`disagree` tap on the `debateStarter` thesis** during debate — a non-scoring "do you buy this take?" micro-vote whose count shows live, giving silent players something to do and feeding a second reveal micro-beat ("the room rejected the thesis 5-2"). Reuses the existing `skip` action shape (add `kind:'react'`), stays in the hidden→public pattern, never affects score.
- **Lever:** 1 (no idle non-talkers), 5 (the thesis vote is more argument fuel), 9.
- **Impact:** high (Gauche-specific). **Risk:** med — (a) is trivial config; (b) adds an action variant + a public reaction tally and a redaction surface.
- **Code scope:** (a) `state.ts` one constant + doc. (b) `actions.ts` (`react` variant), `option-vote.ts` (debate-phase handler, reaction tally in view), `state.ts` (`reactions` map).
- **Test impact:** (a) update `phases.test.ts` debate duration assert. (b) new debate-reaction tests + redaction audit (reactions are debate-public like skips).

#### MC-6 — Tie-relief for small even rooms (`tiePolicy`, param-gated, Gauche + Tu Préfères)
- **What:** Add `tiePolicy: 'none' | 'all-plus-one'`. When `majority === null` AND `tiePolicy === 'all-plus-one'`, award everyone who balloted +1 (and keep the PERFECT SPLIT banner — now it's a *good* outcome, not a stall). Default `'none'`; flip to `'all-plus-one'` automatically only for small even rooms (≤4 connected) via the lobby, or globally if analytics show tie-rate >30% (GD8). This is the design's own preferred fix over streaks for score-starvation — ship both; they solve different problems (streak = pace/comeback, tiePolicy = small-room starvation).
- **Lever:** 4 (small rooms keep scoring), 6.
- **Impact:** med. **Risk:** low — a single branch in `resolveChoose`, fully deterministic.
- **Code scope:** `state.ts` (`tiePolicy` config), `option-vote.ts` (`resolveChoose` tie branch).
- **Test impact:** the two existing "a perfect tie awards nothing" tests stay green under default `'none'`; add tie-policy tests under the new param.

#### MC-7 — Spice/stakes ramp via deck tiering (Tu Préfères; content + tiny draw change)
- **What:** Tag each item with the existing `spicyLevel` (already on the type) AND a `stakes` band, and have `init` draw **escalating** rather than uniform: early rounds from low-stakes/absurd palate-cleansers, late rounds weighted toward the divisive social-stakes items, so round 8 is the loudest. Still seeded (deterministic): partition the shuffled pool by band, then interleave by round index. This converts the flat curve (RR-5) into a rising one and is the in-game half of the "one more round" pull.
- **Lever:** 6, 8, 4 (loud late rounds keep trailing players invested).
- **Impact:** med. **Risk:** med — changes `init` draw logic (currently a flat seeded shuffle); must stay deterministic and pool-size-safe (fall back to flat shuffle if a band is underfilled).
- **Code scope:** `option-vote.ts` `init` (banded draw), `state.ts` (optional `stakes` on item; or reuse category). Content: band-tag the pack + cull/relabel the whimsy slug (see §6).
- **Test impact:** `init` determinism tests still must pass (same seed → same order); add band-ordering tests.

### P2 — nice-to-have / experimental

#### MC-8 — Reveal cliffhanger between rounds
- **What:** In the last reveal before `over`, surface a `closeRace` flag in `RoundResult`/over-view when the top-2 gap is ≤1, so the client can play a "tout se joue maintenant" sting. Pure derived value, no new state.
- **Lever:** 4, 6. **Impact:** low-med. **Risk:** low.
- **Code scope:** `option-vote.ts` view/`endRound` derive flag. **Test impact:** small.

#### MC-9 — "Lock-in" confirmation micro-beat (Tu Préfères onboarding)
- **What:** Have the client require an explicit "your call: which side wins?" label on the second tap (no reducer change — purely a client/copy fix), eliminating the round-1 wasted prediction (RR-7).
- **Lever:** 7. **Impact:** low. **Risk:** low. **Code scope:** client only. **Test impact:** none.

#### MC-10 — Contrarian live-badge (Gauche)
- **What:** Expose `minorityCount` in the `reveal`/`debate` views (currently `over`-only) so the table can see the Contrarian crown forming in real time — a running social-status beat instead of an end-screen reveal.
- **Lever:** 5, 6. **Impact:** low. **Risk:** low — `minorityCount` is already computed; just widen the view. **Test impact:** redaction audit + a view test.

---

## 5. Keep as-is (do NOT touch — already sticky)

- **The atomic hidden-buffer → public-reveal promotion.** The whole "secret until everyone's in, then one big reveal with names" is the payoff engine. Per-viewer redaction in `choose` (booleans + owner echo only) is correct and the anti-stall guard. Do not weaken it — MC-2 only moves *predictions* from "secret forever" to "secret until reveal," the same class as picks.
- **The 15s `choose` + `allActed` early-resolve.** Tuned right; everyone acts; a fast room never waits; a slow room never blocks. Leave it.
- **PERFECT SPLIT / Égalité parfaite tie banner.** Converts a scoring dead-end into a celebration. Keep it (MC-6 only adds an *optional* score on top for starved small rooms).
- **`majority-herd` herd scoring + the non-scoring Contrarian superlative.** "Read the room, no ground truth" is the correct model; the Contrarian badge-not-penalty is exactly right. Do not add a contrarian *bonus* (perverse incentive — explicitly cut in D1).
- **Public `picks` with names at reveal.** The "TOI t'as voté ça?!" moment IS the game. Untouchable (except the spicy sibling's anonymity flip, already specced).
- **The 261/222-item packs, seeded shuffle, category balance, no-AI-at-runtime.** Replay variety is a 5/5. MC-7 reorders the *draw*; it does not shrink or AI-ify the pool.
- **The presence/disconnect handling** (leave-can-complete, idempotent rejoin, skip eligibility over connected set). It's the liveness guarantee; the tests pin it; leave it.
- **`gauche-ou-droite` content voice.** The mock-sociology debateStarters (raclette-as-copro, croissant-custody, oat-milk-as-self-image) are genuinely excellent and on-guide. This is NOT bland-AI content. Do not "improve" it — it's a model for the rest of the catalog.

---

## 6. Writing-polish priorities

**Verdict first:** the content is mostly strong and on-voice — `gauche-ou-droite` especially is a model deck, and the top of `tu-preferes` (search-history-vs-camera-roll, other-group-chat-betrayal) is exactly the social-stakes spine the guide wants. The weakness is **not bland AI prose**; it's a **flat spice/stakes curve and a slug of low-stakes whimsy** in the Tu Préfères deck that the voice guide §5.2 explicitly says to kill.

Priorities, in order:

1. **(P0) Cull/relabel the whimsy slug in `tu-preferes` (RR-5).** A large fraction of mid-pack items are harmless quirks that never split the table or start a fight — and at least two surviving "superpower" items (`wyr-strength-noone-sees-vs-flight-everyone-films`, `wyr-honesty-day-vs-invisibility-day`) are the *exact* archetype the guide names as dead. Either cut them or rewrite the stakes upward. Both options must cost something *personal* (dignity, secrets, the group chat), not just be a funny affliction.
2. **(P0) Reveal copy must taunt wrong predictors (depends on MC-2).** Once predictions are visible at reveal, write reveal captions as dunks: « Tu connais pas tes potes. », "You really thought they'd pick that?". This is the voice-guide §5.2 directive that is currently unshippable.
3. **(P1) Tier the deck for the escalating draw (MC-7).** Tag ~30-40% clean-absurd palate cleansers (front-loaded) and ~60-70% divisive social-stakes (back-loaded), per voice-guide §3 deck-composition. The clean cards keep the dirty ones loud; the ordering makes round 8 the peak.
4. **(P1) Gauche debateStarters: keep the bar, hold the line.** They're great; the only ongoing risk is freshness (tech items date) and political drift. Content-ops, not a rewrite.

### Concrete rewrites

**Rewrite A — kill a surviving superpower item (Tu Préfères), make both options cost something personal:**

> BEFORE (`wyr-honesty-day-vs-invisibility-day`):
> A: « 24h où tout le monde te répond avec une honnêteté totale, potes inclus »
> B: « 24h invisible, à entendre comment ils parlent quand t'es pas là »
>
> AFTER (same id, social-stakes, indefensible both ways):
> A (fr): « Pendant 24h, chaque pote te dit en face le vrai truc qu'il pense de toi — celui qu'il dit que dans l'autre groupe. »
> A (en): "For 24h, every friend says to your face the one thing they really think — the version they only post in the group chat without you."
> B (fr): « Pendant 24h, t'entends en direct ce qu'ils disent de toi dès que tu quittes la pièce. Tout. »
> B (en): "For 24h, you hear live what they say about you the second you leave the room. All of it."
> *Why:* keeps the comic structure (24h curse) but both options now cost a real relationship and force a 50/50 split — nobody escapes, and the reveal will fight.

**Rewrite B — reveal caption (Tu Préfères), now that MC-2 exposes predictions:**

> BEFORE (current, prediction invisible — there is no caption; the loser just gets a silent 0).
>
> AFTER (templated reveal caption, fired when a named player's `predict !== majority`):
> fr: « {name} était sûr·e que la table voterait {predicted}. La table a voté {majority}. Tu connais pas tes potes. »
> en: "{name} bet the room would go {predicted}. It went {majority}. You don't know your people."
> *Why:* converts the game's silent skill axis into the dunkable, eye-contact payoff the per-game pitch promised but the current view contract forbids.

---

## 7. Timing summary (ms per phase, all variants)

| Game | Phase | Current (code) | Proposed | Why |
|---|---|---|---|---|
| both | `choose` | 15_000 | 15_000 (keep) | Tuned; `allActed` early-resolves a fast room. |
| tu-preferes | `reveal` | **6_000** | **9_000** | The payoff beat is currently clipped below readability; no debate phase to carry the moment, so the reveal must hold it (MC-1). |
| tu-preferes | (no debate) | — | — | Keep `debateMs:0`; `revealMs` IS the window. |
| gauche-ou-droite | `reveal` | **6_000** | **8_000** | Slightly longer to read avatar stacks; debate carries the rest (MC-1). |
| gauche-ou-droite | `debate` | 35_000 | **25_000** | 35s is tuned for arguers and drags for the median/shy table; arguers' host can raise via allowlist (MC-5a). |

Host allowlist (per game): `totalRounds` (5-12), `revealMs` (tu-preferes 7_000-12_000), `debateMs` (gauche 0-60_000), `chooseMs` (10_000-20_000). Never expose `scoring`, `pointsCorrect`, `debateSkipThreshold`, `tiePolicy`/`streakBonus` (those define identity / are auto-set).

---

## 8. Ship order

- **P0 (build first):** MC-1 (reveal timing), MC-2 (reveal predictions — the Tu Préfères flagship fix), MC-3 (streak bonus), MC-4 (doc/allowlist reconcile) + writing P0 (whimsy cull, taunt copy).
- **P1:** MC-5 (Gauche debate shorten + thesis micro-vote), MC-6 (tiePolicy), MC-7 (escalating deck draw) + writing P1 (deck tiering).
- **P2:** MC-8 (cliffhanger flag), MC-9 (lock-in copy), MC-10 (live Contrarian badge).

Every P0 item is unit-testable and redaction-auditable; MC-2 is the one design *reversal* (predictions private → private-until-reveal) and needs product sign-off before code.
