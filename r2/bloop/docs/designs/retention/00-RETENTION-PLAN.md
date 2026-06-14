# Bloop — Consolidated Retention Program (Implementation Contract)

**Status:** authoritative build plan, consolidating the 10 per-template retention briefs in this folder.
**Date:** 2026-06-14
**Scope:** all 10 game templates in `packages/games/` (`tracer`, `option-vote`, `input-guess`, `secret-role`, `truth-dare`, `spotlight-guess`, `rule-hunt`, `last-standing`, `perform-judge`, `night-day`) covering 27 shipped games.
**Author:** lead designer (cross-template consolidation pass).

> Read this file FIRST. The per-template briefs (`tracer.md`, `option-vote.md`, …) are the detailed specs; this file is the **program**: the shared systems to build once, the dependency-ordered build waves, the risk register, and the single highest-leverage change per template.

---

## 0. The one-paragraph thesis

Every one of the 10 templates fails the **same three retention levers** and is rescued by the **same small set of primitives**. Across 10 independently-written briefs, the recurring diagnosis is: **(1) dead time** — after a player's one action they idle while one/few players act or while a reveal is passively watched; **(2) no comeback** — flat per-round scoring lets an early leader run away and freezes trailing/eliminated players into dead rubbers; **(3) under-served payoff** — the reveal (where the "ohhh" lives) is shipped 30–50% too short, and several reducers move the score *before* the reveal renders so there is no on-screen climb. The fix is therefore **not 50 bespoke tweaks** but **~6 cross-cutting engagement primitives** built once and parameterised per template, plus a per-template P0 wave that wires them in. Crucially, all of this must be done **without weakening the per-viewer redaction model**, which is simultaneously the brand-safety floor AND a retention asset (anonymity makes honest voting funnier). The hidden-buffer / aggregate-only / same-state-reference-on-reject contract is sacred in every brief and is the binding constraint on every change below.

---

## 1. CROSS-CUTTING ENGAGEMENT SYSTEMS

Build these as **shared, parameterised primitives** (in `packages/engine/` or a shared `packages/games/_shared/` module the templates import), not as per-game copies. Each is named in 6–10 of the 10 briefs under different local labels; unifying them is the single biggest leverage in the whole program.

### CC-1 — Idle-Killer Side-Bet / Prediction Channel  ⭐ keystone

**What:** a generic *hidden-buffer secondary stake* that any non-acting player can place during the phase where they would otherwise idle. It is the same mechanical object everywhere: a small enum/target bet (`predict`, `bet`, `react-to-predict`) written into a redacted buffer that resolves **at the reveal** against the round's public outcome, paying a small flavour-currency bonus. It NEVER gates the primary early-resolve and NEVER leaks the primary ballot.

**Local names across briefs:** tracer "fast-voter prediction sub-bet" + "confession beat"; option-vote "predictions revealed at reveal" + debate "react" micro-vote; input-guess "live submission ticker"; secret-role "vote heat / debate spine" + pre-stage; truth-dare "call-your-shot predictions" (P0-1, the named keystone); spotlight-guess "predict the room during talk" / "predict the answer"; last-standing "survives-or-chokes side-bet" (P0-1, named keystone); perform-judge "audience react taps" (P0-2); rule-hunt "heat-check flag/clean" (P0-2); night-day "night-read" upgrade of the decoy (P0-2).

