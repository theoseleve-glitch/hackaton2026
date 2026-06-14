# Retention Redesign — `truth-dare` template

**Template:** `TRUTH_DARE@2` (`packages/games/truth-dare/`)
**Games on it:** `truth-or-dare-2` (FUN), `truth-or-dare-lover` (18+ sibling, config-only), `truth-or-drink` (truth-only + drink escape), and the safe `truth-or-forfeit` sibling.
**Author:** retention-first pass, grounded in the real reducer (`src/truth-dare.ts`), config (`src/state.ts`), and the shipped designs.
**Date:** 2026-06-14

---

## 0. The EXACT current loop (read from code, not the doc)

One module, one rotating hot-seat. Per turn (`enterTurn` → `resolveChoice` → `enterVerdict` → `toScore`):

| Phase | Dur (FUN / DRINK) | Who acts | Who waits |
|---|---|---|---|
| `choose` | 15 000 / **0 (auto-skip)** ms | **active only** picks Truth/Dare via chips (`chooseType`); timeout → seeded auto-pick coin (`createRng(seed+'\|coin\|'+turnSeq)`) | **everyone else watches a waiting card** |
| `prompt` | 45 000 / 35 000 ms | **active only** performs IRL, taps Done / Chickened / Pass (`declare` / `pass`); timeout = chickened, no pass spent | **everyone else reads + watches** |
| `verdict` | 20 000 / 15 000 ms | **non-active present players** vote done/chickened into a HIDDEN buffer (`verdicts`), first vote locks; **reached ONLY after a `done` claim** — pass and self-chicken skip it | **active player + already-voted players wait** |
| `score` | 6 000 / 7 000 ms | nobody (inert) | everybody — stamp + public `tally` + points burst, auto-advance |
| `over` | `null` | nobody | final podium |

**Scoring (real constants, `toScore` mutates ONLY `scores[activePlayer]`):**
- done+truth = `donePoints` 10 · done+dare = 10 + `dareBonus` 5 = **15** (FUN; drink `dareBonus:0`) · passed = `passPoints` **3** · chickened = **0**.
- **Voters never score.** `resolveVerdict`: 0 cast → done; else done iff `done/cast >= 0.5` (ties → done, `>=` load-bearing).
- Win = highest cumulative after `totalRounds` laps (FUN 3, LOVER 4, DRINK 2). No in-engine tiebreak; `gameOver(scores)` → shell does **placement-based XP** (`40 + 60×topShare`, floor 40, streak ≤1.25×). Internal 10/15/3/0 scale is never cross-game-compared, so we have latitude to retune it for *in-match* drama without touching XP fairness.

**The structural retention facts that fall straight out of this:**
1. In a 6-player FUN room, **5 of 6 players are spectators for choose+prompt = up to 60 s/turn.** The only beat where a non-active player touches the screen is `verdict` — and `verdict` only happens on a Done claim. A turn that ends in pass/chicken/timeout gives the other 5 players **zero interaction for the entire turn.**
2. **Voters are unscored.** A trailing player cannot improve their position on anyone else's turn. Their vote is pure judging, no skin in the game → low-stakes, low-attention voting.
3. **The biggest payoff — the hidden→revealed verdict tally ("TOI t'as voté chicken ?!")** — is real and good, but it's gated behind Done-only and auto-advances in 6–7 s flat with no name attached (counts only). The single best engineered "no way" moment is under-served by timing and anonymity.
4. **No escalation, no streak, no cliffhanger.** Tier is room-fixed (`fixed-highest` with fall-down). turnSeq just increments. Nothing makes the room *want the next turn* beyond "it's my go soon".

---

## 1. Lever scorecard (0–5, with code evidence)

