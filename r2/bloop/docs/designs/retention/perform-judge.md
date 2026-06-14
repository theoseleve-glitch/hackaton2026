# Retention-First Redesign — `perform-judge` template

**Template:** `PERFORM_JUDGE` (`packages/games/perform-judge/`)
**Games on this reducer:** `devine-l-action` (guided) · `devine-l-objet` (credit) · `mime-inverse` (puppet) · `double-le-mouvement` (rate)
**Scope:** one reducer, four configs on three axes (`promptVisibility` / `adjudication` / `crewSize` + scalar knobs). All four ship today.
**Author:** senior party-game designer, retention pass
**Grounded in:** `state.ts` (configs + phases), `perform-judge.ts` (reduce/resolve/rotation), `views.ts` (redaction), `helpers.ts`, `actions.ts`, the four final design docs, the content-voice guide, and the shipped packs.

> Hard architectural guardrails respected throughout: pure `GameModule` (init/reduce/view/phaseDurationMs/phaseKey), server-authoritative, seeded RNG only (`createRng`/`shuffle`), per-viewer redaction (secrets never reach non-actors), reject-invalid = **same state reference**, no runtime AI. Every proposal below is unit-testable and redaction-auditable. The session shell already owns cross-game placement-XP, streaks (capped 1.25×, comeback-always-live), and the single between-games interstitial — so this brief deliberately does **not** add streak/XP state to the reducer (GDD M1.5: "never re-enter a reducer"). The wins here are *in-match*.

---

## 0. The current loop, exactly (per config)

`phaseKey = ${phase}:${turnSeq}`; `turnSeq++` per turn entry. Rotation is a seeded shuffle; deck is a seeded shuffle; `laps` = times each seat is the spotlight.

| Config | ready | perform | judge | reveal | scoreboard | laps | who acts in `perform` | who judges |
|---|---|---|---|---|---|---|---|---|
| **guided** (action) | 6s, performer taps Prêt | **75s** | 15s verdict | 6s | — (`every:0`) | 2 | performer (body IRL) + helpers (channel IRL); only performer touches phone (`claimDone`/`giveUp`/`pass`) | every connected non-performer, yes/no |
| **credit** (objet) | 4s | **45s** | 12s validate | 6s | — | 2 | performer mimes; only performer touches phone (`claimFound`); room shouts IRL | connected minus performer minus credited guesser |
| **puppet** (mime) | 0s (straight to perform) | **30s** | 10s verdict | 7s | 6s every 4 | puppet flails; **every commander can `tap` continuously**; strict tap-majority → `success-early` | commanders; perform-taps pre-cast as yes |
| **rate** (mouvement) | 15s mover picks 1 of 2 | **30s** | 15s stars 1–5 | 7s | — | crew of 2 (mover + blind dubber), `done` taps; rest of room = pure audience | connected non-crew, 1–5 stars |

Scoring: guided +10 perf / +5 each helper (cooperative); credit +10/+10 (perf+guesser, +5/+5 fast); puppet +100 (+50 early) / +50 each commander; rate `round(avg×20)` to both crew, +25 ovation. All match-local; shell converts final placement → XP.

---

## 1. Lever scorecard (0–5, evidence from real code)

Scored across the template, with the weakest config flagged. Score = the template's current median behaviour.

