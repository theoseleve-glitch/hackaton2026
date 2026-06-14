# Retention-First Redesign — `secret-role` template (Double Jeu / Double Agent)

| | |
|---|---|
| **Template** | `secret-role` — `packages/games/secret-role` |
| **Module factory** | `createSecretRole(id, config)` — pure GameModule (`init/reduce/view/phaseDurationMs/phaseKey`) |
| **Games on template** | `double-jeu` (the only shipped config; `DOUBLE_JEU_CONFIG`) |
| **Roadmap configs on same module** | `the-impostor` (elimination/clue), `npc-infiltrator` (`secretKind:'directive'`) — GDD §3.3, NOT shipped; this brief is scoped to `double-jeu` but every change is written to stay config-safe for those |
| **Author** | senior party-game designer (retention pass) |
| **Grounded in** | `state.ts`, `secret-role.ts`, `actions.ts`, all 5 test files, `content/packs/double-jeu.json` (185 items), `final/games/double-jeu.md`, `2026-06-12-content-voice-guide.md`, GDD §2/§6 |

> **Note on a doc/code drift I found while grounding:** `double-jeu.md` §2 lists `secretRevealMs: 12_000` and `finalRevealMs: 12_000`, but the SHIPPED code (`state.ts` `DOUBLE_JEU_CONFIG`) and the phase-chain test (`phases.test.ts` line 43-49) both assert **7_000**. The code/tests are authoritative; the design doc is stale. All timing proposals below are deltas from the **real 7_000** values.

---

## 1. The EXACT current loop (from the reducer, not the doc)

Per match (`matchesPerSession: 3`, capped at pack size):

| # | Phase | Real duration | What EVERY player does | What the PHONE does |
|---|---|---|---|---|
| 1 | `secretReveal` | 7_000 ms, early-exit on all-ack | Tap once to peek `myItem` (`majority` for civilians, `impostor` decoy for the odd one — **no role flag**), then `ack` | Shows one word + theme. After your ack: **nothing** |
| 2 | `discuss` p0 | **120_000 ms**, early-exit on all-`ready` | Talk IRL. Optionally tap "ready to vote" | Shows theme + a `ready` checklist. **Zero interactive content for up to 2 minutes** |
| 3 | `vote` p0 | 25_000 ms | Tap one player (self-vote inert, first vote locks) | Shows `votableTargets` + `hasVoted` booleans. After you vote: **nothing**, no feedback |
| 4 | `verdict` p0 | 8_000 ms — **only if vote 1 missed** | Watch. Every action is inert (`phases.test.ts` line 77) | Shows the tally + the publicly-CLEARED top-accused ("Pas l'imposteur !") |
| 5 | `discuss` p1 | **90_000 ms**, early-exit on all-`ready` | Talk IRL again | Same dead `ready` checklist for up to 1.5 min |
| 6 | `vote` p1 | 25_000 ms | Tap one player | Same as vote p0 |
| 7 | `finalReveal` | 7_000 ms | Watch | The ONE payoff: impostor id + both words + winner + **all points revealed at once** (held hidden in `pendingPoints` until now) |
| — | `over` | `null` | — | Session standings, `gameOver(scores)` |

Worst case (vote-1 miss): 7+120+25+8+90+25+7 = **282 s (~4.7 min)** per match, ×3 matches = **~14 min session**.

### Scoring (all in HIDDEN `pendingPoints`, folded to `scores` only at `finalReveal`)
- Civilian: +1 per vote round their ballot hit the impostor (max +2).
- Team bonus: +2 if caught vote 1, +1 if caught vote 2.
- Impostor: +2 banked for surviving vote 1 (kept even if caught vote 2); +3 more for surviving vote 2 → **impostor win = 5**.
- Impostor disconnect mid-match → civilians +1 consolation, impostor 0.

**The deliberate, correct redaction reason scoring is hidden:** a visible mid-match +1 would out the impostor. This is load-bearing and must be preserved. (`secret-role.ts` lines 126-132; `redaction.test.ts` lines 119-142 audit it.)