| # | Lever | Score | Evidence |
|---|---|---:|---|
| 1 | **No dead time** | **1** | choose+prompt = up to 60 s where only `activePlayer` can produce an event (every other branch is `if (playerId !== state.activePlayer) return NOOP`). Non-active players have NO input until `verdict`, which 30–50% of turns skip (pass/chicken/timeout all bypass `enterVerdict`). |
| 2 | **Legible stakes & scoring** | **3** | Points are simple and shown (`scores` in every `TdCommonView`; tally bar at score). But voters score nothing, so "why do I care about this turn" is unanswered for everyone not in the seat. Pass=3 vs done=10/15 is legible. |
| 3 | **Payoff beats** | **3** | The hidden-verdict reveal is a real engineered beat (`verdicts` redacted in-flight, promoted to public `tally` at score). Undercut by: counts-only (no "who"), 6 s window, and only ~half of turns reach it. |
| 4 | **Tension & comeback** | **2** | No catch-up: only the active player can gain points on their turn, gains are flat (10/15/3/0), and a runaway leader is never pulled back. Late laps for a trailing player are dead rubber — they can't close a 30-pt gap with 15-pt turns. The shell's streak ≤1.25× is the ONLY comeback lever and it lives outside the reducer. |
| 5 | **Social fuel** | **3** | The verdict IS an accusation engine ("Dégonflé 🐔"), and prompts call out the room — genuinely good. But the call-out is anonymous (counts, never names), and there's no clippable artifact, no "the room decided X about you" sticky moment surfaced to score. |
| 6 | **One-more-round pull** | **1** | Nothing escalates. `tierProgression` is `fixed-highest`. No streak state, no cliffhanger, no micro-unlock. Laps are interchangeable; the loop has no internal reason to BEG to repeat — it just runs out of laps. |
| 7 | **Onboarding by doing** | **4** | Genuinely strong: big T/D chips, drawn prompt, "C'est fait / Je passe", room votes. First turn teaches the whole loop with zero rules. Auto-skip choose in drink is even cleaner. Minor gap: a first-time *voter* isn't taught the stakes of their vote (because there are none). |
| 8 | **Replay variety** | **3** | Seeded no-repeat draw + tier fall-down + fresh rematch seed is solid *within* the engine. But content is **35/tier FUN, 25/tier LOVER** — below the max-room lint; a 6-player FUN game burns ~18 prompts/lap and repeats show within ~2 rematches. The mechanic doesn't vary — every turn is identical shape. |
| 9 | **Pace per phase** | **2** | `chooseMs 15 000` is far too long for a 2-tap decision with nothing else on screen. `promptMs 45 000` is right for a dare but a drag for a one-line truth where the active player already knows the answer. `scoreMs 6 000` is too short for the reveal that is the game's best beat. |

