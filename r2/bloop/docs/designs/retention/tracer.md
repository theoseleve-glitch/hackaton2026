# Retention Redesign — `tracer` template (VOTE@1)

| | |
|---|---|
| **Template** | `tracer` (VOTE@1 — single-vote designation over the player roster) |
| **Package** | `packages/games/tracer/` |
| **Games on template** | `pires-potes` / `pires-potes-soft` (flagship accusation engine), `who-s-most-likely` (Qui de vous… / Most Likely To — pack-only tile riding the same module), and the back-compat `tracer` Quick-Vote instance |
| **Module factory** | `createTracer(id, config)` → one machinery, many configs |
| **Status** | SHIPPED + unit-tested. This is a **retention** pass, not a rewrite. |
| **Author** | senior party-game designer, grounded in `src/state.ts` + `src/tracer.ts` + `src/actions.ts` |

---

## 0. The exact current loop (from the real code, not the design doc)

Read line-by-line from `tracer.ts` / `state.ts`:

```
init ─▶ vote(round 0) ─▶ reveal(round 0) ─▶ vote(round 1) ─▶ … ─▶ over
        20 000 ms          7 000 ms
        (config.voteMs)    (config.revealMs)
```

- **vote phase** (`phaseDurationMs` → `config.voteMs`): the card (`state.prompts[state.round]`, a `string | LText` passed through untouched) shows on every phone. Each player taps exactly ONE *other* player (`action.target === playerId` → same-state reject; non-roster target → reject; re-vote allowed, last tap wins via `Object.assign`). **Early-resolve** the instant `state.players.every(p => votes[p] !== undefined)` → `resolveReveal`. At the 20 s deadline, missing votes are silently dropped.
- **reveal phase** (`phaseDurationMs` → `config.revealMs`): `view()` returns the aggregate `tally` (count per target) + running `scores`. **Zero input. Zero suspense engineering.** `resolveReveal` already mutated `scores` (`+1` to *every* player tied at `max`, guarded by `if (max > 0)`), so by the time players see reveal the scoreboard has *already moved* — the number just appears.
- **over** (`phaseDurationMs` → `null`): terminal, reducer inert, `gameOver` effect carries cloned `scores`.

**Scoring, exactly:** `tallyVotes` → `max = Math.max(0, ...counts)` → `if (max > 0)` every target with `counts[p] === max` gets `+1`. No tiebreak, no streak, no multiplier, no penalty.