---

## 2. Retention scorecard (0-5, evidence from real code)

| # | Lever | Score | Evidence |
|---|---|---|---|
| 1 | **No dead time** | **1** | The fatal flaw. `discussMs:120_000` + `discuss2Ms:90_000` = up to **3.5 min/match of phone doing nothing** but rendering a static theme card + a `ready` checklist. A passive/disconnected player (`allActed(connectedPlayers…)` lets the phase run without them) sits **completely idle**. In `vote`, after you tap, the phone gives zero feedback for the remaining 25 s. This is the single biggest retention leak on the template. |
| 2 | **Legible stakes & scoring** | **2** | `scores` is in `base` of every view, but it only *changes* at `finalReveal` — for an entire ~5-min match the scoreboard is frozen and nobody can compute who's winning (points are hidden by design). You know the *rules* (catch the odd one) but not your *position*. The reveal does dump exact `points` per player, which is good. |
| 3 | **Payoff beats** | **3** | `finalReveal` is a genuine "ohhh" — impostor id + both words land together (`MatchResult`). The `verdict` clearing ("Pas l'imposteur ! Présentez vos excuses.") is a real engineered beat. BUT both are *passive watch* screens with no per-player reaction input, and the 7_000 ms reveal is too short to savour a 2-word both-items drop + a full points table. |
| 4 | **Tension & comeback** | **3** | Structurally decent: impostor re-seeded every match (`pickImpostor` from a fresh shuffled `impostorPool[match]`), so no single player runs away as "always impostor". Vote-1 miss → angrier vote-2 is a real escalation. BUT a 3-match session is short, scores can spread (impostor win = 5 in one match vs civilian max 3), and there's **no catch-up mechanic** — a player who's last after match 1 has the same odds, not better. |
| 5 | **Social fuel** | **3** | The IRL accusation talk IS the fuel and the public clearing names a victim. BUT the app captures **none** of it: votes are hidden then shown only as anonymized tallies (`VoteRecord.tally`), never "p3 voted for YOU". The voice-guide's golden payoff — *« TOI t'as voté ça ?! »* (named ballots at reveal) — is explicitly thrown away here. Massive untapped social surface. |
| 6 | **One-more-round pull** | **2** | `matchesPerSession` ends the session flat into `over`; no streak, no escalating spice, no cliffhanger between matches. `secretReveal` of match N+1 is identical to match 1. Nothing *pulls* you into the next match except inertia. |
| 7 | **Onboarding by doing** | **3** | Genuinely strong: `secretReveal` teaches the whole game in one tap ("here's your word, nobody told you your role, go"). No rules wall. The weak link is that a first-timer in vote p0 has no idea what the buttons *do* until the reveal explains it 5 min later. |
| 8 | **Replay variety** | **4** | 185 items, 0 dup ids, 12 easy / 107 medium / 66 hard, shuffled per session. Deep and non-repeating. The constraint (3 matches/session) means you see ~1.6% of the pack per night — effectively infinite. This is the template's biggest strength. Theme copy is the variety carrier and it's mostly good. |
| 9 | **Pace per phase** | **1** | `vote`/`verdict`/`reveal` are fine; the two `discuss` phases are **2-4× too long for a phone-party rhythm** (GDD norm is tight beats; 120 s of dead phone is a platform outlier, flagged as a monitored risk in `double-jeu.md` §4 #11). The reveal (7 s) is conversely too *short* for the payload it carries. |

**Headline diagnosis:** the *mechanic* is sound and the *content depth* is excellent — the retention bleed is almost entirely **(a) dead phone time during 120/90 s discussions** and **(b) the app discarding the social payoff it manufactures** (hidden votes never surfaced as named accusations). Fix those two and this template jumps from "fine deduction game" to "sticky".

---

## 3. Retention redesign — proposed mechanic changes

Ordered by ship priority. Every change preserves: server-authority, seeded RNG, per-viewer redaction, same-state-ref rejection, no-runtime-AI, unit-testability.

### P0 — build first (high impact, low/med risk)

---

#### P0-1 · Cut the discussion timers HARD + add a phone-side debate spine

- **What:** Drop `discussMs` 120_000 → **75_000** and `discuss2Ms` 90_000 → **50_000** (keep p1 ≤ p0). Default. Host-tunable range already exists (`double-jeu.md` §6: p0 90-180 / p1 60-150) — **widen the floor** to p0 60-150 / p1 40-120 so the new defaults are in-range. The early-exit on all-`ready` is untouched, so loud groups still go faster.
- **Why (lever):** #1 no dead time, #9 pace. 120 s of idle phone is the #1 leak; party-game rhythm wants 45-75 s talk beats. This alone removes ~85 s/match of dead air without removing the IRL-talk fantasy.
- **Impact:** high · **Risk:** low (pure constant change; `phaseDurationMs` and the `discuss2Ms` branch already exist; the `hostTunable` widening is a catalog-range edit, no schema change).
- **Code scope:** `state.ts` `DOUBLE_JEU_CONFIG.discussMs/discuss2Ms`; host-tunable range lives in catalog/lobby allowlist (doc §6), not the module.
- **Test impact:** `phases.test.ts` line 43-49 asserts `['discuss:m0:p0', 120_000]` and `['discuss:m0:p1', 90_000]` — update both literals. No logic test changes.

> Pairs with P0-2 (a live debate spine) so the *shorter* discussion is also *less dead*.

---

#### P0-2 · "Pressure ticker" — a live suspicion nudge during discuss (no new input, no leak)

- **What:** During `discuss`, the view gains a deterministic, seeded **rotating prompt + a live "ready" pressure bar**. The prompt is a non-secret interrogation line drawn from the content pack's per-item `debatePrompts[]` (new offline-authored field, see §5), indexed by `seededIndex(seed, match, period, tickWindow)` — pure function of state, no wall-clock. The `ready` map already drives a count; surface it as *"3/5 locked in — clock's ticking"*. Optionally show **`votableTargets` as tappable "suspect" chips that pre-stage (not commit) a vote** so the moment `vote` opens the player already has a finger on a target.
- **Why (lever):** #1 dead time (phone now feeds the argument every few seconds), #5 social fuel (prompts are accusation-shaped: "Someone here described a place they've never been"), #6 (pressure bar = tension toward the vote).
- **Impact:** high · **Risk:** med — must NOT leak. Prompts are public-by-construction (same for all viewers, no role/word data); pre-staged suspect chips are a **client-only** UI affordance OR a new redaction-clean `stage` buffer that, like `votes`, never appears in any view except the owner's echo. Keep it client-only to start (zero redaction risk).
- **Code scope:** `state.ts` add `debatePrompts` to `SecretRoleItem` + `SecretRoleContent`; `secret-role.ts` `view()` discuss branch emits `debatePrompt: LText` + `readyCount/total`. If pre-stage is server-side: new `{kind:'stage', target}` action in `actions.ts` + a hidden `staged` map mirroring `votes` redaction.
- **Test impact:** new `phases`/`redaction` cases — assert the discuss view's `debatePrompt` is identical across ALL viewers (incl. impostor + spectator), is a pure function of `(seed, match, period)`, and carries no word/role substring. If staging is server-side, mirror the entire `votes`-hidden audit (`redaction.test.ts` lines 7-55) for `staged`.

---

#### P0-3 · Surface named ballots at `finalReveal` (the *« TOI t'as voté ça ?! »* payoff)

- **What:** The `MatchResult` reveal currently exposes only anonymized `VoteRecord.tally`. Add, **at finalReveal only** (post-resolution, fully public), a per-round **`ballots: Record<accuser, accused>`** so the client can render "p3 → YOU, p4 → the impostor". This is the single highest-value social moment the voice-guide names and the game currently throws away. It is **redaction-safe because the match is over** — votes are secret *during* the match (correctly), but at reveal the whole point is the named call-out.
- **Why (lever):** #5 social fuel (this is THE clip moment), #3 payoff, #6 (named drama pulls the next match).
- **Impact:** high · **Risk:** med — the only risk is leaking ballots *before* finalReveal. Gate strictly: `ballots` lives on `MatchResult` (built in `endMatch`), and `MatchResult` is only ever in the `finalReveal`/`over` view. The existing audit (`redaction.test.ts` lines 119-142) already proves pre-reveal views contain no ballots; extend it to prove `ballots` appears *only* from finalReveal on.
- **Code scope:** `state.ts` `VoteRecord` (or `MatchResult`) gains `ballots?: Record<PlayerId, PlayerId>`; capture raw `state.votes` into the record inside `resolveVote` (it's already in hand there) BEFORE clearing the buffer; `endMatch`/`view` pass it through only on `finalReveal`/`over`.
- **Test impact:** extend `redaction.test.ts` "impostor identity and pending points never surface before finalReveal" to also assert `ballots` is absent pre-reveal and present at finalReveal; add a `scoring`/`phases` case proving the reveal `ballots` matches the cast votes.

> **Decision note:** keep `tally` public-at-resolution as today (it drives the `verdict` clearing), but keep individual `ballots` hidden until `finalReveal`. Surfacing named ballots in the mid-match `verdict` WOULD out voting patterns and is rejected.

---

#### P0-4 · Stretch the reveal to fit its payload; split it into two beats

- **What:** `finalRevealMs` 7_000 → **9_000**. The reveal now carries impostor id + both words + winner + full points table + (P0-3) named ballots — 7 s can't land that. Client paces it as two beats off the single phase: "the odd word was X" (suspense) → "and the impostor was… [name] + everyone's points + who voted for whom". No new phase needed (avoids a `phaseKey` change), just a longer single window the client choreographs.
- **Why (lever):** #3 payoff (let the "no way" breathe), #2 legible scoring (time to read the points jump).
- **Impact:** med · **Risk:** low (one constant).
- **Code scope:** `state.ts` `finalRevealMs`.
- **Test impact:** `phases.test.ts` reveal duration literal (currently 7_000).

---

### P1 — high impact, higher risk (or med impact, low risk)

---

#### P1-1 · Comeback weighting — escalating stakes on later matches

- **What:** Make match 3 worth more, so a trailing player can still win the *night*. Add `matchScoreMultiplier?: number[]` to config (default `[1,1,1]` = today's behaviour, zero-risk opt-in). Set `double-jeu` to `[1, 1.5, 2]`: civilian/impostor awards in `resolveVote`/`endMatch` multiply by `cfg.matchScoreMultiplier[state.match] ?? 1`. Round to integers via a seeded-deterministic `Math.round` (pure).
- **Why (lever):** #4 tension & comeback (no dead-rubber match 3; the leader isn't safe), #6 one-more-round (the finale matters).
- **Impact:** high · **Risk:** med — changes the scoring surface that 8 scoring tests pin exactly. Defaulting the multiplier to `1` keeps every existing assertion green; only the `double-jeu` config flips it, so add NEW multiplier tests rather than rewriting the precise per-match expectations (which all run on match 0 where ×1).
- **Code scope:** `state.ts` config + `SecretRoleScoring` neighbour; `secret-role.ts` `resolveVote` (the 4 point-award sites) + `endMatch`/`impostorLeftEnd`.
- **Test impact:** existing `scoring.test.ts` cases are all match-0 (×1) → unaffected; add a 3-match case asserting match-2 points are ×2. Audit that hidden-points redaction is unchanged.

---

#### P1-2 · Streak + cliffhanger between matches (one-more-round engine)

- **What:** Track a session-level **civilian-vs-impostor streak** ("the room has caught 2 in a row — can the next impostor break the cold streak?"). Surface in the `finalReveal`/`over` view as `streak: {side, count}` derived from `state.results` (pure, no new state needed — fold over `results`). Client shows a cliffhanger card on the finalReveal→next-match transition ("Match 3. The hunters are 2-0. One impostor left to even the score.").
- **Why (lever):** #6 one-more-round pull (the explicit gap today), #4 narrative tension across matches.
- **Impact:** high · **Risk:** low — `streak` is a *derived* read over the already-public `results` array; no hidden state, no redaction surface, fully deterministic.
- **Code scope:** `secret-role.ts` `view()` finalReveal/over branches compute `streak` from `state.results`; `state.ts` view types add `streak`.
- **Test impact:** a small `phases`/`view` case asserting streak counts across a 3-match deadline walk. No reducer logic change → existing tests untouched.

---

#### P1-3 · Live "heat" feedback in `vote` (kill the post-tap dead 25 s) without leaking targets

- **What:** Today after you vote, the phone shows static `hasVoted` booleans for up to 25 s. Add a redaction-safe **"heat" signal**: the count of how many ballots are in, plus a deterministic non-leaking flavour line ("4 locked. Someone's sweating."). Crucially **do NOT** reveal direction. Optionally show *your own* locked target back with bite ("You called it on [name]. No takebacks.") — `myVote` echo already exists.
- **Why (lever):** #1 dead time (the back half of vote is currently dead), #5 social fuel (the room watches the count climb).
- **Impact:** med · **Risk:** med — temptation to leak vote direction; the guardrail is that only the *count* (already derivable from public `hasVoted`) and the *owner's own echo* (already in view) are used. No new secret exposed; this is a copy/UX layer over existing redaction-clean fields.
- **Code scope:** `secret-role.ts` `view()` vote branch adds `lockedCount` + a seeded `voteFlavour: LText`; `state.ts` view type.
- **Test impact:** redaction case proving the vote view still leaks no `votes` map and the flavour line is viewer-identical + word/target-free.

---

### P2 — nice-to-have / experimental

---

#### P2-1 · Caught-impostor steal-back guess (the roadmap'd `impostorGuessEnabled`)

- **What:** Flip the already-designed `impostorGuessEnabled:true` (`double-jeu.md` §7): a ~15 s post-catch sub-phase where the caught impostor taps to guess the **civilian word** from a multiple-choice of decoys (NOT free text — keep zero-moderation), for steal-back points. Multiple-choice keeps `actions.ts` text-free (the §7 spec assumed free text + moderation; **avoid that** by making it a tap from N seeded options).
- **Why (lever):** #3 payoff (a second twist), #4 comeback (impostor isn't dead on catch), #6.
- **Impact:** med · **Risk:** high — new phase = new `phaseKey` entry, new action, new redaction surface (the decoy options must not reveal the real word ordering), new scoring branch. Genuinely a feature, not a tune.
- **Code scope:** new phase in `SecretRolePhase`, `phaseKey`/`phaseDurationMs`, a `{kind:'guess', choice}` action, a scoring constant, a new view variant + redaction audit.
- **Test impact:** large — new phase chain test, new scoring test, new redaction test for the option set. Defer until P0/P1 ship and analytics justify it.

---

#### P2-2 · Closeness-aware difficulty ramp within a session

- **What:** `init` currently `shuffle`s items uniformly. Make the per-session 3 items ramp **easy → medium → hard** using the offline `closeness` field (drop it into runtime `SecretRoleItem` — currently stripped). Seeded bucket-pick, fully deterministic.
- **Why (lever):** #4 tension (later matches genuinely harder), #6 (escalation arc), #8 (intentional curve > random).
- **Impact:** med · **Risk:** med — changes `init` item selection (determinism preserved via seeded bucketing, but `phases.test.ts` line 8-12 asserts same-seed → same order; bucketed pick is still deterministic, just update the helper pack which currently has no `closeness`).
- **Code scope:** `state.ts` `SecretRoleItem` gains `closeness`; `secret-role.ts` `init` buckets+picks instead of plain shuffle.
- **Test impact:** `phases.test.ts` init determinism still holds (seeded); add a ramp-order assertion; test `helpers.ts` `item()` needs a `closeness`.

---

## 4. Keep AS-IS (do NOT touch — already sticky / load-bearing)

Change-for-its-own-sake would hurt these:

1. **`revealRoleToSelf:false` — nobody is told their role.** This IS the game's signature ("paranoia noir", double-doubt). The impostor discovering they're odd *by listening* is the whole fantasy. Touching it kills the product.
2. **Hidden `pendingPoints` until `finalReveal`.** A visible mid-match +1 outs the impostor. This is correct, tested (`redaction.test.ts` 119-142), and non-negotiable. (P0-2/P1-3 are explicitly built around NOT touching it.)
3. **The `verdict` public clearing** ("Pas l'imposteur ! Présentez vos excuses."). Real engineered vindication beat; the wrongly-accused payoff fuels the angrier round 2. Keep. (Keep `verdictMode:'clear'` default; the `tally-only` fallback param stays as the §4 #12 safety valve.)
4. **`uniquePlurality` → ties favour the impostor, no revote/tiebreak.** Deterministic, dramatic, intentional (§4 #14). A random tiebreak would betray the seeded-RNG contract and the "coordinated impostor can engineer a tie" feature.
5. **Ghost-proof impostor seeding (`pickImpostor` = first connected in `impostorPool[match]`) + `impostorLeftEnd`.** Correct, subtle, tested. Never hunt a ghost. Don't refactor.
6. **First-vote-locks + self-vote-inert + same-state-ref rejection.** Clean, audited, contract-correct.
7. **The 185-item pack depth + per-match impostor re-seed.** The replay-variety and anti-runaway-leader strengths (lever #8, #4). Add content, don't restructure.
8. **`secretReveal` single-tap onboarding.** The zero-rules teach-by-doing. Don't add a tutorial.

---

## 5. Writing-polish priorities (content sharpening)

The pack is the template's strength (lever #8 = 4/5) but it's **uneven against the voice guide**, and the mechanic leaves spice on the table.

### 5.1 Where the content is strong (keep the register)
The best **theme** lines already nail voice-guide §1.1 (specificity) and §5.6 (paranoia noir): *"Huit parts, six personnes, un traître"* / *"eight slices, six people. someone's lying."* (`pizza-margherita-pepperoni`), *"Disparu du frigo de mamie. Aucun suspect."* / *"last seen in nan's fridge. no witnesses."* (`dessert-cremebrulee-flan`). These are the model — interrogation-framed, specific, a crime implied.

### 5.2 Where it's weak / blandly-AI (fix these)
- **~30-40% of themes are flat descriptors, not accusations.** *"Pour ceux qui trouvent le café « trop amer »"* and *"a dessert pretending to be a coffee order"* (`hotdrink-chocolat-chailatte`) are *cute*, not *menacing* — they describe the noun instead of pointing a finger at the room. Voice-guide §0: a line must "expose someone in the room, force an indefensible choice, or start an argument." A descriptor does none.
- **The EN/FR pairs are often translations, not transcreations** (§6 violation). `winterfruit-clementine-mandarine`: FR *"Ton seul apport en vitamines depuis novembre"* ↔ EN *"the whole of your five-a-day since november"* — same joke, translated. Fine, but several are weaker in one locale. Audit for native-smell.
- **No `debatePrompts` exist** — the discuss phase has zero authored interrogation lines (the gap P0-2 fills). This is the biggest *new* content need: ~3-5 public, accusation-shaped, word-agnostic prompts per item (or a shared pool indexed seededly).

### 5.3 Spice-curve note
`double-jeu` is correctly `spicyLevel:0` and **should stay so** (`double-jeu.md` §5: a lewd impostor word breaks the "deliberately-close neutral noun" invariant — agreed, do not add a spicy pack). The spice belongs **entirely in the theme + debate-prompt copy** (§5 "the menace lives in the public theme copy"), which can go to the top of spicy-0 (betrayal, money, exposure — never sex). The current pack under-uses this: most themes are food-cosy, not socially-dangerous. Push themes toward the *"Qui vendrait LA photo dossier du groupe pour 50 balles"* register the voice-guide calls a perfect spicy-0 line.

### 5.4 Concrete rewrites

**Example A — sharpen a flat descriptor theme into an accusation (item `hotdrink-chocolat-chailatte`):**
- BEFORE FR: *"Pour ceux qui trouvent le café « trop amer »"*  → describes the drink, accuses nobody.
- AFTER FR: *"Quelqu'un ici a commandé ça en réunion. On sait pas qui. On juge."*  → call-out the room (§1.4), interrogation frame (§5.6), votable.
- AFTER EN (transcreated, not translated): *"someone in this room orders this unironically. the table will decide who."*

**Example B — a new `debatePrompt` for the discuss phase (P0-2), word-agnostic so it never leaks, paranoia-noir register:**
- FR: *"Regarde la personne à ta gauche. Elle a dit son mot trop vite ou pas assez ?"*  → forces eye-contact, manufactures suspicion, contains zero word/role data.
- EN: *"the person who explained the LEAST is either innocent or very, very good. discuss."*  → public, viewer-identical, accusation-shaped, leak-proof by construction.

**Polish priority order:** (1) author the `debatePrompts` pool (blocks P0-2, the biggest retention win) → (2) rewrite the ~60 flattest descriptor themes into accusations → (3) per-locale native-smell audit of the EN/FR pairs → (4) refresh topical theme references on content-ops cadence (the nouns are evergreen; the theme references age).

---

## 6. Timing summary (proposed ms per phase)

| Phase | Current (real, ms) | Proposed (ms) | Why |
|---|---|---|---|
| `secretReveal` | 7_000 | 7_000 (keep) | One tap; early-exit covers fast rooms. Fine. |
| `discuss` p0 | 120_000 | **75_000** (P0-1) | 120 s of dead phone is the #1 leak; 75 s + a live debate spine (P0-2) holds energy. |
| `vote` p0 | 25_000 | 25_000 (keep) | Right length for a deliberate accusation; back-half deadness fixed by P1-3 copy, not by cutting time. |
| `verdict` p0 | 8_000 | 8_000 (keep) | Tally + clearing reads in ~8 s. Fine. |
| `discuss` p1 | 90_000 | **50_000** (P0-1) | The cleared-suspect info accelerates deduction; 50 s is plenty and keeps p1 < p0. |
| `vote` p1 | 25_000 | 25_000 (keep) | Same as p0. |
| `finalReveal` | 7_000 | **9_000** (P0-4) | Now carries both words + winner + full points + named ballots; 7 s can't land it. |

Net worst-case match: 282 s → **~199 s (~3.3 min)**; 3-match session **~14 min → ~10 min**, denser and with zero dead phone. Host-tunable floor widened so quiet groups can go even tighter.

---

## 7. Ship order (one line each)

1. **P0-1** cut discuss timers (75/50) + widen host-tunable floor — instant dead-time kill, one constant change.
2. **P0-2** debate spine (rotating public prompt + ready pressure) — fills the now-shorter discussion; needs `debatePrompts` content (§5.4).
3. **P0-3** named ballots at finalReveal — the *« TOI t'as voté ça ?! »* payoff the game currently discards.
4. **P0-4** reveal 7→9 s, client splits into two beats.
5. **P1-2** derived streak + cliffhanger card (low risk, pure read) — one-more-round pull.
6. **P1-1** match-score multiplier `[1,1.5,2]` (opt-in default `[1,1,1]`) — comeback / no dead-rubber finale.
7. **P1-3** vote "heat" copy — kill the post-tap dead 25 s.
8. **P2-1 / P2-2** steal-back guess + closeness ramp — after analytics.

All changes are unit-testable and redaction-auditable; none violate the pure-GameModule contract, seeded-RNG, or the no-runtime-AI rule.