| # | Lever | Score | Evidence |
|---|---|---|---|
| 1 | **No dead time** | **2** | Split personality. **puppet = 5** (every commander taps continuously, `tapCount`/`tapGoal` live in `perform`, helpers.ts). But **rate = 1** (during the 30s `perform`, the entire audience has zero phone agency — `views.ts` perform-branch gives non-crew only `secret:null`; first interaction is the 15s star vote) and **credit = 2** (only the performer can `claimFound`; the room shouts IRL but cannot touch the phone for 45s, and the *credited guesser* is then excluded from the validate vote — `eligibleJudges` drops them, so the turn's "winner" sits idle through judging). guided is 3 (helpers act IRL via the channel but are phone-idle until verdict). |
| 2 | **Legible stakes & scoring** | **3** | Outcome stamps + aggregate tally/stars are public at reveal (`TurnResult`). BUT three scales coexist (10/5, 100/50, 20–125) and **the running scoreboard is invisible between turns in 3 of 4 configs** (`scoreboardEvery:0` for guided/credit/rate — `reveal` carries `scores` in the view but there is no dedicated standings beat; the puppet board exists only every 4 turns). Players rarely know who's winning mid-match. The cooperative +5-to-everyone (guided) and +50-to-everyone (puppet) flatten the board so hard that "who's winning" is genuinely unclear. |
| 3 | **Payoff beats** | **4** | This template's core strength. The reveal is a *real* engineered drop: the performer/room finally sees the secret they were blind to (`promptVisibility` inversion). "THAT was supposed to be a cat?!" (rate), "you spent 30s giving birth to a fridge" (puppet). The content packs land it. Only ding: `revealMs` 6–7s is tight for the laugh + the points burst to both register, and there is no replay/clip hook. |
| 4 | **Tension & comeback** | **2** | Weakest structural lever. **Cooperative flattening** (guided: every helper +5 every réussi; puppet: every commander +50 every success) means the spread comes only from *who performs*, and everyone performs the same number of times. With generous verdicts (`verdictThreshold:0.5`, `zeroVotesSucceed:true` for guided/credit) almost everything resolves success, so scores converge. There is **no comeback mechanic, no escalating stakes across laps, no catch-up for a trailing seat**. A 2-lap guided match is largely a dead rubber by the reveal of turn 4. |
| 5 | **Social fuel** | **3** | credit is the designed conflict engine ("c'est MOI qui l'ai dit", validate vote = `publicItem` on the table) = 4. puppet's "who gave the worst instruction" is live but not surfaced on-phone. guided's verdict can call out channel-cheating. BUT: **votes are aggregate-only forever** (correct for anonymity), so there is no "TOI t'as voté ça?!" reveal that the voice guide §4.4 calls the fuel. No "who almost said the forbidden word", no MVP/callout card at reveal. The arguments happen IRL but the app doesn't *stoke* them post-reveal. |
| 6 | **One-more-round pull** | **2** | `laps` is a flat loop — turn N feels identical to turn 1. No escalation (no "final lap doubles", no spice ramp, no cliffhanger). `over` → shell interstitial → rematch is a cold restart. Nothing in the reducer *begs* a replay; the pull is entirely on the shell's Night arc. The puppet scoreboard every-4 is the only intra-match "where do I stand" hook. |
| 7 | **Onboarding by doing** | **3** | Strong for the spotlight (you stand up, you're handed a card, you act — zero reading). Weak for **first-time judges/raters**: the 15s/12s/10s vote windows assume you already know what yes/no or 1–5 *means here*. credit's "C'était bon?" is non-obvious to a first-timer (validating a *credit claim*, not the mime). puppet's `tap`-the-instant-they-say-it is undiscoverable without a prompt — a room of first-timers will let the 30s lapse and dump into verdict. |
| 8 | **Replay variety** | **4** | Genuinely deep: 132/135/184/125 items, seeded no-repeat draw, ~4–11 matches before recycle. Channels (guided: mime/sounds/three-words/taboo/statues) multiply action variety. Ding: the *structure* never varies (same phase order every turn), and guided pairs each action with exactly one pre-paired channel, so a re-drawn action is identical. |
| 9 | **Pace per phase** | **2** | The single most actionable miss. **guided 75s perform is far too long** — a frozen performer + a passive room = a 75-second drag; the design doc itself admits "usually ended early by Je l'ai fait". **rate 15s ready** to pick 1 of 2 prompts is double what's needed and the room watches a blank "X is choosing" card. **puppet 0s ready** dumps you into perform with no breath to read the category. credit 4s ready is fine. judge windows (10–15s) are reasonable but `revealMs` 6s is short for a two-part payoff. |

**Template median: ~2.8 / 5.** Carried by payoff + variety; dragged down hard by dead time (rate/credit audience), no comeback/escalation, and loose pacing (guided 75s, rate 15s ready).

---

## 2. Retention risks (ranked)

| Lever | Problem | Severity |
|---|---|---|
| No dead time | **rate audience is idle for 30s** and **credit audience is idle for 45s** — phones do nothing while two/one people act. In a 6-player rate room, 4 people watch with dead phones every turn. This is the #1 churn surface on the template. | high |
| Tension & comeback | Cooperative flattening (+5/+50 to everyone) + generous verdicts converge scores; no comeback, no escalation. By lap 2, placement is decided and the match is a dead rubber. | high |
| Pace per phase | guided 75s perform drags; rate 15s ready is a blank-stare beat; puppet 0s ready skips the "read your hint" breath. Bad pacing reads as boredom long before content fatigue. | high |
| One-more-round | Flat laps, identical turns, cold `over`. The loop never escalates or cliffhangs; replay pull is 100% on the shell. | med |
| Social fuel | Anonymity (correct) kills the "who voted that" reveal; no MVP/callout/near-miss card stokes the IRL argument the genre lives on. | med |
| Onboarding | First-time *judges* (credit validate, puppet tap, rate stars) get no teach-by-doing; rooms of newbies waste the first turn. | med |
| Legible stakes | No running standings in 3/4 configs; three score scales; flat board hides who's winning. | med |
| Payoff beats | `revealMs` 6–7s is tight for the two-part drop + points burst; no clip/share hook on the best moment. | low |

---

## 3. Mechanic changes (scoped, prioritised)

Each is config/reducer/view-scoped, redaction-safe, deterministic, and unit-testable. **P0 = high impact, low/med risk. P1 = high impact higher risk, or med impact low risk. P2 = experimental.**

### P0 — build first

**P0-1 · Retune phase durations (config-only).**
Pure `PerformJudgeConfig` scalar edits — zero reducer logic, zero redaction change. Fix the three worst pacing offenders. See §5 for the full table. Headlines: **guided perform 75s → 55s**, **rate ready 15s → 8s**, **puppet add a 4s ready breath** (`readyMs 0 → 4000`, and surface the category on it), **reveal 6s → 8s** everywhere for the two-part payoff. *Lever: pace (9), payoff (3), dead time (1). Impact high, risk low.*
Code: `state.ts` config constants. Test: `phases.test.ts` "phase durations match the binding designs exactly" — update the asserted ms; the walk-to-over tests are duration-agnostic. The puppet `readyMs>0` path is already exercised by guided/credit/rate (init phase branch + `onDeadline` ready branch), so enabling it for puppet adds no new code path, only new coverage.

**P0-2 · Audience "live reaction" taps during `perform` (kill rate/credit dead time).**
Give every non-acting connected viewer a cosmetic tap during `perform` that contributes a public *reaction count* (e.g. a 🔥/💀 burst), buffered exactly like puppet taps. No scoring, no secret leak (it's an action *from* the idle viewer, reveals nothing). For **rate**, this is the audience hyping the act in real time; the count rides into the reveal card ("the room reacted 11×"). For **credit**, the room can tap a "🔥 found it" pulse that the performer sees as social pressure (still only the performer credits). This converts a dead 30–45s into continuous micro-agency.
*Lever: dead time (1), social fuel (5). Impact high, risk med.*
Code: add `{kind:'react'}` to `PerformJudgeAction` + `actions.ts` zod; in `onAction` perform-branch accept from any connected non-actor, accumulate into a new `reactions: Record<PlayerId,true>` (or a count) on state; surface `reactionCount` in the perform + reveal views. Redaction: reactions are public counts, owner-echo for "did I react" — identical pattern to `taps`. Test: new `actions.test.ts` cases (audience react accepted, actor react rejected, duplicate rejected, count public / who-reacted owner-only in `redaction.test.ts`). **Risk note:** must NOT let a react resolve the turn (unlike puppet `tap`) — it is purely additive. Keep the resolve conditions untouched.

**P0-3 · Always-on running standings (legible stakes, cheap).**
The `reveal` view already carries `scores`, but there's no rank legibility. Add a compact `standings` (sorted `[playerId, score, rank, delta]`) to the `reveal` and `over` views, and **enable a short scoreboard beat on the final lap for guided/credit/rate** (`scoreboardEvery` stays 0 mid-match to protect the ad-boundary rule, but `afterReveal`'s `wouldEnd` already detects the last turn — insert one pre-`over` standings beat). This makes "who's winning / can I still win" visible exactly when it matters (the closing stretch) without adding mid-match ad boundaries.
*Lever: legible stakes (2), tension (4). Impact med, risk low.*
Code: `views.ts` reveal/over branches compute `standings` from `scores` (pure projection, no state). The final-lap board reuses the existing puppet `scoreboard` phase + `afterReveal` due-logic gated on `wouldEnd(state)`; `scoreboardMs` must be set (e.g. 6000) for the configs that adopt it. Test: extend `scoring.test.ts` for the standings projection; `phases.test.ts` puppet-cadence pattern covers the pre-over board.

**P0-4 · Judge-side onboarding hint (teach-by-doing for first-timers).**
First-time judges don't know what the vote means. Add a one-line `judgePrompt` LText to the `judge` view per `adjudication` ("Did the room actually drag them into it — or did someone just say the word?" for guided; "C'était vraiment cette personne ? / Did they really call it?" for credit; "Rate the disaster, 1–5" for rate) and a perform-phase `tapHint` for puppet ("Tap the instant they say it"). This is copy delivered through the view, not a rules screen — teaches in the 10–15s window.
*Lever: onboarding (7), legible stakes (2). Impact med, risk low.*
Code: `views.ts` judge/perform branches add a static localized string keyed off `adjudication`/`mode` (no pack dependency, no secret). Test: trivial view-shape assertion; no redaction surface (strings are public).

### P1 — high impact, higher risk

**P1-1 · Escalating final lap ("Money Round").**
Kill the dead-rubber by making the **last lap score 1.5×** (or the last turn per player a "double"). Deterministic, derivable from `lap`/`laps` already in state. On the final lap, `finishTurn` multiplies the awarded points (a single multiplier applied to the `points` map before merge). This keeps a trailing player mathematically alive into the finale and gives the reveal of the last lap real weight — directly serving comeback + one-more-round.
*Lever: tension (4), one-more-round (6). Impact high, risk med.*
Code: `perform-judge.ts` — in `finishTurn` (or the four `resolve*`), scale `points` by a config `finalLapMultiplier` when `state.lap === config.laps - 1`. Add `finalLapMultiplier` to config (default 1 = off for puppet/rate single-lap; 1.5 for guided/credit 2-lap). View: flag `isFinalLap` so the client can scream "DOUBLE POINTS" on the reveal/ready card. Test: new `scoring.test.ts` cases asserting the multiplier applies only on the final lap; existing scoring tests run on lap 0 so they stay green (assert they're lap-0). **Risk:** changes a load-bearing scoring path — must be gated so single-lap configs (puppet/rate, `laps:1`) are unaffected (final lap == only lap; default multiplier 1 there).

**P1-2 · "Near-miss" + MVP callout card at reveal (social fuel without breaking anonymity).**
The genre's fuel is the post-reveal argument; anonymity (correct, locked) forbids "who voted no". But we CAN surface *aggregate, non-attributed* drama: for puppet/credit, a "so close" stamp when the tally was 1 vote from flipping (`Math.abs(yes-no) <= 1`); for guided, "the room nearly let it slide" on a bare-majority réussi; for rate, "split table" when star variance is high (computable from the aggregate without publishing ballots — ship min/max alongside avg). Add a per-match running "most-credited" / "most-ovationed" tag shown at `over`. None of this names a voter.
*Lever: social fuel (5), payoff (3). Impact med, risk med.*
Code: `resolve*` compute the near-miss flag into `TurnResult` (new optional `drama: 'nailbiter'|'split'|null`); `views.ts` over-branch computes the match-MVP tag from `lastResult` history — **but the reducer keeps no history**, so MVP must be derived from a small running tally added to state (`creditedCount`/`ovationCount` maps). Test: `scoring.test.ts` near-miss thresholds; redaction test that `drama`/MVP never embed a player's individual ballot. **Risk:** star variance reveal must be proven non-leaky (min/max of an anonymous multiset is safe; assert it in `redaction.test.ts`).

**P1-3 · credit: keep the credited guesser engaged through judging.**
Today `eligibleJudges` excludes the credited guesser, so the turn's co-winner watches the validate vote idle. Give them a non-scoring **"defend the claim"** beat: a single public tap ("I called it 🙋") surfaced on the validate card to the room (pure social pressure, no vote weight). Cheap fix to credit's worst idle pocket.
*Lever: dead time (1), social fuel (5). Impact med, risk low.*
Code: reuse the P0-2 `react`/tap buffer scoped to the credited guesser in `judge`; `views.ts` validate-branch surfaces it. Test: actions + redaction (the guesser's tap is public, others' votes still hidden).

### P2 — experimental / nice-to-have

**P2-1 · rate: audience "predict the stars" micro-bet.**
Before the star window, let the audience secretly predict the crew's average band (enum: low/mid/high — 3 buckets, zero free text). Correct predictors get a tiny match-local point. Adds a second hidden-buffer beat (cheap, enum-only) and a "you called it" reveal — turns passive raters into stakeholders. Deferred because it adds a phase/beat and pacing risk to an already-tight 30s+15s loop.
*Lever: dead time (1), social fuel (5), one-more-round (6). Impact med, risk med.*

**P2-2 · guided: surface "who's holding the answer" tension to the performer.**
The performer is information-starved (by design). A subtle "3 helpers are dying to tell you" counter (no content, just a count of helpers who've peeked/are active) raises the squirm without leaking the secret. Pure count, redaction-safe. Experimental — could undercut the helplessness fantasy.
*Lever: social fuel (5), no dead time (1). Impact low, risk low.*

**P2-3 · Clip/share hook on the reveal.**
Mark the reveal `phaseKey` with a `shareable: true` + a pre-baked caption (the second-punchline line already in packs as `hint`/reveal copy) so the shell can offer a one-tap "save this moment". No reducer change beyond a view flag; the value is client-side. Deferred to client roadmap.
*Lever: payoff (3), one-more-round (6). Impact med (virality), risk low (in-reducer).*

---

## 4. Keep as-is (do NOT touch — these are sticky)

- **The redaction inversion** (`promptVisibility` axis, `entitled = isRoster && !isPerformer` for others-modes; performer-echo for performer-modes; unknown ids blind). This is the whole template's magic AND its safety floor. Locked, audited by `redaction.test.ts` + `leakedSecrets`. Any change re-runs both.
- **puppet's continuous-tap perform loop + `success-early`** (`earlyMajorityResolve`, `tapGoal = floor(commanders/2)+1` recomputed live). This is the gold standard for "no dead time" on the template — it's what the other configs should aspire to (P0-2), not what to change.
- **credit's claim → validate conflict engine** (`claimFound` → `publicItem` on the table → "C'était bon?" vote). The designed argument-starter; the dispute IS the product (voice guide §5.15). Don't dilute it; only fix the idle guesser (P1-3).
- **Cooperative *identical* duo/crew scoring** in rate (both crew) and credit (perf+guesser). The "two friends go down together" fantasy depends on it. The flattening problem (lever 4) is solved by escalation/comeback (P1-1), NOT by making teammates compete.
- **Generous resolution defaults** (`verdictThreshold:0.5` ties-generous, `zeroVotesSucceed` benefit-of-the-doubt, empty-eligible → void-not-fail). "Funny never cruel" + griefing-resistance. Keep.
- **Aggregate-only ballots forever** (no per-voter publish, even at reveal). Anonymity invariant + anti-grief. P1-2's drama flags are explicitly designed to respect this.
- **Deadline-driven everything / passive room always reaches `over`** (`walkToOver` green for all four). The disconnect/void/skip matrix in `onLeft` is battle-tested across `presence.test.ts`. Don't refactor it.
- **The content packs' voice.** The shipped items already execute the voice guide (the "BEFORE" prude versions are gone): "walk an invisible dog that chose violence", "giving birth to a fridge", "the toothbrush shared once at a festival — both parties may be in this room". This is *good*. Writing-polish (§6) is targeted, not a rewrite.

---

## 5. Concrete timing proposals (ms per phase)

Rationale per change; all are `PerformJudgeConfig` scalar edits (P0-1) except where noted.

| Game | Phase | Current ms | Proposed ms | Why |
|---|---|---|---|---|
| **guided** | ready | 6 000 | 6 000 | Keep — helpers need to read the secret + channel; performer can still early-tap Prêt. |
| **guided** | perform | **75 000** | **55 000** | Biggest drag on the template. Design doc concedes turns "usually end early"; 75s is the frozen-performer worst case. 55s keeps room for a real attempt, cuts the dead tail. Still host-tunable 45–90 (locked range exists). |
| **guided** | judge | 15 000 | 12 000 | 12s is plenty to answer one binary (channel-cheat) question; tightens energy. |
| **guided** | reveal | 6 000 | 8 000 | Two-part payoff (action text TO the performer + points burst to all) needs the extra 2s to land. |
| **credit** | ready | 4 000 | 4 000 | Fine — "Lève-toi" spotlight. |
| **credit** | perform | 45 000 | 45 000 | Keep; the fast-bonus window (`performMs/2` = 22.5s) is tuned to it. P0-2 audience taps fix the idle, not the length. |
| **credit** | judge | 12 000 | 12 000 | The dispute beat; keep. |
| **credit** | reveal | 6 000 | 8 000 | Same two-part-payoff reason. |
| **puppet** | ready | **0** | **4 000** | Add a breath: puppet reads the category hint, room reads the secret + forbidden words before the scramble. Eliminates the "everyone fumbling at second 1" cold open. Reuses the existing `readyMs>0` init/deadline path — no new code. |
| **puppet** | perform | 30 000 | 30 000 | Tuned; early-majority pops good rounds at ~15–20s anyway. Keep. |
| **puppet** | judge | 10 000 | 10 000 | Keep (taps pre-cast as yes; usually near-instant). |
| **puppet** | reveal | 7 000 | 8 000 | The "you gave birth to a fridge" drop deserves the beat. |
| **puppet** | scoreboard | 6 000 | 6 000 | Keep; it's the ad boundary + standings. |
| **rate** | ready | **15 000** | **8 000** | 15s to pick 1 of 2 prompts is a blank-stare beat for the whole room watching "X is choosing". 8s forces a snappy pick; deterministic auto-pick `offer[0]` still backstops a passive mover. |
| **rate** | perform | 30 000 | 30 000 | Keep the bit length; P0-2 audience reactions fix the audience idle. |
| **rate** | judge | 15 000 | 12 000 | 12s to tap 1–5 is enough; tightens the loop. |
| **rate** | reveal | 7 000 | 8 000 | Two-part: prompt flips public ("THAT was a cat?!") + stars + points. |

Net effect: guided worst-case turn drops ~25s; rate ready halves; puppet gains a solvability breath; every reveal gets its laugh. Total match time roughly flat-to-shorter while *feeling* far tighter.

---

## 6. Writing-polish priorities

The packs are genuinely strong (voice guide already applied). The weak spots are **structural UI copy and per-phase framing the reducer/views surface**, plus a few content-distribution gaps — not a rewrite.

| Area | Game | Action |
|---|---|---|
| **Judge-prompt copy (NEW, ships with P0-4)** | all | The vote/rate screens currently surface no framing line. Write the four `judgePrompt` strings as *provocations*, not labels (voice guide §4): credit = « X s'attribue la win. Le tribunal tranche : c'était bon ? » / "X is taking the W. Court's in session — did they really call it?"; guided = « Ils l'ont fait, ou quelqu'un a balancé le mot ? » / "Did they earn it, or did someone just say the word?"; rate = « Note le désastre. 1 = une expérience. » / "Rate the disaster. 1 = it happened to all of us." |
| **Reveal second-punchline caption** | rate, puppet | The packs already hold the betrayal-reveal line in `hint`; make the reveal view *surface it as the caption* (not just the prompt text). "THAT was supposed to be a cat?!" must appear ON the reveal, not be left implicit. View-layer wiring + ensure every item has a reveal-caption line. |
| **puppet `tapHint` (NEW, ships with P0-4)** | puppet | "Tap « Trouvé ! » the SECOND they name it — first majority wins it early." Undiscoverable today; a room of newbies never triggers `success-early`. |
| **Channel-rule freshness** | guided | All 40 mime items share the identical `channelRule` string ("no sounds, no words... good luck"). Fine once, repetitive across a session. Author 3–4 rotating deadpan variants per channel so re-draws don't echo. |
| **Category-hint sharpening** | credit, puppet | Categories are good ("Hygiène douteuse", "Crimes de cuisine") but a few are flat ("Corvées/Chores"). Push every category toward the verdict-label register the voice guide rewards. |
| **`over` / standings copy** | all | The final standings beat (P0-3) needs ironic crown/cheh copy, not a neutral table. « Vainqueur par défaut de mime. Personne n'est fier. » / "Champion of charades. Nobody's proud." |
| **Distribution gap** | guided | sounds/three-words/statues channels are thin (26/19/20 vs mime 40). Author toward parity so a session doesn't lean 40% mime. |

### Example rewrites (concrete)

**1 — guided verdict prompt (the screen has none today; this is the new `judgePrompt`):**
- BEFORE (implicit / a bare "Réussi? Oui/Non"): no framing, reads like a form.
- AFTER (FR): « Ils l'ont fait sous contrainte — ou y'a un traître qui a lâché le mot ? Votez. » · (EN): "did the room actually drag them into it — or did someone cheat and say it out loud? you decide."
- *Why:* converts a dead binary into an accusation (voice §4.4 verdict-with-no-middle); arms the channel-cheat argument the design relies on; names the stakes a first-time judge wouldn't infer.

**2 — puppet reveal caption (surface the existing betrayal line as the ceremonial drop):**
- BEFORE (reveal shows only): « Laver une seule fourchette, la tienne, et reposer la vaisselle sale du coloc bien en évidence » + outcome stamp.
- AFTER (reveal leads with the drop): « Tu viens de passer 30 secondes à laver UNE fourchette. La tienne. Et à ériger un monument à la vaisselle sale de ton coloc. Voilà ce qu'ils t'ont fait faire. » · (EN): "you just spent 30 seconds washing ONE fork. yours. and building a monument to your flatmate's dirty dishes. that's what they made you do."
- *Why:* the payoff beat (lever 3) is the template's best asset; today the view dumps the raw prompt. Leading the reveal with the second-person betrayal framing (voice §5.13 "ceremonial drop") is the engineered laugh — and it's a one-line view change + a per-item caption field, not new mechanics.

---

## 7. Ship order (summary)

1. **P0-1** durations (`state.ts` scalars; update `phases.test.ts` ms asserts) — instant pacing win, near-zero risk.
2. **P0-4** judge/tap prompts + reveal-caption wiring (`views.ts` + copy) — onboarding + payoff, no redaction surface.
3. **P0-3** running standings + final-lap board (`views.ts` projection + reuse scoreboard phase) — legibility.
4. **P0-2** audience reaction taps (`actions.ts`/reducer/views) — kills rate/credit dead time; the one P0 with a new action, so it carries the most test work (gate it: reactions never resolve a turn).
5. **P1-1** final-lap multiplier (scoring path; gate to multi-lap configs) — comeback/one-more-round.
6. **P1-2 / P1-3** near-miss+MVP drama and credit-guesser engagement — social fuel.
7. **P2-*** predict-the-stars, performer tension counter, clip hook — experimental.

Everything respects the pure-module contract, seeded RNG, per-viewer redaction, same-reference rejection, and zero runtime AI. Every item lists its test surface; the four existing suites (`phases`/`scoring`/`redaction`/`presence`/`actions`/`integration-audit`) are the regression net.