**Redaction, exactly:** `votes: Record<PlayerId, PlayerId>` is NEVER serialised. Vote view exposes `hasVoted` (bool only), `myVote` (the viewer's own target only), `scores`. Reveal view exposes `tally` (counts) + `scores`. **The voter→target edge is destroyed and never recoverable** — you learn the room pointed 4 fingers at Sam, never which 4.

This loop is mechanically clean, fast, never-blocks, and perfectly redacted. It is also **retention-thin**: the entire game is a finger-point and a counter going up.

---

## 1. Retention scorecard (0–5, evidence from the real code)

| Lever | Score | Evidence |
|---|---|---|
| **1. No dead time** | **2** | Vote phase is great — everyone acts simultaneously, early-resolve kills slack. But the **7 s reveal is 100 % passive for 100 % of the table** (`reveal` view has no action; reducer rejects all `action` events when `phase !== 'vote'`). Over 7 rounds that's ~49 s of pure watching. And a fast voter who locks in at 3 s waits up to 17 s for the deadline if even one player stalls (no per-player "you're done, here's something to do"). |
| **2. Legible stakes & scoring** | **3** | `scores` is always in-view (vote + reveal + over). Good. But the *rule* is invisible: a new player sees "+1 appeared on Sam" with no on-card explanation of WHY Sam scored, and the "shame = trophy" reframe lives only in client copy, not in any engine signal. The scale is tiny (max 7) so a 1-point gap reads as huge or as nothing depending on round. |
| **3. Payoff beats** | **1** | **This is the worst lever and the biggest opportunity.** `resolveReveal` moves the score *before* reveal renders, then reveal dumps the final `tally` map atomically. There is no drumroll, no flip, no "and the room pointed at…", no surprise ordering. The "ohhh" is left entirely to the client with zero engine support (no reveal sub-state, no ordered reveal sequence, no "winner of the card" singled out). The design doc itself flags `revealStyle:'flip-one-by-one'` as *roadmap*, i.e. not built. |
| **4. Tension & comeback** | **1** | **No comeback mechanic exists.** Flat `+1` per round means a popular-target player can lead from round 1 and a quiet/absent player can be mathematically frozen out by round 4 with zero recovery lever. Fixed 7 rounds with no escalation, no final-round weighting, no "double points" → trailing players have no reason to keep caring. Co-winner ties *accidentally* dampen runaways but that's noise, not design. |
| **5. Social fuel** | **2** | The card *frames* an accusation ("Qui serait capable de…") — high potential. But the engine **structurally suppresses the payoff**: `votes` is hidden forever, so the table can never get the "TOI t'as voté ça ?!" moment the voice guide (§1.6, §4.5) calls "the fuel". The only social signal is the anonymous aggregate. We manufacture the gun and confiscate the bullets. |
| **6. One-more-round pull** | **2** | Rematch reshuffles the pack (fresh seed → different cards) — good for variety. But within a session there's no streak, no escalating spice, no cliffhanger, no micro-unlock. Round 7 ends identically to round 1. Nothing in the loop *begs* to repeat beyond "that card was funny." |
| **7. Onboarding by doing** | **3** | "Tap a person" is genuinely zero-rules — the strongest native lever here. But round 0 is a cold open with no softball ramp, and the reveal's meaning ("most-fingered wins the card") is never taught in-play; a first-timer can misread the +1. |
| **8. Replay variety** | **4** | 210-card pack, shuffled at `init`, `totalRounds` clamped to pack size. ~30 rematches before visible repeats. Genuinely strong. The only weakness is *sequencing*: no spice-curve ordering (a spicy-1 card can open round 0 cold; see §5). |
| **9. Pace per phase** | **3** | 20 s vote is right for a read-card-and-point action with early-resolve. 7 s reveal is *too long for a static number* and *too short for a real flip reveal* — it's in the dead zone (long enough to feel like waiting, too short to land drama). |

**Headline:** the template's machinery is excellent (fast, fair, redacted, never-blocks) but it is a **payoff-and-comeback desert**. The two lowest scores — Payoff (1) and Comeback (1) — are also the two highest-leverage fixes, and both can be done *as additive reducer/view branches with zero contract violation*.

---

## 2. The core retention thesis

The accusation card is a loaded gun the voice guide spent a whole document loading. The current engine **fires it into a pillow**: the result is an anonymous counter that already moved before you saw it. Three additive moves convert this template from "fast and forgettable" to "one-more-round sticky," all inside the pure `GameModule` contract:

1. **Engineer the payoff** — make reveal a *sequenced beat* with a redaction-safe "the room pointed at ___" moment, not an atomic data dump. (Lever 3)
2. **Surface the accusation safely** — give the table the "who pointed" social fuel WITHOUT breaking per-vote redaction, via an *opt-in, aggregate-derived* confession beat. (Lever 5)
3. **Keep it close** — add a final-round / escalation weighting and a tiny comeback lever so trailing players never go dead-rubber. (Lever 4)

Everything below is scoped to those three plus pace fixes and a writing-polish pass.

---

## 3. Mechanic changes (prioritised)

### P0 — build first (high impact, low/med risk)

#### P0-1 · Sequenced reveal sub-phase ("the room pointed at ___")
**What:** Split the single `reveal` phase into an engine-driven **two-beat reveal**: a short *suspense* beat (`reveal:tally-hidden`, ~1.5 s — card restated, "comptage…", scores frozen at PRE-round value) then the *verdict* beat (`reveal:verdict`, ~4.5 s — tally pops, the designated player(s) singled out, score `+1` animates). Crucially, **score must NOT pre-move**: defer the `scores += 1` mutation from `resolveReveal` into the verdict beat so the number visibly climbs *at the moment of reveal*, not before it. Implement as a `revealStep: 'count' | 'verdict'` field on state and a deadline that advances `count → verdict → next`.
**Lever:** 3 (Payoff) — primary; 2 (Legible scoring — the score now moves *because of* a visible cause).
**Impact:** high · **Risk:** med (touches `resolveReveal` ordering + `phaseKey` + `phaseDurationMs` + view union).
**Code scope:** `state.ts` (add `revealStep` to state + view union; split `revealMs` into `countMs`/`verdictMs` in `TracerConfig`); `tracer.ts` (`resolveReveal` sets `revealStep:'count'` and does NOT score; new `resolveVerdict` does the scoring + emits `round_revealed`; `reduce` deadline routing `vote→count→verdict→next`; `phaseDurationMs` per step; `phaseKey` → `reveal:${round}:${revealStep}`).
**Test impact:** `phases.test.ts` and `redaction.test.ts` both drive reveal with a single deadline — every `playRound` helper now needs an extra deadline hop; `phasekey.test.ts` gains the `:count`/`:verdict` suffix. New tests: score does NOT move at `count`, moves at `verdict`; tally hidden at `count`, shown at `verdict`. ~6 test edits + 4 new assertions.

#### P0-2 · Defer scoring out of `resolveReveal` (prerequisite + standalone win)
**What:** Even if P0-1's suspense beat is deferred, move the `+1` mutation so it is computed at the reveal-render boundary the client can animate against. Today `resolveReveal` returns state already carrying the new `scores`, so the vote-phase `scores` and the reveal-phase `scores` differ by the round's points with no intermediate frame. Expose `scoresBefore` + `scoresAfter` (or `delta`) in the reveal view so the client can animate the climb honestly.
**Lever:** 3 (Payoff), 2 (Legible).
**Impact:** med · **Risk:** low (pure view-shape addition; reducer math unchanged if shipped without P0-1).
**Code scope:** `tracer.ts` `view()` reveal branch (add `delta: Record<PlayerId, number>` = per-player points just awarded) + `resolveReveal` keeping a `lastDelta` on state. `state.ts` view union.
**Test impact:** new assertion in `redaction.test.ts`/`phases.test.ts` that reveal `delta` equals the round's awards and never leaks `votes`. ~2 new tests.

#### P0-3 · `who-s-most-likely` softball-first sequencing (spice-curve ordering)
**What:** `init` currently does a flat `shuffle`. For all three games, take the FIRST card from the *lowest-spice, highest-universality* band so round 0 is a guaranteed-funny softball that teaches the loop, then let spice escalate. Since the reducer must never inspect prompt text, implement this at the **content/pack layer**: ship an `openerPrompts` slice (or a `spicyTier` parallel array) and have `init` deterministically pick the opener from it via seeded RNG, then shuffle the remainder. No prompt-text inspection in the reducer — it reads a numeric tier array supplied by the pack.
**Lever:** 7 (Onboarding), 6 (escalating-spice pull), 8 (sequencing).
**Impact:** med · **Risk:** low (additive optional content field; falls back to flat shuffle if absent).
**Code scope:** `state.ts` `TracerContent` gains optional `spicy?: number[]` (parallel to `prompts`); `tracer.ts` `init` does a seeded stable-sort-by-tier-with-jitter instead of flat shuffle when `spicy` present. Engine `createRng`/`shuffle` only.
**Test impact:** `init.test.ts` gains "opener is lowest-tier when spicy array present" + "falls back to flat shuffle when absent" + "deterministic under same seed." ~3 new tests.

### P1 — high impact, higher risk (or med impact, low risk)

#### P1-1 · Opt-in confession beat ("own it" — redaction-safe social fuel)
**What:** The single biggest social leak is that `votes` is hidden forever, killing the "TOI t'as voté ça ?!" payoff. We do NOT break per-vote redaction (the brand's safety floor). Instead, after the verdict beat, add an OPTIONAL **`confess` micro-window** (~5 s, host-skippable, off by default for `-soft`): the engine reveals NOTHING new about ballots; it just surfaces a prompt ("Qui assume ? Tape si t'as voté ___") and lets any player *self-disclose* by tapping a "c'était moi" button on the designated target. Self-disclosure is voluntary, so it's safe — the player chooses to expose themselves, exactly the voice-guide §1.7 "confession framed as status" move. The engine tallies *self-disclosures* (a new, voluntary, non-redacted signal) and the client can show "3 owned it." No ballot edge is ever exposed.
**Lever:** 5 (Social fuel) — primary; 7 (confession-as-flex).
**Impact:** high · **Risk:** med (new phase, new action kind, new redaction surface — but the disclosed data is voluntary so the audit is *simpler* than ballots).
**Code scope:** `actions.ts` (new `{ kind:'confess'; target }` action variant + schema); `state.ts` (`confessions: Record<PlayerId, boolean>` HIDDEN until window end → revealed as count; `confess` phase in union + config `confessMs`, default `0`=off); `tracer.ts` (`reduce` accepts `confess` only in confess phase, only self-disclosure i.e. confessor admits they voted the round's designated target; `view` exposes `confessCount` not the map; `phaseDurationMs`/`phaseKey`). Gate behind `config.confessMs > 0` so `who-s-most-likely`/`-soft` ship with it OFF and the flagship can A/B it ON.
**Test impact:** new `confess.test.ts` (only fires when `confessMs>0`; rejects confess outside window; never serialises the `confessions` map, only the count; deadline advances confess→next). Redaction audit: confirm the voluntary-disclosure count cannot be reverse-engineered into ballot edges in small rooms (lint: suppress count display below room-size threshold — client concern, but assert the engine never emits per-player confess identity). ~5 new tests.

#### P1-2 · Final-round weighting + dead-rubber guard (comeback lever)
**What:** Make the last 1–2 rounds worth **double** (`+2` at `max`) so a trailing player is never mathematically eliminated and the climax round actually decides the crown. This is the cheapest possible comeback mechanic and directly answers Lever 4's score-of-1. Optionally pair with a "spotlight" rule: the current trailing player's card is drawn from a higher-stakes band (content-layer, like P0-3). Keep it deterministic, no RNG.
**Lever:** 4 (Tension & comeback) — primary; 6 (climax → one-more-round).
**Impact:** high · **Risk:** med (changes scoring legibility — must be taught on-card so it doesn't feel arbitrary; risk of *inflating* an already-leading popular target if they also win the double round).
**Code scope:** `state.ts` `TracerConfig` gains `finalRoundMultiplier?: number` (default 1 = off) + `doubleFromRound?: number`; `tracer.ts` `resolveReveal`/`resolveVerdict` multiply the award when `round >= totalRounds - doubleRounds`. View must expose the multiplier so the client can render "ROUND DOUBLE." 
**Test impact:** `phases.test.ts` "final round awards 2× at max"; "multiplier off by default → identical to today" (regression guard); legibility: view carries `roundMultiplier`. ~3 new tests.

#### P1-3 · Fast-voter micro-engagement (kill the post-vote wait)
**What:** A player who locks in at 3 s currently stares at a "waiting for others" screen for up to 17 s. Add a redaction-safe **prediction sub-bet for already-voted players only**: "combien de doigts sur [most-fingered]?" or "qui va gagner la carte?" — a private guess that scores a tiny bonus if right, revealed at verdict. This fills dead time, adds a second thing to be wrong about (voice-guide §4.6 "prediction gaps"), and never exposes ballots (the guess is about the *aggregate outcome*, not who voted what).
**Lever:** 1 (No dead time) — primary; 4 (extra scoring tension), 6.
**Impact:** med · **Risk:** med (adds a private per-player guess + its own redaction surface; the design doc parks "predict the verdict" as v3-evaluate precisely because it risks slowing the loop — mitigate by making it OFF by default and *non-blocking*: it never gates phase advance, it's pure overlay during the existing wait).
**Code scope:** `actions.ts` (`{ kind:'predict'; guessTarget }`); `state.ts` (`predictions` HIDDEN, `predictMs` n/a — runs *inside* the vote wait, no new phase, scored at verdict); `tracer.ts` (`reduce` accepts `predict` from players who have already voted, in vote phase; verdict awards bonus; view exposes only own prediction). Must NOT change early-resolve (still triggers on all *votes*, not predictions).
**Test impact:** prediction never blocks early-resolve; only accepted post-vote; own-prediction redaction; bonus math. ~4 new tests. Higher coupling risk → P1 not P0.

### P2 — nice-to-have / experimental

#### P2-1 · Streak / "hot seat" micro-escalation
**What:** Track per-player *consecutive rounds designated* (hidden derived counter). When a player wins the card 2+ rounds running, the client gets a `hotSeat: PlayerId` signal ("X is on a roll / X est en PLS") — pure flavour, no scoring change, fuels the "one-more" tease and a clippable moment.
**Lever:** 6, 5. **Impact:** low · **Risk:** low. **Code scope:** `tracer.ts` view derives a `streak` map from… nothing currently stored — needs a `designatedHistory` field on state (`state.ts`). **Test impact:** ~2 tests. **Caveat:** pile-on risk — must respect the §2.10 anti-dogpile framing; gate display, don't reward it.

#### P2-2 · Host-tunable timers via `templateParamsSchema(VOTE)`
**What:** The roadmap-v2 item (pires-potes decision #7): expose `voteMs`/`revealMs`(/`countMs`/`verdictMs`) to host. The module already reads them; this is protocol-schema only. Retention value: lets hosts tune pace to their table.
**Lever:** 9. **Impact:** low · **Risk:** low. **Code scope:** protocol package `templateParamsSchema`, no `tracer.ts` change. **Test impact:** schema validation tests only.

#### P2-3 · `targetScore` "first-to-N" mode (classic Pires Potes)
**What:** Roadmap-v2 decision #2 — optional `targetScore` ends the game when any player hits N cards. Retention value: variable-length cliffhanger ending. **Risk:** med — unbounded length in big rooms (why it was deferred). Keep P2.
**Lever:** 6, 4. **Impact:** low (variety, not core loop) · **Risk:** med. **Code scope:** `nextRound` gains a `targetScore` early-exit branch. **Test impact:** ~3 tests.

---

## 4. Timing proposals (ms per phase)

Current: `tracer` 30 000 / 5 000 · `pires-potes` 20 000 / 7 000.

| Game | Phase | Current ms | Proposed ms | Why |
|---|---|---|---|---|
| `pires-potes` | vote | 20 000 | **18 000** | Read-card-and-point is a sub-10 s action with early-resolve; 18 s caps the worst-case wait on one slow voter without rushing. |
| `pires-potes` | reveal → **count** | (part of 7 000) | **1 500** | New suspense beat — card restated, "comptage…", scores frozen. Short enough to be a held breath, not a wait. |
| `pires-potes` | reveal → **verdict** | (part of 7 000) | **4 500** | The pop + score climb + designated-player spotlight. This is the engineered "ohhh"; needs room to land. (count+verdict = 6 000, *shorter* than today's 7 000 dead number, but split into two beats so it *reads* longer in a good way.) |
| `pires-potes` | confess (P1-1, opt-in) | — | **5 000** (flagship only; 0 = off) | Long enough to tap "c'était moi," short enough not to drag. OFF for `-soft` and `who-s-most-likely`. |
| `who-s-most-likely` / `-soft` | vote | 20 000 | **18 000** | Same logic; all-ages table, no faster. |
| `who-s-most-likely` / `-soft` | count / verdict | 7 000 | **1 500 / 4 500** | Same reveal split; confess OFF. |
| `tracer` (Quick Vote) | vote | 30 000 | **20 000** | 30 s is a drag for a one-tap action; align to the family. |
| `tracer` (Quick Vote) | count / verdict | 5 000 | **1 500 / 3 500** | Slightly tighter for the bare Quick-Vote utility config. |

Net effect: round wall-time roughly unchanged (~24 s → ~24 s with confess off) but the 7 s of *dead number* becomes a 1.5 s breath + 4.5 s engineered reveal.

---

## 5. Writing-polish priorities

The content corpus (210 cards) is the template's strongest asset (Lever 8 = 4) and the voice guide §5.3 nails the target register. The weaknesses are **sequencing**, **UI chrome**, and a long tail of **category-not-detail cards** that read AI-bland. Priorities:

1. **Reveal/verdict copy — engineer the drop (highest priority, ties to P0-1).** Today's reveal is a number with no voice. The verdict beat needs deadpan-ironic crown copy that lands the "shame is the trophy" reframe. Bad (current implicit): a tally appears. Good: the designated player is *named with a verdict*. This is engine-adjacent UI copy, lowercase, no hype, no 😂.
   - **Example verdict line (FR):** « La salle a parlé. [name] remporte la carte. À l'unanimité, presque. » — for a clean win; for a tie: « Égalité. Vous êtes deux à assumer. Co-pires potes du tour. »
   - **Example "personne n'a voté" beat:** instead of a bug-looking blank, the deadpan: « Zéro doigt levé. Soit vous êtes des saints, soit vous êtes des lâches. Tour suivant. »

2. **Spice-curve sequencing (ties to P0-3).** Tag the 210 cards with their `spicy` tier (already authored: 166 t0 / 44 t1) and a `universality` hint so round 0 is always a guaranteed-laugh softball (a `bouffe`/`absurde` t0 card), and the spicy-1 `amour`/`argent`/phone-secret cards land in the back half where the table is warmed up. Today a cold-open spicy-1 ex card can kill the room's first impression.

3. **Kill the category-not-detail tail.** Audit for cards that gesture at a category instead of naming a detail (voice-guide §1.1 / §1.12 AI-tell). Two concrete rewrites:
   - **BEFORE (bland/AI):** « Qui est le plus susceptible d'être en retard ? » → **AFTER:** « Qui arriverait 40 min en retard à ton enterrement, McFlurry à la main, et foncerait quand même au premier rang ? » (the funeral-McFlurry register the design doc *already cites* as the target — make every card hit it).
   - **BEFORE (EN, category):** "Who spends too much time on their phone?" → **AFTER:** "Who has a private finsta dedicated to monitoring their ex's new situationship?" (escalation, §1.3 — last word most incriminating).

4. **UI-string deadpan pass.** Any "Vote now!" / "Get ready!" / Title-Case / 😂 in the client chrome is a daron-tell (voice-guide §1.8). Vote-phase nudge should be deadpan: « pointe quelqu'un. un seul. assume. » not "Choose a player!". Waiting state (fast voter): « t'as voté. maintenant tu regardes les autres se trahir. »

5. **Confess-beat copy (if P1-1 ships).** The "own it" button copy must frame self-exposure as a flex, not a confession (§1.7): « c'était moi 💀 » as the button, not "I admit I voted." The count reveal: « 3 ont assumé. Le reste ment. »

---

## 6. Keep as-is (do NOT touch — these are already sticky)

- **The simultaneous one-tap vote with early-resolve.** This is the template's beating heart and the reason Lever 1 (vote half) and Lever 7 score well. `state.players.every(p => votes[p] !== undefined)` early-resolve is perfect — it rewards a decisive table and never blocks on a slow one. Do not add a confirm step, do not add a rotating drawer (the design doc correctly cut that).
- **Per-vote ballot redaction (`votes` never serialised).** This is a brand-safety AND retention asset (anonymity is what lets people vote honestly = funnier reveals). P1-1's confession beat is *voluntary self-disclosure*, deliberately NOT a ballot reveal — keep that distinction sacred. Never expose voter→target edges.
- **Reject-invalid-returns-same-state discipline** (self-vote, non-roster, wrong-phase all return `{ state, effects: [] }`). Replay-safe, audit-clean. Every new action (`confess`, `predict`) must follow the identical pattern.
- **Seed-reshuffle-on-rematch + `totalRounds` clamp to pack size.** Lever 8 = 4 comes from here. Don't touch the shuffle contract (P0-3 *extends* it with an opt-in tier sort that falls back to it).
- **The 210-card pack's core voice** (the funeral-McFlurry register). The §5 writing pass is *sharpening the tail and sequencing*, not rewriting the corpus — most cards are good.
- **Fixed-7-rounds default** (vs first-to-N). It fits the ad cadence + Night-loop placement-XP (the shell consumes `gameOver.scores` → placement; fixed length keeps XP comparable across games). P2-3's `targetScore` is opt-in, not a default change.
- **`gameOver` clones scores (no aliasing).** Tested (`gameOver effect scores do not alias live state`). Any new state field must preserve this.

---

## 7. Build order (the one-paragraph plan)

Ship **P0-2** (deferred-scoring delta in the view) first — it's a low-risk view addition that immediately makes the score climb animatable. Then **P0-1** (sequenced count→verdict reveal) — the single highest-leverage payoff fix, building on P0-2's delta. Then **P0-3** (softball-first sequencing) — low-risk content-layer onboarding/spice-curve win. That P0 trio fixes the two worst levers (Payoff 1→4, plus onboarding/legibility) with no contract violation and modest test churn. Then A/B **P1-2** (final-round double — comeback) and **P1-1** (opt-in confession — social fuel) on the flagship only, keeping both OFF for `who-s-most-likely`/`-soft` via config defaults. Park **P1-3** (prediction sub-bet) behind a flag — high upside for dead-time but highest coupling risk. Leave **P2** items as backlog. Every change is an additive reducer/view branch or a config field; none breaks the pure `GameModule` contract, per-viewer redaction, seeded determinism, or the same-state-on-reject rule.