**Applies to:** ALL 10 templates.
**Build once:** **yes** — one buffer type + one redaction pattern + one resolve hook; each template supplies the enum, the eligibility predicate, and the resolve-against-outcome comparator.
**Impact:** very high (it is the #1 named fix in 8 of 10 briefs).
**Risk:** med — every instance adds a new redacted field and a new action; the audit must prove (a) the bet never leaks the primary ballot, (b) it never changes the primary early-resolve condition, (c) reject-invalid returns the same state reference.

### CC-2 — Comeback Scoring Kit (final-round / late-round multiplier + streak)

**What:** two pure, deterministic, default-OFF scoring modifiers usable by any reducer at its award site:
- **`roundMultiplier(round, totalRounds)`** — a pure function (e.g. last 1–2 rounds ×2/×3) so a trailing/eliminated player is never mathematically frozen out and the climax decides the crown. No RNG.
- **`streak`** — a per-player consecutive-success counter with a small capped bonus and a "tag" the client surfaces (the tag does the retention work; the bonus stays flavour-small).

**Local names:** tracer "final-round weighting + dead-rubber guard"; option-vote "streak bonus" (P0) + tie-relief; input-guess "crowd finale ×2" (P0-3) + "on-fire multiplier"; secret-role "matchScoreMultiplier [1,1.5,2]"; truth-dare "tier-weighted done points"; spotlight-guess "escalating late-round multiplier" (La Note) + "last-round tier ×2" (Devine); last-standing "escalating survivorPoints by round" (P0-2); perform-judge "Money Round final-lap ×1.5"; rule-hunt "double-or-nothing final round" (P2). (Night-day is the only template that explicitly does NOT want this — werewolf is already comeback-strong; do not add.)

**Applies to:** 9 of 10 (all except `night-day`).
**Build once:** **yes** — one pure helper + one config shape (`finalRoundMultiplier?`, `doubleFromRound?`, `streakBonus?`, `streakCap?`), defaulting to identity so existing scoring tests stay green at ×1.
**Impact:** high — fixes the worst or second-worst lever in 9 briefs.
**Risk:** med — touches the load-bearing scoring path; must keep cross-game placement-XP comparable (placement-based, so internal-scale escalation is safe — re-confirm per GDD §2.2), and must default to byte-identical current behaviour.

### CC-3 — Two-Beat Reveal + Deferred Scoring  ⭐ cheapest universal win

**What:** a shared reveal convention with two parts: a short **suspense hold** (counting / "incoming", scores frozen) then the **verdict slam** (tally pops + the score visibly climbs + the designated player is named). The critical sub-rule: **defer the score mutation OUT of the resolve step into the verdict beat** so the number climbs ON screen, and expose a `delta` (points just awarded) in the reveal view so the client animates honestly. Pair with the timing fixes (CC-6).

**Local names:** tracer "sequenced reveal sub-phase + defer scoring out of resolveReveal" (its two P0s); option-vote/input-guess "two-stage reveal pacing"; every other brief asks for "stretch the reveal, split into two beats, let the points burst land."

**Applies to:** ALL 10 (as the rendering convention); the *engine-level deferred-scoring + delta* is most load-bearing in `tracer` (where scoring currently moves before reveal) and valuable in `input-guess`, `spotlight-guess`, `secret-role`.
**Build once:** **partial** — the client-side two-beat animation contract + the `delta`/`revealStep` view fields are a shared convention; tracer's reducer-level phase split is template-specific but the *pattern* (resolve sets state, verdict awards) is copied.
**Impact:** high; **Risk:** low for the timing/`delta` half, med for tracer's phase split (extra deadline hop changes test helpers).

### CC-4 — "Everyone Reacts" Emote/Ack Channel (fixed-enum, public counts)

**What:** a transient, fixed-emoji (zero-moderation) reaction channel that turns a passive watch beat into a shared, clippable table moment. Public-by-design counts, owner-echo for "did I react", **never affects resolution**, cleared at phase exit. Distinct from CC-1 (which is a *scored hidden bet*); CC-4 is *unscored public expression*.

**Local names:** perform-judge "audience react taps" (P0-2, doubles as CC-1's idle-killer there); truth-dare "react beat on escape turns" (P1-3); night-day "tap-to-react during dawn/lynchReveal" (P2-2); option-vote debate "react" micro-vote; rule-hunt "ghostReact" for eliminated.

**Applies to:** perform-judge, truth-dare, night-day, option-vote (debate), rule-hunt (bench) — ~5 templates.
**Build once:** **yes** — one fixed-enum action + transient buffer + public-count view projection. Reuse perform-judge's puppet-tap buffer shape.
**Impact:** med; **Risk:** low (public by design, no info surface) — the ONE hard rule: a react must NEVER resolve a turn (unlike puppet's scoring `tap`).

### CC-5 — Cliffhanger / Streak / Superlative Epilogue Payload

**What:** a derived, additive **`over`/scoreboard view payload** (no new in-match secret, computed only where data is already public) carrying: `closeRace`/`closeFinish` (top-2 gap ≤ one award), per-player streak/`survivedAllRounds`/`mvp`/`cleanestWolf` superlatives, and the round-multiplier flag for "ROUND DOUBLE" chrome. Feeds the session-shell Oracle roast and the rematch CTA — the actual one-more-round pull lives at the session layer, and each game must hand it ammunition.

**Local names:** tracer "streak/hot-seat" + "roundMultiplier chrome"; option-vote "reveal cliffhanger flag" + "live Contrarian badge"; input-guess "reveal table-awards / named call-outs"; secret-role "derived streak + cliffhanger between matches"; truth-dare "drama tag contested/roasted"; spotlight-guess scoreboard beat; last-standing "cliffhanger + over superlatives" (P1-1/P1-2); perform-judge "near-miss + MVP card" (P1-2); rule-hunt "crime-parfait streak surfaced" (P0-4); night-day "over epilogue payload" (P1-2).

**Applies to:** ALL 10.
**Build once:** **yes** — one `over`/scoreboard payload shape + a set of pure derivation helpers (top-2 gap, longest-streak, per-player accuracy). Templates opt in fields.
**Impact:** med–high (one-more-round is a bottom-3 lever in nearly every brief); **Risk:** low — derived at `over` from already-public state.

### CC-6 — Phase-Timing Reconciliation Pass (config-only)

**What:** a single sweep correcting the **shipped-vs-spec `revealMs` drift** and rebalancing pace. Multiple briefs found the reveal ships at **half** its designed length (input-guess 6_000 vs 12_000 spec; rule-hunt 6_000 vs 12_000 spec; option-vote docs wrongly say 15_000 vs real 6_000; secret-role/night-day code authoritative over doc). General pattern: **shorten dead/solo-actor phases, lengthen the reveal, reconcile docs to code.** Pure config constants + doc fixes, no reducer logic.

**Applies to:** ALL 10.
**Build once:** **no** (per-config constants) but it is **one coordinated PR** done as a batch — lowest risk, highest immediate ROI, and it unblocks the two-beat reveal (CC-3).
**Impact:** high (cheapest payoff win in 6 briefs); **Risk:** low — update literal-ms assertions in each `phases.test.ts`.

### CC-7 — Spice-Curve / Escalation Sequencing (content + seeded draw)

**What:** replace flat-shuffle init with a **seeded softball-first / escalating draw** driven by a numeric tier array the pack supplies (the reducer must NOT inspect prompt text). Round 0 is a guaranteed-laugh low-tier card that teaches the loop by playing it; spicier cards land in the warmed-up back half. Falls back to flat shuffle when the tier array is absent (preserving the strong replay-variety scores).

**Local names:** tracer "who-s-most-likely softball-first sequencing" (P0-3); option-vote "escalating deck draw / spice ramp" (P1); truth-dare "tierProgression: escalate" (P0); last-standing "escalating-spice content config"; secret-role "closeness-aware difficulty ramp"; spotlight-guess/perform-judge content-distribution gaps.

**Applies to:** tracer, option-vote, truth-dare, last-standing, secret-role (~5 templates with the draw change; all 10 get the content tagging).
**Build once:** **partial** — the seeded tier-sort helper is shared; the `spicy?:number[]`/`tier` parallel-array convention is shared; the per-pack authoring is content-ops.
**Impact:** med; **Risk:** low — must keep init determinism (same seed → same order) and the flat-shuffle fallback.

> **Leverage summary:** CC-1, CC-2, CC-3, CC-5 are the four highest-leverage shared builds. CC-6 is the cheapest immediate win and a prerequisite for CC-3. CC-4 and CC-7 are reused by ~5 templates each. Building these 7 once replaces ~40 of the ~80 bespoke mechanic changes across the briefs.

---

## 2. BUILD WAVES (dependency-ordered)

> Sequencing principle: **Wave 1** = lowest-risk, highest-immediate-ROI, and the shared primitives that unblock everything else. **Wave 2** = per-template P0 mechanic changes (wire the primitives in + the template-specific keystones). **Wave 3** = P1 / experimental. Within a wave, items are independent and parallelisable unless noted. Content-ops (encoding fixes, pack tagging, voice polish) runs **in parallel** throughout and is listed in Wave 1 where it blocks code (night-day encoding, CC-7 tagging).

### WAVE 1 — Config wins + shared primitives + unblocking content

*Goal: ship the free pacing/payoff wins this week, and stand up the reusable systems Wave 2 depends on.*

1. **CC-6 timing reconciliation (config-only, all 10).** Fix `revealMs` drift (input-guess 6→12s, rule-hunt 6→12s, option-vote reconcile docs + 6→9s/8s, tracer split, spotlight 6→9s, secret-role finalReveal 7→9s + cut discuss 120→75/90→50s, night-day reveal/night re-time, last-standing draw 4→2.5 / result 2→2.8s, perform-judge guided 75→55 / rate ready 15→8 / reveal 6→8s, truth-dare choose 15→9 / score 6→8.5s). Update each `phases.test.ts` literal. **Risk: low.**
2. **CC-2 Comeback Scoring Kit** — pure `roundMultiplier` + `streak` helper + config shape, default identity. Lands with regression tests proving ×1 == today. **Unblocks** the comeback P0/P1s in 9 templates.
3. **CC-3 reveal convention** — `revealStep`/`delta` view fields + the two-beat client contract + the "resolve sets state, verdict awards" pattern. **Unblocks** tracer's keystone and every reveal animation.
4. **CC-1 Side-Bet primitive** — shared hidden-buffer + redaction pattern + resolve-at-reveal hook + the never-gate-early-resolve guard. **Unblocks** the keystone idle-killer in all 10.
5. **CC-5 epilogue payload** shape + derivation helpers. **Unblocks** every over/scoreboard cliffhanger.
6. **CC-4 react channel** (fixed-enum, public counts, never-resolves) + **CC-7 seeded tier-sort** helper + `spicy?:number[]` convention.
7. **Content-ops blockers (parallel):** night-day **pack UTF-8 re-export** (ships broken French today — highest content priority); CC-7 tier tagging for tracer (210 cards, 166 t0/44 t1 already authored), option-vote, truth-dare, last-standing decks; tracer/input-guess/spotlight reveal-caption authoring.

### WAVE 2 — Per-template P0 mechanic changes (wire-in + keystones)

*Each item names the template + the specific change. These are the per-brief P0s; most consume a Wave-1 primitive.*

- **tracer** — Sequenced reveal sub-phase (count→verdict) + **defer scoring out of resolveReveal, expose `delta`** (consumes CC-3); who-s-most-likely softball-first sequencing (consumes CC-7).
- **option-vote** — **Reveal predictions at reveal** (Tu Préfères — ship the game's best beat, consumes CC-1 pattern) + **streak bonus ON** (consumes CC-2); reconcile docs + add `revealMs` to host allowlist.
- **input-guess** — **Live submission ticker** replacing the boolean board (consumes CC-1 ticker) + **crowd-target finale ×2** (consumes CC-2) + **reveal named call-outs** (consumes CC-5).
- **secret-role** — **Cut discuss timers** (120→75 / 90→50, CC-6) + **pressure ticker / debate spine** during discuss (consumes CC-1/CC-4) + **named ballots at finalReveal** + stretch reveal 7→9s.
- **truth-dare** — **Call-your-shot predictions** (non-active players bet Done/Chicken during prompt — the keystone, consumes CC-1) + **spice-escalation ladder** `tierProgression:escalate` (consumes CC-7) + retune timers (CC-6).
- **spotlight-guess** — **La Note live-dial during talk** (consumes CC-1) + **Devine give guessers a job during answer** (lite react first, gated full prediction) + **turn on La Note scoreboard beat** (consumes CC-5) + reveal 6→9s.
- **rule-hunt** — **`revealMs` 6→12s** (CC-6) + **"Heat check" forced spotlight micro-beat in `live`** (the game-saver, consumes CC-1 flag/clean) + surface "room still clean" stake + **crime-parfait streak** (consumes CC-5).
- **last-standing** — **Spotlight side-bet survives/chokes** (the keystone, consumes CC-1 + lets dead players keep scoring) + **comeback rebalance** survivorPoints 3→2 escalating by round (consumes CC-2) + re-time draw→result.
- **perform-judge** — **Retune durations** (CC-6) + **audience react taps during perform** (kills rate/credit dead time, consumes CC-4) + **always-on running standings + final-lap board** (consumes CC-5) + judge-side onboarding hints.
- **night-day** — **Re-tune reveal/night timings** (CC-6) + **night-decoy → "Night Read" micro-engagement** (consumes CC-1 pattern, byte-identical view keys) + **ghost engagement (Death Wager / Last Will)** for dead players (the headline fix).

### WAVE 3 — P1 / experimental (after Wave 2 is green and audited)

- **CC-2 comeback rollouts** where P1 in the brief: tracer final-round weighting + confession beat; option-vote tie-relief (tiePolicy) + Gauche debate shorten + thesis micro-vote; input-guess on-fire streak + legible crowd scoring; secret-role matchScoreMultiplier + cliffhanger; truth-dare tier-weighted done points + drama tags + react-on-escape; spotlight La Note/Devine multipliers + pack growth 30→45; last-standing cliffhanger flags + over superlatives; perform-judge final-lap ×1.5 + near-miss/MVP cards; rule-hunt detective briefing job + heat-meter payoff; night-day over epilogue + first-night shield (A/B).
- **Experimental (P2 in briefs, gate on analytics):** tracer host-tunable timers + targetScore; option-vote lock-in copy + live Contrarian badge; input-guess Juste Prix bustIfOver sibling + spicy-1 packs; secret-role caught-impostor steal-back guess + closeness ramp; truth-dare double-down streak + dealer's-choice wildcard; spotlight consensus bonus + la-roue rider; rule-hunt ghost beat + double-or-nothing + hard-mode; last-standing sudden-death tie-break + grudge reveal; perform-judge predict-the-stars + clip hook; night-day hunter role (roadmap #1, doubles as death-idle fix) + dawn reactions.

---

## 3. RISK REGISTER

The changes most likely to break **redaction**, **determinism**, or **tests**, ranked, with de-risk steps. The binding invariants are identical across all briefs: per-viewer redaction (hidden buffers / aggregate-or-owner-only), seeded RNG only (no wall-clock), reject-invalid returns the **same state reference**, and match-end-or-reveal-only scoring where info would otherwise leak.

1. **Reversing a deliberate redaction (HIGHEST).** option-vote MC-2 (predictions secret-forever → secret-until-reveal) and secret-role P0-3 (named ballots at finalReveal) *intentionally* loosen a redaction the tests assert. **De-risk:** require product sign-off; rewrite the "never exposed" test to "hidden in choose/in-match, exposed only at reveal/finalReveal"; add a choose-phase / pre-reveal audit proving NO other player's bet leaks; keep tracer's per-vote ballot redaction sacred (its confession is *voluntary self-disclosure*, never a ballot reveal — keep that distinction).
2. **Triangulation leak from a new partial-info view.** spotlight-guess P0-B full (expose `answers` during Devine's answer phase) — the design doc itself warns options+later-candidates can triangulate the real question. **De-risk:** ship P0-B-**lite** (content-free react) first; gate full prediction behind a redaction audit proving options-alone ≠ question, using a separate per-viewer field.
3. **Side-bet changing the primary early-resolve (CC-1, all 10).** A prediction/bet/react that accidentally counts toward `allActed`/early-resolve corrupts the core loop. **De-risk:** make CC-1 the FIRST shared build with a single guarded resolve hook; unit-test in every consumer that the bet is accepted only from already-acted/non-acting players, never blocks early-resolve, and reject-invalid returns the same reference. Hard rule for CC-4: a react must NEVER resolve a turn.
4. **New phase / extra deadline hop breaking determinism + test helpers.** tracer's count→verdict split, rule-hunt's `spotlight` sub-beat (touches `interruptSeq` + the banked clock), last-standing/secret-role new sub-phases. **De-risk:** reuse existing phase machinery (`phaseKey`/`phaseDurationMs`) — never a wall clock; re-pass the replay-equality + interrupt-vs-deadline-race + tiny-remainder-resume tests (rule-hunt `clock.test.ts`); update `playRound` helpers for the extra hop deliberately, not incidentally.
5. **Comeback multiplier distorting scoring tests / placement-XP (CC-2).** Changing award magnitudes breaks exact-score assertions and could skew cross-game XP. **De-risk:** default multiplier = 1 / streakBonus = 0 so existing tests stay green; assert existing cases run on lap-0/round-0 (×1); confirm placement-XP is placement-based (internal-scale escalation is comparable per GDD §2.2); re-baseline only the explicitly-changed cases.
6. **Night-day decoy invariant (byte-identical view keys + tap counts).** Night-Read must preserve identical view *keys* and lock-count across actor/non-actor or it breaks the anti-shoulder-surf invariant. **De-risk:** store the read in a strictly-more-hidden map, keep `nightAck` valid as the "no read" path, assert key-parity and that `acted`/all-acted semantics are unchanged.
7. **Ghost / dead-player action channel (night-day P0-1).** The only place a dead player may act — must never appear in any living/other view. **De-risk:** accept only when `alive[id]===false`, owner-only echo + `over`-only reveal, cosmetic scoring that never perturbs the 0–3 placement scale; run the full `leakedSecrets` matrix across all four viewer kinds.
8. **Inert-but-coded paths going live untested.** input-guess `busted[]` (bustIfOver) and similar are coded but only exercised by a new sibling config. **De-risk:** add coverage for the previously-dead path BEFORE shipping the config that activates it.
9. **Spice-curve init reading prompt text (CC-7).** If the reducer inspects card text to sort by tier it breaks purity/determinism and couples engine to content. **De-risk:** the pack supplies a numeric `spicy?:number[]`/`tier` parallel array; reducer does a seeded stable-sort-by-tier-with-jitter; flat-shuffle fallback when absent; assert same seed → same order.

**Two non-negotiable regression gates after EVERY change:** the redaction audit (`redaction.test.ts` / `integration-audit.test.ts` `leakedSecrets`) and, for any clock/phase change, the determinism/replay-equality suite. Nothing merges red on either.

---

## 4. topP0 — single highest-leverage change per template

1. **tracer** — Sequenced reveal sub-phase (count→verdict) that **defers the `+1` out of `resolveReveal` into the verdict beat and exposes a `delta`**, so the score visibly climbs at reveal with a named designated player instead of the number silently pre-moving. (Fixes payoff lever 1→ up; consumes CC-3.)
2. **option-vote** — **Reveal predictions at reveal in Tu Préfères** (`RoundResult.predictions`, exposed only in reveal/over, redacted in choose) — ships the game's best, currently-unshippable beat ("tu connais pas tes potes"). (Consumes CC-1 pattern; needs the deliberate-redaction sign-off in Risk #1.)
3. **input-guess** — **`revealMs` 6_000 → 12_000 in both configs** — the only payoff/argument beat is shipped at half its designed length; one-constant, highest-ROI fix on the template. (CC-6.)
4. **secret-role** — **Cut discuss timers hard (120→75 / 90→50) + live debate spine** during discuss — kills the #1 leak (up to 3.5 min of dead phone per match). (CC-6 + CC-1/CC-4.)
5. **truth-dare** — **Call-your-shot predictions:** non-active players bet Done/Chicken during prompt, folding into the verdict buffer, scored at score — gives the spectating 5-of-6 players an act every turn and teaches voters by doing. (The keystone; consumes CC-1.)
6. **spotlight-guess** — **La Note live-dial during talk** — guessers set a first-impression dial into the existing hidden buffer during the 45s talk, turning the template's worst dead beat into live "he's losing me, dropping to a 3." (Consumes CC-1; zero new secret.)
7. **rule-hunt** — **"Heat check" forced spotlight micro-beat inside `live`** — names one random follower every ~24s and forces a free flag/clean tap from everyone, modelling the 180s of unmodelled performance time that is the game's single biggest hole. (The game-saver; consumes CC-1, banks the clock like `accuse`.)
8. **last-standing** — **Spotlight side-bet (survives/chokes)** — every non-spotlight player (alive OR eliminated) predicts the jury verdict each turn for a separate currency, killing `say` idle AND letting eliminated players keep scoring (attacks the dead-rubber lever simultaneously). (The keystone; consumes CC-1.)
9. **perform-judge** — **Audience "live reaction" taps during `perform`** — converts the dead 30–45s where the rate/credit audience watches with idle phones into continuous micro-agency, riding into the reveal card. (Consumes CC-4; hard rule: never resolves the turn.)
10. **night-day** — **Night-decoy → "Night Read" micro-engagement** — replaces the no-op `nightAck` with a private hunch that locks the seat identically (byte-for-byte anonymity preserved), giving every living non-actor a real action and teaching "you're hunting wolves" by doing on night 1. (Consumes CC-1 pattern; ghost engagement is the close-second headline fix.)

---

## 5. Build-order one-liner

**Wave 1** (config timing reconciliation + the 6 shared primitives CC-1..CC-7 + night-day encoding/pack tagging) → **Wave 2** (the 10 per-template P0s, each wiring a primitive) → **Wave 3** (P1 comeback rollouts + analytics-gated experiments). Redaction audit and determinism/replay suites are green-gates on every merge.