**Headline:** Onboarding and the verdict *concept* are strong (don't break them). The template bleeds retention on **dead time for non-active players (lever 1), zero comeback (lever 4), and no one-more-round pull (lever 6)** — all three are reducer-level, all three are fixable inside the pure-GameModule contract.

---

## 2. Mechanic changes (scoped, prioritised)

Each respects: pure `init/reduce/view/phaseDurationMs/phaseKey`, server-authoritative, per-viewer redaction, seeded RNG only, reject-invalid = same state reference, unit-testable + redaction-auditable, no runtime AI.

### P0 — build first (high impact, low/med risk)

---

#### P0-1 · "Call your shot" prediction: non-active players bet Done/Chicken DURING `prompt`

**What:** While the active player performs (`prompt` phase), every **non-active present** player taps a private prediction — will they pull it off (`done`) or bottle it (`chicken`)? This is the SAME enum the verdict already uses. At `score`, predictors who guessed the outcome correctly earn a small **spectator point** (`spectatorPoints`, e.g. +2). The active player never sees predictions in-flight (redacted exactly like `verdicts` today).

**Why it's the keystone:** it converts the 35–45 s spectator void (lever 1, the worst hole) into an every-player act-every-turn beat, AND gives voters/trailers a way to score on turns that aren't theirs (lever 4 comeback), AND seeds the reveal with "you called it / you fumbled the read" (lever 3 payoff). One mechanic, three of the lowest scores lifted.

**Mechanically it folds INTO the existing verdict, not beside it:** a prediction of `done` cast during `prompt` simply *becomes* that player's verdict vote when a Done claim is later adjudicated — so contested-claim turns need no second tap. On pass/chicken/timeout turns (which skip verdict today), the prediction still resolves at score against the actual outcome. This is why it's P0 and not a bolt-on: it reuses the `verdicts` buffer, its redaction, and `resolveVerdict`.

- **Lever:** 1 (dead time), 4 (comeback — trailers earn on every turn), 3 (payoff).
- **Impact:** high · **Risk:** med (changes who-scores; needs careful redaction audit + tally math).
- **Code scope:** `state.ts` — add `predictions: Record<PlayerId, Verdict>` (HIDDEN, mirror `verdicts`), `spectatorPoints: number` to config, extend `TdResult` with a `spectatorTally`/`correctPredictors` count (counts only — no names, preserve anti-griefing). `actions.ts` — add `{ kind:'predict'; bet:Verdict }` to the schema + union. `truth-dare.ts` — accept `predict` only in `prompt` from non-active present players, first-bet-locks (mirror the verdict lock); in `toScore`, award `spectatorPoints` to predictors whose bet matches the final `verdict`; in `enterVerdict`, **seed `verdicts` from `predictions`** so a `done` predictor is pre-counted (and can still be allowed one override during `verdict`). `view.ts` (prompt branch) — add `youCanPredict` (viewer-specific, non-active && present && not-yet-bet) and `youPredicted` echo; keep `predictions` out of the serialized view.
- **Test impact:** new `predictions.test.ts` (lock-once, non-active-only, scoring at score); extend `redaction.test.ts` HIDDEN_KEYS with `"predictions"`; extend `scoring.test.ts` for spectator awards; `presence.test.ts` for predictor-leaves-mid-prompt. The redaction audit (`integration-audit.test.ts`) must show predictions never leak.
- **Spec note:** `spectatorPoints` MUST stay small (≤2) vs active done (10/15) so the seat is still where the game is won — but non-zero so spectating has stakes. Keep it locked (not host-tunable) so placement-XP comparability is unaffected.

---

#### P0-2 · Spice escalation ladder (`tierProgression:'escalate'`) — already pre-scoped as roadmap, promote to P0

**What:** Round index maps to ascending tiers instead of room-fixed highest. FUN: lap 1 draws `soft`, laps 2–3 `party`. LOVER: lap 1 `party`, laps 2+ `spicy`. DRINK: lap 1 `party`, lap 2 `spicy`. A tiny branch in `draw()`/`resolveChoice` filtering `TIER_ORDER` by `round`.

**Why:** this is the missing **one-more-round engine** (lever 6, currently scored 1). "It gets spicier each lap" is the single cheapest cliffhanger we can ship; it also fixes LOVER opening cold at spicy-2 with no warm-up (an existing flagged risk) and gives DRINK its interrogation-escalation arc. The design doc already pre-scoped this (`truth-or-dare-2.md` #7, `truth-or-drink.md`) and explicitly called it "not a launch blocker" — but for retention it IS the launch lever.

- **Lever:** 6 (one-more-round), 4 (later laps matter more — a spicy-lap done is where comebacks happen if we also pair with P1-1), 8 (variety — same pack feels different per lap).
- **Impact:** high · **Risk:** low (additive config field, defaults to `fixed-highest` = byte-identical current behaviour; deterministic, no new redaction surface).
- **Code scope:** `state.ts` — add `tierProgression:'fixed-highest'|'escalate'` to config (default `fixed-highest`). `truth-dare.ts` — `draw()` takes the allowed-tier window from `round` when `escalate`; fall-down still applies within the lap's window then upward on exhaustion. No view/redaction change.
- **Test impact:** extend `phases.test.ts` with escalate-tier-by-round determinism; verify `fixed-highest` path is unchanged (snapshot the existing decks). Pool-exhaustion fall-down still graceful.

---

#### P0-3 · Retune phase timers for pace (no new code, config-only)

**What:** `chooseMs 15 000 → 9 000`; `promptMs` split by intent — keep dares long, shorten truths. Since the module can't see choice at `phaseDurationMs` time for choose, the cleanest lever is: FUN `promptMs 45 000 → 38 000`, DRINK `promptMs 35 000 → 30 000` (truth-only answers are faster), `scoreMs 6 000 → 8 500` (FUN) / `7 000 → 8 500` (DRINK) to let the reveal breathe.

**Why:** `chooseMs 15 000` is dead air for a 2-tap decision (lever 9, 2/5); `scoreMs 6 000` starves the game's best beat (lever 3). This is pure number-tuning in the config consts — zero reducer risk.

- **Lever:** 9 (pace), 3 (reveal breathing room).
- **Impact:** med · **Risk:** low (config constants only; module already reads them via `phaseDurationMs`).
- **Code scope:** `state.ts` config consts only. No reducer, no view, no test logic (timing tests assert `phaseDurationMs(state) === config.x`, which stays true).
- **Test impact:** trivial — update any literal-ms assertions in `phases.test.ts`.

See §3 for the full per-phase ms table with rationale.

---

### P1 — high impact, higher risk (or med impact, low risk)

---

#### P1-1 · Comeback weighting on spicy laps (escalating active-turn value)

**What:** Done points scale with the lap's tier so later (spicier) laps are worth more: a `party`-lap done > `soft`-lap done. Concretely a small `tierBonus` map (soft +0, party +3, spicy +6) added in `donePoints()`. Pairs with P0-2.

**Why:** kills dead-rubber laps (lever 4, 2/5). With flat 10/15 points a trailing player mathematically can't close a gap; making the final lap worth ~50% more keeps the game live to the last turn AND rewards the player brave enough to take a spicy dare. It does NOT touch placement-XP fairness (internal scale only).

- **Lever:** 4 (tension/comeback), 6 (final lap is the climax).
- **Impact:** high · **Risk:** med (changes scoring balance; must re-baseline `scoring.test.ts`; could over-reward the late leader if not paired with P0-1 spectator catch-up — ship them together).
- **Code scope:** `state.ts` — add `tierBonus: Record<Intensity,number>` to config. `truth-dare.ts` — `donePoints()` adds `tierBonus[prompt.intensity]`. View already surfaces `intensity`, so the client can show "spicy turn = +6".
- **Test impact:** `scoring.test.ts` re-baseline for tier-weighted dones; assert `pass`/`chicken` unchanged.

---

#### P1-2 · Surface the verdict reveal as a named "the room called it" beat at `score` — WITHOUT breaking anti-griefing redaction

**What:** Today the tally is counts-only ("3 done / 2 chicken") — deliberately anonymous to prevent pile-ons. Keep that. But add a single aggregate **drama line** to `TdResult` the client renders big at score: e.g. when the vote was *close* (`|done-chicken| <= 1`) flag `contested:true`; when unanimous-against, flag `roasted:true`. This is a derived boolean off the already-public tally, not new private data.

**Why:** the payoff beat (lever 3, lever 5) currently auto-advances flat. A "split decision" / "the whole room called bullshit" stamp engineers the "ohhh" without naming voters (respecting the locked anti-griefing rule TK10/#10). Cheap, safe, high social fuel.

- **Lever:** 3 (payoff), 5 (social fuel).
- **Impact:** med · **Risk:** low (derived from existing public tally; no new redaction surface; no names — explicitly preserves the counts-only floor).
- **Code scope:** `state.ts` — extend `TdResult` with `contested`/`roasted` booleans (or a `dramaTag` enum). `truth-dare.ts` — compute in `resolveVerdict`/`toScore` from the tally. View change is additive.
- **Test impact:** `scoring.test.ts` — assert tags from sample tallies; redaction unchanged (still no per-voter map).

---

#### P1-3 · Make `verdict` reachable on pass/drink turns as a lightweight "react" beat (DRINK especially)

**What:** Today pass/drink skips verdict entirely → on those turns the room does nothing. Add an optional `reactOnEscape` config flag: when an escape is taken, instead of jumping straight to score, hold a short (8–10 s) **react** beat where non-active players tap a one-shot reaction (e.g. "ouch" / "respect" / "coward") that aggregates into a counts-only reaction bar at score. No scoring impact — pure social fuel and dead-time-kill on the ~30–50% of turns that currently give spectators nothing.

**Why:** drink turns are *visually* the spiciest moment ("they chose to drink rather than answer") and currently produce zero room interaction (lever 1, lever 5). A 9 s react beat turns the cowardice into a table event.

- **Lever:** 1 (dead time on escape turns), 5 (social fuel).
- **Impact:** med · **Risk:** med (new phase-ish beat; reuses verdict timer slot but needs a distinct `phaseKey` to not collide; must stay non-scoring to avoid weaponising the drink). Could ship as P2 if P0-1 already covers the spectator-void on escape turns (it does, partially — predictions resolve at score even on escape). **Decide after P0-1 ships.**
- **Code scope:** `state.ts` — `reactOnEscape:boolean` + a `react` phase or reuse `verdict` with an `outcome:'escaped'` mode; `actions.ts` add `{kind:'react'; emoji}` (fixed enum, no free text — moderation-safe); reactions HIDDEN in-flight, counts at score.
- **Test impact:** new phase tests + redaction for the reaction buffer.

---

### P2 — nice-to-have / experimental

---

#### P2-1 · "Double down" streak on the active player

**What:** Consecutive verdicted-done turns by the same player (across their laps) build a small personal streak shown on the rail; a 3-done streak grants a one-time tier-up choice ("take the spicy one for double points?"). Reducer state: `doneStreak: Record<PlayerId,number>`.

- **Lever:** 6 (one-more-round), 4 (but risks helping the leader — gate carefully).
- **Impact:** med · **Risk:** med-high (adds per-player reducer state; can amplify runaway leader; only ship if P0-1+P1-1 comeback proves insufficient in playtest).
- **Code scope:** `state.ts` streak map; `truth-dare.ts` increment/reset in `toScore`; view surfaces streak. **Test:** new streak tests.

#### P2-2 · `allowedChoices` mid-game flip / "dealer's choice" wildcard turns

**What:** Occasional seeded "wildcard" turn where the ROOM (not the active player) picks Truth or Dare for them — one extra branch on `choose`. Pure spice/variety.

- **Lever:** 8 (variety), 5 (social).
- **Impact:** low · **Risk:** med · **P2** — experimental, validate demand first.

---

## 3. Concrete phase timing proposals (ms)

| Phase | Game | Current ms | Proposed ms | Why |
|---|---|---:|---:|---|
| `choose` | FUN/LOVER | 15 000 | **9 000** | 2-tap decision; 15 s is pure dead air for the 5 non-active players. 9 s is enough to deliberate, still hard-stops dithering (timeout auto-pick coin unchanged). |
| `choose` | DRINK | 0 | **0** | Keep auto-skip (single `allowedChoices`). Do not touch. |
| `prompt` | FUN/LOVER | 45 000 | **38 000** | Dares need real perform time; 45 s drags on a truth. 38 s + the new P0-1 prediction beat keeps spectators busy through it. |
| `prompt` | DRINK | 35 000 | **30 000** | Truth-only answers resolve faster (you know your own secret); 30 s is plenty and tightens the interrogation. |
| `verdict` | FUN/LOVER | 20 000 | **14 000** | Early-resolves on `allActed` anyway; 20 s is the worst-case stall. 14 s with predictions pre-seeded (P0-1) means most are instant. |
| `verdict` | DRINK | 15 000 | **12 000** | Same logic, slightly tighter for the faster cadence. |
| `score` | FUN/LOVER | 6 000 | **8 500** | The reveal is the best beat (verdict tally + prediction results + drama tag). 6 s starves it; 8.5 s lets the "no way" land before auto-advance. |
| `score` | DRINK | 7 000 | **8 500** | Forfeit card + verdict + drama tag needs room to read. |
| `react` (P1-3, new) | DRINK | n/a | **9 000** | Only if P1-3 ships; non-scoring reaction beat on escape turns. |

All within the `templateParamsSchema(TRUTH_DARE)` safe ranges (choose 5–30k, prompt 20–90k, verdict 10–40k, score 4–12k) from `truth-or-dare-2.md` §6, so they can ship as host-tunable defaults later with no schema fight.

**Net per-turn (FUN, 6-player, contested done):** old worst-case ≈ 15+45+20+6 = 86 s → new ≈ 9+38+14+8.5 = **69.5 s**, with every spectator now acting in the 38 s prompt window instead of idling. Tighter AND more participatory.

---

## 4. Writing-polish priorities (where content is weak / AI-bland)

The mechanic is only half the joke (voice-guide §1.10). Content priorities, worst-first:

1. **LOVER deck coyness is the #1 kill risk (voice-guide §5.7: "at tier 2, ask the actual question").** The shipped 100 lover items are below max-room sizing AND the flagged failure mode is « quelque chose de coquin » hedging. **Priority: audit every `lov-*` item against the §1.12 AI-tell list** — kill « si tu te sens à l'aise », generic « coquin », consent-theater-in-card-text (consent lives in the 18+ gate, not the sentence). Each lover prompt must name a concrete detail and produce a room-judgeable face (the `lov-d-spicy-009` whisper-and-keep-a-straight-face pattern is the canonical structure — write MORE to that shape).

2. **DRINK questions must pass the "worth dodging" test (voice-guide §5.8).** Any truth-or-drink question nobody would ever drink to avoid is filler — cut it. Aim at named stakes: an ex in the room, group-chat treason, a body count, the worst drunk text. The escape is the drama; weak questions make the drink meaningless. Lint pass: for each `totd-t-*`, ask "would a real player tap « Je bois » rather than answer this?" — if no, rewrite or cut.

3. **FUN dares must be durational/infectious, not one-shot (voice-guide §5.7: "T-rex tier").** The retention win of FUN is a dare that *infects the session* (robot voice / T-rex arms until your next turn). Prioritise rewriting one-shot dares ("do a dance") into persistent bits the room keeps noticing — this directly feeds the new spice-escalation (P0-2) and prediction (P0-1) beats.

4. **Reveal/score UI copy is bland and must carry the new drama tags (P1-2).** Current stamps (`Fait ✅` / `Dégonflé 🐔` / `PASSÉ`) are fine but flat. The new `contested`/`roasted` tags need deadpan-ironic copy in the §1.8 register, lowercase, no hype, no 😂. e.g. close split → « égalité. la salle est divisée. débattez. » ; unanimous-against → « tout le monde a dit non. cheh. »

5. **Forfeit/drink stamps stay one-sip ceremonial** (`SANTÉ !`) — locked by the alcohol-excess lint; do not "improve" toward escalation.

### Example rewrites

**A. LOVER truth — the coyness fix (§5.7 / §1.1)**

> BEFORE: « Raconte quelque chose de coquin que tu as déjà fait. »
> AFTER (FR): « Le texto le plus cramé que t'as envoyé en étant à deux doigts de le regretter. Lis-le. La vraie version. »
> AFTER (EN, transcreated not translated): « the most unhinged text you've sent at 2am thinking it was a great idea. read it out. the real one. »

*Why:* names a concrete artifact (a text, a timestamp), targets the speaker as evidence, produces a room-judgeable verdict ("did they actually read the real one?"), zero coyness. Passes the §7 ship checklist.

**B. DRINK question — the "worth dodging" fix (§5.8 / §1.4)**

> BEFORE: « As-tu déjà eu un crush sur quelqu'un de ce groupe ? »
> AFTER (FR): « Quelqu'un dans cette pièce, tu y as déjà pensé un peu trop. Donne une initiale… ou bois. »
> AFTER (EN): « someone in this room has lived in your head rent free, and not in a normal way. one initial… or drink. »

*Why:* the original is a yes/no with an easy "no" escape hatch — dead. The rewrite is a direct room call-out (§1.4, the highest-value phrase in the genre), forces a real fork (expose an initial or visibly dodge), and the drink becomes the spicy option, not the cowardly one.

---

## 5. KEEP AS-IS (do not touch — already sticky)

- **The hidden-then-revealed verdict mechanic.** In-flight `verdicts` redaction → public counts-only `tally` at score is the engineered payoff and the anti-griefing floor simultaneously. P0-1/P1-2 build ON it; they must not expose per-voter names (TK10/#10 is locked for good reason).
- **Onboarding-by-doing (lever 7, 4/5).** Big T/D chips, drawn prompt, claim/escape buttons, room votes — the loop teaches itself. Don't add a tutorial; don't add rules text.
- **Voters-never-score for the VERDICT vote.** The verdict stays honest because the judges have no point stake in the outcome. P0-1 adds a *separate* prediction stake that resolves against truth, not against how you voted — this is deliberately NOT scoring the verdict itself. Keep that separation crisp.
- **Seeded determinism everywhere** (draw, rotation, auto-pick coin). Every new mechanic must stay seeded; no wall-clock, no ambient RNG.
- **Reject-invalid = same state reference.** Every `if (!cond) return NOOP(state)` guard is contract-load-bearing and audited (`actions.test.ts` same-reference checks). New actions (`predict`, `react`) MUST follow the identical pattern.
- **Disconnect/presence handling.** Active-leaves-mid-turn → chickened/skip, voter-leaves → resolve-on-whats-in, rotation-skips-disconnected. Never strand the room. New beats must inherit this (predictor leaves mid-prompt → their bet just doesn't resolve, no block).
- **Drink escape skips its own verdict by design** (the drink is physically visible; a vote on it is dead air — `truth-or-drink.md` #3). P1-3's react beat is reactions, NOT a verdict on the drink — keep that distinction.
- **Config-only sibling pattern.** LOVER and forfeit siblings are pure config diffs. Every new field added to `TruthDareConfig` must default to current behaviour so the siblings stay byte-untouched until they opt in.
- **Locked scoring constants are NOT host-tunable.** Keep `spectatorPoints`/`tierBonus` locked too, so placement-XP comparability (shell §2.2) holds.

---

## 6. Ship order (one paragraph)

Ship **P0-2 (escalation)** and **P0-3 (timers)** first — both are config-only/low-risk and immediately lift the two worst non-interactive levers (one-more-round, pace) with near-zero test churn. Then **P0-1 (call-your-shot predictions)** — the keystone that kills spectator dead-time and gives trailers a comeback hook, but needs the most careful redaction + scoring audit, so it goes after the safe wins are green. Pair **P1-1 (tier-weighted dones)** with P0-1 in the same release so escalation has scoring teeth without creating a runaway leader. **P1-2 (drama tags)** is a cheap, safe rider on any of the above. Defer **P1-3 (escape react beat)** and all P2 until playtest data shows whether P0-1 already closed the escape-turn void. Through all of it: the verdict redaction floor and the onboarding loop are untouchable.
